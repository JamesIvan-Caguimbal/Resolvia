"""
setup_db.py — Run once after importing resolvia_database.sql
Updates the placeholder passwords in admin_accounts and customer_accounts
with proper bcrypt hashes so the Flask API can authenticate users.

Usage:
    python setup_db.py
"""

import os
import bcrypt
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

# ── Connect ────────────────────────────────────────────────────
conn = mysql.connector.connect(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", 3306)),
    database=os.getenv("DB_NAME", "resolvia_db"),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASSWORD", ""),
)
cur = conn.cursor()


def h(plain: str) -> str:
    """Return a bcrypt hash of the given plain-text password."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ── Admin / staff accounts ─────────────────────────────────────
admin_accounts = [
    ("admin",  "Admin@2025"),
    ("staff1", "Staff@2025"),
    ("staff2", "Staff@2025"),
    ("staff3", "Staff@2025"),
    ("staff4", "Staff@2025"),
]

print("Hashing admin account passwords…")
for username, plain in admin_accounts:
    hashed = h(plain)
    cur.execute(
        "UPDATE admin_accounts SET password_hash=%s WHERE username=%s",
        (hashed, username)
    )
    print(f"  ✅  admin_accounts.{username}")

# ── Customer accounts ─────────────────────────────────────────
customer_accounts = [
    ("ivan", "User@2025"),
    ("demo", "Demo@2025!"),
]

print("Hashing customer account passwords…")
for username, plain in customer_accounts:
    hashed = h(plain)
    cur.execute(
        "UPDATE customer_accounts SET password_hash=%s WHERE username=%s",
        (hashed, username)
    )
    print(f"  ✅  customer_accounts.{username}")

conn.commit()
cur.close()
conn.close()

print("\n🎉  Done! All passwords are now bcrypt-hashed.")
print("    You can now start the Flask API with:  python app.py")
