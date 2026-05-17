"""
╔══════════════════════════════════════════════════════════════╗
║  Resolvia — Python Flask Backend                             ║
║  Customer Complaint Management System                        ║
║  Batangas State University · CICS                            ║
║                                                              ║
║  Routes:                                                     ║
║    /api/auth        — login, register, logout                ║
║    /api/complaints  — CRUD for complaint tickets             ║
║    /api/staff       — staff management                       ║
║    /api/feedback    — customer feedback                      ║
║    /api/reports     — analytics & dashboard stats            ║
║    /api/notifications — notification log                     ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import bcrypt
from datetime import timedelta, date
from dotenv import load_dotenv

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity, get_jwt
)
import mysql.connector
from mysql.connector import pooling

# ── Load .env ─────────────────────────────────────────────────
load_dotenv()

# ── App setup ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5000", "http://127.0.0.1:5000"]}})

app.config["JWT_SECRET_KEY"]           = os.getenv("JWT_SECRET_KEY", "dev-secret-key-32chars!!")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=8)
app.config["JWT_DECODE_ALGORITHMS"]    = ["HS256"]
app.config["JWT_ALGORITHM"]            = "HS256"

jwt     = JWTManager(app)
limiter = Limiter(get_remote_address, app=app, default_limits=[])

# ── Database connection pool ───────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 3306)),
    "database": os.getenv("DB_NAME", "resolvia_db"),
    "user":     os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
}

try:
    db_pool = pooling.MySQLConnectionPool(
        pool_name="resolvia_pool",
        pool_size=5,
        **DB_CONFIG
    )
    print("✅  Database pool created successfully.")
except mysql.connector.Error as err:
    print(f"⚠️  Could not connect to database: {err}")
    db_pool = None


def get_db():
    """Get a connection from the pool."""
    if db_pool is None:
        raise RuntimeError("Database pool not initialised. Check your .env settings.")
    return db_pool.get_connection()


def query(sql, params=None, fetchone=False, commit=False):
    """
    Helper: run a SQL statement and return results.
    For SELECT  → list of dicts (or single dict if fetchone=True)
    For INSERT  → last inserted row id
    For UPDATE/DELETE → rows affected
    """
    conn = get_db()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute(sql, params or ())
        if commit:
            conn.commit()
            return cur.lastrowid if cur.lastrowid else cur.rowcount
        if fetchone:
            return cur.fetchone()
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# ══════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def ok(data=None, msg="Success", status=200):
    payload = {"ok": True, "message": msg}
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def err(msg="Error", status=400):
    return jsonify({"ok": False, "message": msg}), status


def serialize_row(r):
    """Convert date/datetime fields to strings in a dict."""
    for k, v in r.items():
        if isinstance(v, date):
            r[k] = v.isoformat()
        elif hasattr(v, 'strftime'):
            r[k] = str(v)
    return r


# ══════════════════════════════════════════════════════════════
#  AUTH  —  /api/auth
# ══════════════════════════════════════════════════════════════

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    """
    Login for both admin/staff (admin_accounts) and customers (customer_accounts).
    POST body: { "username": "...", "password": "...", "mode": "admin" | "customer" }
    Returns: { token, name, role }
    """
    body     = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    mode     = body.get("mode", "customer")

    if not username or not password:
        return err("Username and password are required.")

    if mode == "admin":
        user = query(
            "SELECT * FROM admin_accounts WHERE username = %s",
            (username,), fetchone=True
        )
        if not user or not check_password(password, user["password_hash"]):
            return err("Invalid credentials.", 401)
        identity = {
            "id":       user["account_id"],
            "username": user["username"],
            "name":     user["full_name"],
            "role":     user["role"],
            "mode":     "admin"
        }
    else:
        user = query(
            "SELECT * FROM customer_accounts WHERE username = %s",
            (username,), fetchone=True
        )
        if not user or not check_password(password, user["password_hash"]):
            return err("Invalid credentials.", 401)
        identity = {
            "id":       user["customer_id"],
            "username": user["username"],
            "name":     user["full_name"],
            "email":    user["email"],
            "role":     "Customer",
            "mode":     "customer"
        }

    token = create_access_token(identity=str(identity["id"]), additional_claims=identity)
    return ok({
        "token": token,
        "name":  identity["name"],
        "role":  identity["role"],
        "mode":  identity["mode"]
    })


@app.route("/api/auth/register", methods=["POST"])
def register():
    """
    Register a new customer account.
    POST body: { "username", "password", "full_name", "email" }
    """
    body      = request.get_json(silent=True) or {}
    username  = (body.get("username") or "").strip()
    password  = body.get("password") or ""
    full_name = (body.get("full_name") or "").strip()
    email     = (body.get("email") or "").strip()

    if not all([username, password, full_name, email]):
        return err("All fields are required.")
    if len(password) < 8:
        return err("Password must be at least 8 characters.")

    existing = query(
        "SELECT customer_id FROM customer_accounts WHERE username=%s OR email=%s",
        (username, email), fetchone=True
    )
    if existing:
        return err("Username or email already in use.")

    pw_hash = hash_password(password)
    query(
        "INSERT INTO customer_accounts (username, password_hash, full_name, email) VALUES (%s,%s,%s,%s)",
        (username, pw_hash, full_name, email), commit=True
    )
    return ok(msg="Account created. You can now log in.", status=201)


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def me():
    """Return current logged-in user info."""
    return ok(get_jwt_identity())


# ══════════════════════════════════════════════════════════════
#  COMPLAINTS  —  /api/complaints
# ══════════════════════════════════════════════════════════════

@app.route("/api/complaints", methods=["GET"])
@jwt_required()
def list_complaints():
    """
    GET /api/complaints
    Query params: status, type, priority, search, limit, offset
    Customers only see their own tickets.
    """
    identity = get_jwt_identity()
    params   = request.args

    where_clauses = []
    values        = []

    if identity["mode"] == "customer":
        where_clauses.append("customer_email = %s")
        values.append(identity.get("email", ""))

    if params.get("status"):
        where_clauses.append("status = %s")
        values.append(params["status"])
    if params.get("type"):
        where_clauses.append("complaint_type = %s")
        values.append(params["type"])
    if params.get("priority"):
        where_clauses.append("priority = %s")
        values.append(params["priority"])
    if params.get("search"):
        where_clauses.append("(LOWER(ref_number) LIKE LOWER(%s) OR LOWER(customer_name) LIKE LOWER(%s) OR LOWER(subject) LIKE LOWER(%s) OR LOWER(customer_email) LIKE LOWER(%s))")
        like = f"%{params['search']}%"
        values += [like, like, like, like]

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    limit  = int(params.get("limit", 50))
    offset = int(params.get("offset", 0))

    sql = f"""
        SELECT * FROM v_complaints_full
        {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    values += [limit, offset]

    rows = query(sql, values)
    rows = [serialize_row(r) for r in rows]
    return ok(rows)


@app.route("/api/complaints/<ref>", methods=["GET"])
@jwt_required()
def get_complaint(ref):
    """GET /api/complaints/<ref> — fetch single ticket with audit trail."""
    complaint = query(
        "SELECT * FROM v_complaints_full WHERE ref_number = %s",
        (ref,), fetchone=True
    )
    if not complaint:
        return err("Ticket not found.", 404)

    complaint = serialize_row(complaint)

    complaint_id_row = query(
        "SELECT complaint_id FROM complaints WHERE ref_number = %s",
        (ref,), fetchone=True
    )
    audit = []
    if complaint_id_row:
        audit = query(
            "SELECT audit_entry, recorded_at FROM complaint_audit_trail WHERE complaint_id=%s ORDER BY recorded_at ASC",
            (complaint_id_row["complaint_id"],)
        )
        for a in audit:
            a["recorded_at"] = str(a["recorded_at"])

    complaint["audit_trail"] = audit
    return ok(complaint)


@app.route("/api/complaints", methods=["POST"])
def submit_complaint():
    """
    POST /api/complaints — public endpoint, no auth required.
    Body: { customer_name, customer_email, type, subject, description, priority? }
    Calls stored procedure sp_submit_complaint.
    """
    body     = request.get_json(silent=True) or {}
    name     = (body.get("customer_name") or "").strip()
    email    = (body.get("customer_email") or "").strip()
    ctype    = (body.get("type") or "").strip()
    subj     = (body.get("subject") or "").strip()
    desc     = (body.get("description") or "").strip()
    priority = (body.get("priority") or "Medium").strip()

    if len(desc) > 2000:
        return err("Description must be under 2000 characters.")
    if len(subj) > 255:
        return err("Subject must be under 255 characters.")

    if not all([name, email, ctype, subj, desc]):
        return err("All fields (name, email, type, subject, description) are required.")

    # Validate type dynamically from database
    valid_types_rows = query("SELECT type_name FROM complaint_types")
    valid_types = [r["type_name"] for r in valid_types_rows]
    if ctype not in valid_types:
        return err(f"Invalid complaint type. Must be one of: {', '.join(valid_types)}")

    # Validate priority dynamically from database
    valid_priority_rows = query("SELECT priority_name FROM priority_levels")
    valid_priorities = [r["priority_name"] for r in valid_priority_rows]
    if priority not in valid_priorities:
        priority = "Medium"

    # Call stored procedure: name, email, type, priority, subject, description, customer_id, OUT ref
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.callproc("sp_submit_complaint", [name, email, ctype, priority, subj, desc, None, ""])
        conn.commit()
        ref_number  = None
        assigned_to = None
        for result in cur.stored_results():
            row = result.fetchone()
            if row:
                ref_number  = row[0]
                assigned_to = row[1] if len(row) > 1 else None
    finally:
        cur.close()
        conn.close()

    return ok({"ref": ref_number, "assigned_to": assigned_to}, "Complaint submitted successfully.", 201)




@app.route("/api/complaints/all", methods=["GET"])
@jwt_required()
def list_all_complaints():
    """
    GET /api/complaints/all — returns ALL complaints regardless of user.
    Used by the customer All Tickets page.
    """
    params = request.args
    where_clauses = []
    values        = []

    if params.get("status"):
        where_clauses.append("status = %s")
        values.append(params["status"])
    if params.get("type"):
        where_clauses.append("complaint_type = %s")
        values.append(params["type"])
    if params.get("priority"):
        where_clauses.append("priority = %s")
        values.append(params["priority"])
    if params.get("search"):
        where_clauses.append("(LOWER(ref_number) LIKE LOWER(%s) OR LOWER(customer_name) LIKE LOWER(%s) OR LOWER(subject) LIKE LOWER(%s) OR LOWER(customer_email) LIKE LOWER(%s))")
        like = f"%{params['search']}%"
        values += [like, like, like, like]

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    limit  = int(params.get("limit", 50))
    offset = int(params.get("offset", 0))

    sql = f"""
        SELECT * FROM v_complaints_full
        {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    values += [limit, offset]
    rows = query(sql, values)
    rows = [serialize_row(r) for r in rows]
    return ok(rows)


@app.route("/api/complaints/mine", methods=["GET"])
@jwt_required()
def list_my_complaints():
    """
    GET /api/complaints/mine — returns only the logged-in customer's complaints.
    For admin, returns all complaints.
    """
    identity = get_jwt()
    params   = request.args

    where_clauses = []
    values        = []

    if identity.get("mode") == "customer":
        email = identity.get("email", "")
        if email:
            where_clauses.append("customer_email = %s")
            values.append(email)

    if params.get("search"):
        where_clauses.append("(LOWER(ref_number) LIKE LOWER(%s) OR LOWER(subject) LIKE LOWER(%s) OR LOWER(customer_name) LIKE LOWER(%s))")
        like = f"%{params['search']}%"
        values += [like, like, like]

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    limit  = int(params.get("limit", 200))
    offset = int(params.get("offset", 0))

    sql = f"""
        SELECT * FROM v_complaints_full
        {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    values += [limit, offset]
    rows = query(sql, values)
    rows = [serialize_row(r) for r in rows]
    return ok(rows)

@app.route("/api/complaints/<ref>", methods=["PUT"])
@jwt_required()
def update_complaint(ref):
    """
    PUT /api/complaints/<ref> — update status, priority, notes, assigned staff.
    Admin/staff only.
    """
    identity = get_jwt_identity()
    if identity["mode"] != "admin":
        return err("Admin access required.", 403)

    body = request.get_json(silent=True) or {}

    existing = query(
        "SELECT complaint_id FROM complaints WHERE ref_number=%s", (ref,), fetchone=True
    )
    if not existing:
        return err("Ticket not found.", 404)
    cid = existing["complaint_id"]

    updates = []
    values  = []

    if "status" in body:
        status_row = query(
            "SELECT status_id FROM ticket_statuses WHERE status_name=%s",
            (body["status"],), fetchone=True
        )
        if not status_row:
            return err("Invalid status value.")

        current = query(
            "SELECT ts.status_name FROM complaints c JOIN ticket_statuses ts ON ts.status_id = c.status_id WHERE c.complaint_id=%s",
            (cid,), fetchone=True
        )
        current_status = current["status_name"]
        new_status     = body["status"]

        # Admin can freely change status; staff must follow order
        is_admin = identity.get("role") == "Administrator"
        if not is_admin:
            backward = {
                "In Progress": ["Pending"],
                "Resolved":    ["Pending", "In Progress"]
            }
            if new_status in backward.get(current_status, []):
                return err(f"Cannot move ticket backward from '{current_status}' to '{new_status}'.")
            allowed_staff = {
                "Pending":     ["In Progress"],
                "In Progress": ["Resolved"],
                "Resolved":    []
            }
            if new_status not in allowed_staff.get(current_status, []):
                return err(f"Cannot move ticket from '{current_status}' to '{new_status}'.")

        updates.append("status_id = %s")
        values.append(status_row["status_id"])

    if "priority" in body:
        pri_row = query(
            "SELECT priority_id FROM priority_levels WHERE priority_name=%s",
            (body["priority"],), fetchone=True
        )
        if not pri_row:
            return err("Invalid priority value.")
        updates.append("priority_id = %s")
        values.append(pri_row["priority_id"])

    if "resolution_notes" in body:
        updates.append("resolution_notes = %s")
        values.append(body["resolution_notes"])

    if "assigned_staff_id" in body:
        updates.append("assigned_staff_id = %s")
        values.append(body["assigned_staff_id"])

    if not updates:
        return err("No valid fields to update.")

    values.append(cid)
    query(f"UPDATE complaints SET {', '.join(updates)} WHERE complaint_id=%s", values, commit=True)

    # Audit trail
    actor = identity.get("name", identity["username"])

    if "assigned_staff_id" in body:
        staff_row  = query(
            "SELECT staff_name FROM staff WHERE staff_id=%s",
            (body["assigned_staff_id"],), fetchone=True
        )
        staff_name = staff_row["staff_name"] if staff_row else f"Staff ID {body['assigned_staff_id']}"
        query(
            "INSERT INTO complaint_audit_trail (complaint_id, audit_entry, created_by) VALUES (%s,%s,%s)",
            (cid, f"Reassigned to {staff_name} by {actor}", identity["username"]), commit=True
        )

    other_fields = [k for k in body if k in ["status", "priority", "resolution_notes"]]
    if other_fields:
        note = f"Updated by {actor}: {', '.join(other_fields)}"
        query(
            "INSERT INTO complaint_audit_trail (complaint_id, audit_entry, created_by) VALUES (%s,%s,%s)",
            (cid, note, identity["username"]), commit=True
        )

    return ok(msg="Complaint updated.")


@app.route("/api/complaints/<ref>/rate", methods=["POST"])
@jwt_required()
def rate_complaint(ref):
    """POST /api/complaints/<ref>/rate — customer submits satisfaction rating."""
    body   = request.get_json(silent=True) or {}
    rating = body.get("rating")
    if rating not in [1, 2, 3, 4, 5]:
        return err("Rating must be an integer 1–5.")

    existing = query(
        "SELECT complaint_id FROM complaints WHERE ref_number=%s", (ref,), fetchone=True
    )
    if not existing:
        return err("Ticket not found.", 404)

    query(
        "UPDATE complaints SET satisfaction_rating=%s WHERE complaint_id=%s",
        (rating, existing["complaint_id"]), commit=True
    )
    return ok(msg="Rating submitted.")


@app.route("/api/complaints/<ref>", methods=["DELETE"])
@jwt_required()
def delete_complaint(ref):
    """DELETE /api/complaints/<ref> — admin only."""
    identity = get_jwt_identity()
    if identity["mode"] != "admin":
        return err("Admin access required.", 403)

    rows = query("DELETE FROM complaints WHERE ref_number=%s", (ref,), commit=True)
    if rows == 0:
        return err("Ticket not found.", 404)
    return ok(msg="Complaint deleted.")


# ══════════════════════════════════════════════════════════════
#  LOOKUP TABLES  —  /api/lookup
# ══════════════════════════════════════════════════════════════

@app.route("/api/lookup/complaint-types", methods=["GET"])
def get_complaint_types():
    """GET /api/lookup/complaint-types — public, returns all complaint types."""
    rows = query("SELECT type_name, routing_dept FROM complaint_types ORDER BY type_name")
    return ok(rows)


@app.route("/api/lookup/priorities", methods=["GET"])
def get_priorities():
    """GET /api/lookup/priorities — public, returns all priority levels."""
    rows = query("SELECT priority_name FROM priority_levels ORDER BY sort_order")
    return ok(rows)


@app.route("/api/lookup/departments", methods=["GET"])
def get_departments():
    """GET /api/lookup/departments — public, returns all departments."""
    rows = query("SELECT dept_name FROM departments ORDER BY dept_name")
    return ok(rows)


# ══════════════════════════════════════════════════════════════
#  STAFF  —  /api/staff
# ══════════════════════════════════════════════════════════════

@app.route("/api/staff", methods=["GET"])
@jwt_required()
def list_staff():
    """GET /api/staff — list all staff members with department info."""
    rows = query("""
        SELECT s.staff_id, s.staff_name, d.dept_name, ct.type_name AS handles_type,
               s.is_active, s.created_at
        FROM staff s
        JOIN departments    d  ON d.dept_id  = s.dept_id
        JOIN complaint_types ct ON ct.type_id = s.handles_type_id
        ORDER BY s.staff_name
    """)
    for r in rows:
        r["created_at"] = str(r["created_at"])
    return ok(rows)


@app.route("/api/staff/<int:staff_id>", methods=["GET"])
@jwt_required()
def get_staff(staff_id):
    """GET /api/staff/<id> — single staff record with workload."""
    row = query(
        "SELECT * FROM v_staff_workload WHERE staff_id=%s", (staff_id,), fetchone=True
    )
    if not row:
        return err("Staff member not found.", 404)
    return ok(row)


@app.route("/api/staff", methods=["POST"])
@jwt_required()
def create_staff():
    """POST /api/staff — create a new staff member (admin only)."""
    identity = get_jwt_identity()
    if identity["mode"] != "admin":
        return err("Admin access required.", 403)

    body      = request.get_json(silent=True) or {}
    name      = (body.get("staff_name") or "").strip()
    dept_name = (body.get("dept_name") or "").strip()
    type_name = (body.get("handles_type") or "").strip()

    if not all([name, dept_name, type_name]):
        return err("staff_name, dept_name, and handles_type are required.")

    dept = query("SELECT dept_id FROM departments WHERE dept_name=%s", (dept_name,), fetchone=True)
    if not dept:
        return err(f"Department '{dept_name}' not found.")

    ctype = query("SELECT type_id FROM complaint_types WHERE type_name=%s", (type_name,), fetchone=True)
    if not ctype:
        return err(f"Complaint type '{type_name}' not found.")

    new_id = query(
        "INSERT INTO staff (staff_name, dept_id, handles_type_id) VALUES (%s,%s,%s)",
        (name, dept["dept_id"], ctype["type_id"]), commit=True
    )
    return ok({"staff_id": new_id}, "Staff member created.", 201)


@app.route("/api/admin/accounts", methods=["POST"])
@jwt_required()
def create_admin_account():
    """POST /api/admin/accounts — create a new admin or staff account (admin only)."""
    identity = get_jwt_identity()
    if identity["mode"] != "admin" or identity["role"] != "Administrator":
        return err("Administrator access required.", 403)

    body     = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()
    fullname = (body.get("full_name") or "").strip()
    email    = (body.get("email") or "").strip() or None
    role     = (body.get("role") or "Administrator").strip()
    staff_id = body.get("staff_id") or None

    if not all([username, password, fullname]):
        return err("username, password, and full_name are required.")

    existing = query(
        "SELECT account_id FROM admin_accounts WHERE username=%s",
        (username,), fetchone=True
    )
    if existing:
        return err(f"Username '{username}' is already taken.")

    pw_hash = hash_password(password)
    new_id  = query(
        "INSERT INTO admin_accounts (username, password_hash, full_name, email, role, staff_id) VALUES (%s,%s,%s,%s,%s,%s)",
        (username, pw_hash, fullname, email, role, staff_id), commit=True
    )
    return ok({"account_id": new_id}, "Admin account created.", 201)


@app.route("/api/staff/<int:staff_id>", methods=["PUT"])
@jwt_required()
def update_staff(staff_id):
    """PUT /api/staff/<id> — update staff (admin only)."""
    identity = get_jwt_identity()
    if identity["mode"] != "admin":
        return err("Admin access required.", 403)

    body    = request.get_json(silent=True) or {}
    updates = []
    values  = []

    if "staff_name" in body:
        updates.append("staff_name=%s")
        values.append(body["staff_name"].strip())
    if "is_active" in body:
        updates.append("is_active=%s")
        values.append(bool(body["is_active"]))
    if "dept_name" in body:
        dept = query("SELECT dept_id FROM departments WHERE dept_name=%s", (body["dept_name"],), fetchone=True)
        if not dept:
            return err("Department not found.")
        updates.append("dept_id=%s")
        values.append(dept["dept_id"])

    if not updates:
        return err("Nothing to update.")

    values.append(staff_id)
    query(f"UPDATE staff SET {', '.join(updates)} WHERE staff_id=%s", values, commit=True)
    return ok(msg="Staff updated.")


@app.route("/api/staff/<int:staff_id>", methods=["DELETE"])
@jwt_required()
def delete_staff(staff_id):
    """DELETE /api/staff/<id> — admin only."""
    identity = get_jwt_identity()
    if identity["mode"] != "admin":
        return err("Admin access required.", 403)

    rows = query("DELETE FROM staff WHERE staff_id=%s", (staff_id,), commit=True)
    if rows == 0:
        return err("Staff member not found.", 404)
    return ok(msg="Staff member deleted.")


# ══════════════════════════════════════════════════════════════
#  FEEDBACK  —  /api/feedback
# ══════════════════════════════════════════════════════════════

@app.route("/api/feedback", methods=["GET"])
@jwt_required()
def list_feedback():
    """GET /api/feedback — admin sees all, staff sees only feedback for their tickets, customer sees own."""
    identity = get_jwt()
    if identity.get("mode") == "customer":
        rows = query(
            """SELECT f.*, fc.category_name, st.sentiment_name,
                      NULL AS customer_name, NULL AS assigned_to_staff
               FROM customer_feedback f
               JOIN feedback_categories fc ON fc.category_id = f.category_id
               JOIN sentiment_types st ON st.sentiment_id = f.sentiment_id
               WHERE f.customer_id = %s ORDER BY f.submitted_at DESC""",
            (identity["id"],)
        )
    elif identity.get("role") == "Administrator":
        rows = query("""
            SELECT f.*, ca.full_name AS customer_name, fc.category_name, st.sentiment_name,
                   s.staff_name AS assigned_to_staff
            FROM customer_feedback f
            JOIN customer_accounts ca ON ca.customer_id = f.customer_id
            JOIN feedback_categories fc ON fc.category_id = f.category_id
            JOIN sentiment_types st ON st.sentiment_id = f.sentiment_id
            LEFT JOIN complaints c ON c.complaint_id = f.complaint_id
            LEFT JOIN staff s ON s.staff_id = c.assigned_staff_id
            ORDER BY f.submitted_at DESC
        """)
    else:
        # Staff: only see feedback for complaints assigned to them
        staff_name = identity.get("name", "")
        rows = query("""
            SELECT f.*, ca.full_name AS customer_name, fc.category_name, st.sentiment_name,
                   s.staff_name AS assigned_to_staff
            FROM customer_feedback f
            JOIN customer_accounts ca ON ca.customer_id = f.customer_id
            JOIN feedback_categories fc ON fc.category_id = f.category_id
            JOIN sentiment_types st ON st.sentiment_id = f.sentiment_id
            LEFT JOIN complaints c ON c.complaint_id = f.complaint_id
            LEFT JOIN staff s ON s.staff_id = c.assigned_staff_id
            WHERE s.staff_name = %s
            ORDER BY f.submitted_at DESC
        """, (staff_name,))
    for r in rows:
        r["submitted_at"] = str(r.get("submitted_at", ""))
    return ok(rows)


@app.route("/api/feedback", methods=["POST"])
@jwt_required()
def submit_feedback():
    """POST /api/feedback — customer submits feedback."""
    identity = get_jwt_identity()
    if identity["mode"] != "customer":
        return err("Customer account required.", 403)

    body      = request.get_json(silent=True) or {}
    text      = (body.get("feedback_text") or "").strip()
    cat_name  = (body.get("category") or "General").strip()
    sent_name = (body.get("sentiment") or "Neutral").strip()

    if not text:
        return err("feedback_text is required.")

    cat = query("SELECT category_id FROM feedback_categories WHERE category_name=%s", (cat_name,), fetchone=True)
    if not cat:
        cat = query("SELECT category_id FROM feedback_categories LIMIT 1", fetchone=True)

    sent = query("SELECT sentiment_id FROM sentiment_types WHERE sentiment_name=%s", (sent_name,), fetchone=True)
    if not sent:
        sent = query("SELECT sentiment_id FROM sentiment_types LIMIT 1", fetchone=True)

    complaint_ref = body.get("complaint_ref") or None
    complaint_id  = None
    if complaint_ref:
        c = query("SELECT complaint_id FROM complaints WHERE ref_number=%s", (complaint_ref,), fetchone=True)
        if c:
            complaint_id = c["complaint_id"]

    query(
        "INSERT INTO customer_feedback (customer_id, feedback_text, category_id, sentiment_id, complaint_id) VALUES (%s,%s,%s,%s,%s)",
        (identity["id"], text, cat["category_id"], sent["sentiment_id"], complaint_id), commit=True
    )
    return ok(msg="Feedback submitted.", status=201)


@app.route("/api/feedback/<int:fid>/reply", methods=["POST"])
@jwt_required()
def reply_feedback(fid):
    """POST /api/feedback/<id>/reply — staff replies to feedback."""
    identity = get_jwt_identity()
    if identity["mode"] != "admin":
        return err("Admin access required.", 403)

    body  = request.get_json(silent=True) or {}
    reply = (body.get("reply") or "").strip()
    if not reply:
        return err("reply text is required.")

    rows = query(
        "UPDATE customer_feedback SET staff_reply=%s, replied_at=NOW(), is_read=TRUE WHERE feedback_id=%s",
        (reply, fid), commit=True
    )
    if rows == 0:
        return err("Feedback not found.", 404)
    return ok(msg="Reply sent.")


# ══════════════════════════════════════════════════════════════
#  REPORTS / DASHBOARD  —  /api/reports
# ══════════════════════════════════════════════════════════════

@app.route("/api/reports/dashboard", methods=["GET"])
@jwt_required()
def dashboard_stats():
    """GET /api/reports/dashboard — KPI summary for the admin dashboard."""
    total    = query("SELECT COUNT(*) AS n FROM complaints", fetchone=True)["n"]
    pending  = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE status='Pending'", fetchone=True)["n"]
    in_prog  = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE status='In Progress'", fetchone=True)["n"]
    resolved = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE status='Resolved'", fetchone=True)["n"]

    avg_rating = query(
        "SELECT ROUND(AVG(satisfaction_rating),1) AS avg_r FROM complaints WHERE satisfaction_rating IS NOT NULL",
        fetchone=True
    )["avg_r"]

    avg_resolution = query(
        "SELECT ROUND(AVG(DATEDIFF(updated_at, submitted_date)),1) AS avg_days FROM complaints c JOIN ticket_statuses ts ON ts.status_id = c.status_id WHERE ts.status_name = 'Resolved'",
        fetchone=True
    )["avg_days"]

    by_type = query("""
        SELECT
            complaint_type,
            COUNT(*) AS count,
            SUM(CASE WHEN status = 'Resolved'    THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status = 'Pending'      THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'In Progress'  THEN 1 ELSE 0 END) AS in_progress
        FROM v_complaints_full
        GROUP BY complaint_type
        ORDER BY count DESC
    """)

    by_priority = query("""
        SELECT priority, COUNT(*) AS count
        FROM v_complaints_full GROUP BY priority
    """)

    staff_workload = query("SELECT * FROM v_staff_workload ORDER BY open_tickets DESC")

    return ok({
        "totals": {
            "total":               total,
            "pending":             pending,
            "in_progress":         in_prog,
            "resolved":            resolved,
            "avg_satisfaction":    avg_rating,
            "avg_resolution_days": avg_resolution,
        },
        "by_type":       by_type,
        "by_priority":   by_priority,
        "staff_workload": staff_workload,
    })


@app.route("/api/reports/resolution", methods=["GET"])
@jwt_required()
def resolution_report():
    """GET /api/reports/resolution — resolution rates per complaint type."""
    rows = query("SELECT * FROM v_resolution_report ORDER BY total DESC")
    return ok(rows)


@app.route("/api/reports/satisfaction", methods=["GET"])
@jwt_required()
def satisfaction_report():
    """GET /api/reports/satisfaction — rated tickets, filtered for staff."""
    identity = get_jwt_identity()
    role = identity.get("role", "")
    if role == "Administrator":
        rows = query("SELECT * FROM v_satisfaction_ratings")
    else:
        # Staff sees only tickets assigned to them
        name = identity.get("name", "")
        rows = query(
            "SELECT * FROM v_satisfaction_ratings WHERE assigned_to = %s",
            (name,)
        )
    return ok(rows)


@app.route("/api/reports/dashboard/staff", methods=["GET"])
@jwt_required()
def staff_dashboard_stats():
    """GET /api/reports/dashboard/staff — KPIs filtered for the logged-in staff member."""
    identity = get_jwt_identity()
    name = identity.get("name", "")

    total    = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE assigned_to=%s", (name,), fetchone=True)["n"]
    pending  = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE assigned_to=%s AND status='Pending'", (name,), fetchone=True)["n"]
    in_prog  = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE assigned_to=%s AND status='In Progress'", (name,), fetchone=True)["n"]
    resolved = query("SELECT COUNT(*) AS n FROM v_complaints_full WHERE assigned_to=%s AND status='Resolved'", (name,), fetchone=True)["n"]

    by_type = query("""
        SELECT
            complaint_type,
            COUNT(*) AS count,
            SUM(CASE WHEN status = 'Resolved'    THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status = 'Pending'      THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'In Progress'  THEN 1 ELSE 0 END) AS in_progress
        FROM v_complaints_full
        WHERE assigned_to = %s
        GROUP BY complaint_type ORDER BY count DESC
    """, (name,))

    return ok({
        "totals": {
            "total": total, "pending": pending,
            "in_progress": in_prog, "resolved": resolved,
        },
        "by_type": by_type,
        "by_priority": [],
        "staff_workload": [],
    })


# ══════════════════════════════════════════════════════════════
#  NOTIFICATIONS  —  /api/notifications
# ══════════════════════════════════════════════════════════════

@app.route("/api/notifications", methods=["GET"])
@jwt_required()
def list_notifications():
    """GET /api/notifications — fetch notifications for the current user."""
    identity = get_jwt_identity()
    rows     = query(
        "SELECT * FROM notification_log WHERE username=%s ORDER BY created_at DESC LIMIT 50",
        (identity["username"],)
    )
    for r in rows:
        r["created_at"] = str(r["created_at"])
    return ok(rows)


@app.route("/api/notifications/<int:nid>/read", methods=["POST"])
@jwt_required()
def mark_notification_read(nid):
    """POST /api/notifications/<id>/read — mark a notification as read."""
    identity = get_jwt_identity()
    query(
        "UPDATE notification_log SET is_read=TRUE WHERE notif_id=%s AND username=%s",
        (nid, identity["username"]), commit=True
    )
    return ok(msg="Marked as read.")


@app.route("/api/notifications/read-all", methods=["POST"])
@jwt_required()
def mark_all_read():
    """POST /api/notifications/read-all — mark all notifications as read."""
    identity = get_jwt_identity()
    query(
        "UPDATE notification_log SET is_read=TRUE WHERE username=%s",
        (identity["username"],), commit=True
    )
    return ok(msg="All notifications marked as read.")


# ══════════════════════════════════════════════════════════════
#  HEALTH CHECK
# ══════════════════════════════════════════════════════════════

@app.route("/api/health", methods=["GET"])
def health():
    """Simple health check endpoint."""
    try:
        conn = get_db()
        conn.close()
        db_ok = True
    except Exception:
        db_ok = False
    return jsonify({"ok": True, "db_connected": db_ok, "app": "Resolvia API v1"})


# ── Serve frontend static files ────────────────────────────────
from flask import send_from_directory

@app.route("/")
def serve_index():
    return send_from_directory("..", "index.html")

@app.route("/admin")
def serve_admin():
    return send_from_directory("..", "admin.html")

@app.route("/staff")
def serve_staff():
    return send_from_directory("..", "staff.html")

@app.route("/html/<path:filename>")
def serve_html(filename):
    return send_from_directory("../html", filename)

@app.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory("../css", filename)

@app.route("/js/<path:filename>")
def serve_js(filename):
    from flask import make_response
    response = make_response(send_from_directory("../js", filename))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    print(f"🚀  Resolvia API running on http://localhost:{port}")
    print(f"🛡️  Admin portal running on http://localhost:{port}/admin")
    print(f"👤  Staff portal running on http://localhost:{port}/staff")
    app.run(host="0.0.0.0", port=port, debug=debug)
