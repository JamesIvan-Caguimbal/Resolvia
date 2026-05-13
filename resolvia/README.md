# Resolvia — Customer Complaint Management System
**Batangas State University · College of Informatics and Computing Sciences**

---

## Project Structure

```
resolvia/
├── index.html              ← Customer portal (frontend)
├── admin.html              ← Admin / staff portal (frontend)
├── html/                   ← Page modules (submit, tickets, dashboard…)
├── css/                    ← Stylesheets
├── js/                     ← Frontend JavaScript
│   ├── app.js              ← Application logic
│   ├── auth.js             ← Login / register / session
│   ├── notifications.js    ← Notification system
│   └── settings.js         ← Settings panel
├── backend/                ← ✅ NEW: Python Flask API
│   ├── app.py              ← Main Flask application (all routes)
│   ├── requirements.txt    ← Python dependencies
│   ├── .env.example        ← Environment variable template
│   └── api_tests.http      ← VS Code REST Client test file
├── resolvia_database.sql   ← MySQL database schema + seed data
└── .vscode/
    ├── launch.json         ← F5 = run Flask
    ├── settings.json       ← Python interpreter settings
    └── extensions.json     ← Recommended VS Code extensions
```

---

## Requirements Checklist

| Requirement | Status |
|---|---|
| Web application (Python Flask) | ✅ |
| Relational DBMS (MySQL) | ✅ |
| Fully functional CRUD operations | ✅ |
| User interface for interaction | ✅ |
| Input validation & basic security | ✅ |
| Entity-Relationship Diagram | ✅ (see SQL schema) |
| Database schema (3NF normalised) | ✅ |
| Primary keys, foreign keys | ✅ |
| Constraints | ✅ |
| Indexes | ✅ |
| Views | ✅ (4 views) |
| Stored procedures | ✅ (sp_submit_complaint) |
| Triggers | ✅ (in SQL file) |

---

## Step 1 — Install Prerequisites

### 1a. Python
1. Download Python 3.11+ from https://python.org/downloads
2. During install, ✅ check **"Add Python to PATH"**
3. Verify: open a terminal and run `python --version`

### 1b. MySQL
1. Download MySQL Community Server from https://dev.mysql.com/downloads/mysql/
   - Or install **XAMPP** (includes MySQL + phpMyAdmin) from https://apachefriends.org
2. Remember the root password you set during installation

### 1c. VS Code
1. Download from https://code.visualstudio.com
2. Install the recommended extensions (VS Code will prompt you when you open this folder)

---

## Step 2 — Set Up the Database

### Option A — MySQL Workbench (GUI)
1. Open **MySQL Workbench** and connect to your local server
2. Go to **File → Open SQL Script** and select `resolvia_database.sql`
3. Click the ⚡ **Execute** button (or press `Ctrl+Shift+Enter`)
4. Refresh the Schemas panel — you should see `resolvia_db`

### Option B — MySQL Command Line
```bash
# Open terminal / Command Prompt
mysql -u root -p

# Enter your MySQL root password when prompted, then run:
source /full/path/to/resolvia/resolvia_database.sql
exit
```

### Option C — VS Code (with SQLTools extension)
1. Install extensions: **SQLTools** and **SQLTools MySQL/MariaDB Driver**
2. Press `Ctrl+Shift+P` → type **SQLTools: Add New Connection**
3. Fill in:
   - Driver: MySQL
   - Host: `localhost`
   - Port: `3306`
   - Database: `resolvia_db` (create it first if needed)
   - User: `root`
   - Password: your MySQL password
4. Open `resolvia_database.sql` in VS Code
5. Right-click inside the file → **Run on active connection**

### Verify database setup
```sql
USE resolvia_db;
SHOW TABLES;
SELECT * FROM v_complaints_full LIMIT 5;
```
You should see 10 tables plus 4 views.

---

## Step 3 — Set Up the Python Backend

Open the **integrated terminal** in VS Code (`Ctrl+`` ` ``).

### 3a. Navigate to the backend folder
```bash
cd backend
```

### 3b. Create a virtual environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```
Your terminal prompt should now start with `(venv)`.

### 3c. Install dependencies
```bash
pip install -r requirements.txt
```
This installs Flask, Flask-CORS, Flask-JWT-Extended, mysql-connector-python, and bcrypt.

### 3d. Configure environment variables
```bash
# Windows (copy the template)
copy .env.example .env

# macOS / Linux
cp .env.example .env
```
Then **open `.env`** in VS Code and update:
```
DB_PASSWORD=your_actual_mysql_password
JWT_SECRET_KEY=any-long-random-string-you-choose
```

---

## Step 4 — Run the Backend

### Method A — VS Code (recommended)
1. Make sure the `(venv)` virtual environment is active in the terminal
2. Press **F5** (or go to **Run → Start Debugging**)
3. Select **"▶ Run Flask Backend"** if prompted
4. The terminal should show:
   ```
   ✅  Database pool created successfully.
   🚀  Resolvia API running on http://localhost:5000
   ```

### Method B — Terminal
```bash
# Make sure you're in the backend/ folder with venv active
python app.py
```

### Verify the API is running
Open your browser and go to:
```
http://localhost:5000/api/health
```
You should see:
```json
{"ok": true, "db_connected": true, "app": "Resolvia API v1"}
```

---

## Step 5 — Run the Frontend

### Method A — VS Code Live Server
1. Install the **Live Server** extension
2. Right-click on `index.html` → **Open with Live Server**
3. Browser opens at `http://127.0.0.1:5500`

### Method B — Open directly
Just double-click `index.html` to open it in your browser.

> **Note:** The frontend currently uses in-memory JavaScript data. To connect it to the Flask API, the `fetch()` calls in `js/app.js` need to point to `http://localhost:5000/api/...`. The backend is fully functional and can be tested with the API test file below.

---

## Step 6 — Test the API (VS Code REST Client)

1. Install the **REST Client** extension in VS Code
2. Open `backend/api_tests.http`
3. Click **"Send Request"** above any block to test it
4. Start with the login request to get a JWT token, then paste it into `@adminToken`

---

## API Reference

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/auth/login` | None | Login (admin or customer) |
| POST | `/auth/register` | None | Register new customer |
| GET | `/auth/me` | JWT | Get current user |
| GET | `/complaints` | JWT | List complaints |
| GET | `/complaints/<ref>` | JWT | Get single complaint + audit |
| POST | `/complaints` | None | Submit new complaint |
| PUT | `/complaints/<ref>` | JWT Admin | Update status/priority/notes |
| POST | `/complaints/<ref>/rate` | JWT Customer | Submit satisfaction rating |
| DELETE | `/complaints/<ref>` | JWT Admin | Delete complaint |
| GET | `/staff` | JWT | List all staff |
| GET | `/staff/<id>` | JWT | Get staff workload |
| POST | `/staff` | JWT Admin | Create staff |
| PUT | `/staff/<id>` | JWT Admin | Update staff |
| DELETE | `/staff/<id>` | JWT Admin | Delete staff |
| GET | `/feedback` | JWT | List feedback |
| POST | `/feedback` | JWT Customer | Submit feedback |
| POST | `/feedback/<id>/reply` | JWT Admin | Reply to feedback |
| GET | `/reports/dashboard` | JWT | KPI summary |
| GET | `/reports/resolution` | JWT | Resolution rates |
| GET | `/reports/satisfaction` | JWT | Satisfaction ratings |
| GET | `/notifications` | JWT | List notifications |
| POST | `/notifications/<id>/read` | JWT | Mark as read |
| POST | `/notifications/read-all` | JWT | Mark all as read |

---

## Default Login Credentials

### Admin Portal (`admin.html`)
| Username | Password | Role |
|----------|----------|------|
| `admin` | `Admin@2025` | Administrator |
| `staff1` | `Staff@2025` | Finance Specialist |
| `staff2` | `Staff@2025` | Tech Support |

### Customer Portal (`index.html`)
| Username | Password | Role |
|----------|----------|------|
| `user` | `User@2025` | Customer |
| `demo` | `Demo@2025!` | Customer |

> These credentials are seeded directly in `resolvia_database.sql` with bcrypt-hashed passwords.

---

## Database Design Summary

The database follows **Third Normal Form (3NF)** with the following tables:

**Lookup tables:** `complaint_types`, `departments`, `priority_levels`, `ticket_statuses`, `feedback_categories`, `sentiment_types`

**Core tables:** `staff`, `admin_accounts`, `customer_accounts`, `complaints`, `complaint_audit_trail`, `customer_feedback`, `notification_log`

**Views:** `v_complaints_full`, `v_resolution_report`, `v_staff_workload`, `v_satisfaction_ratings`

**Stored Procedure:** `sp_submit_complaint` — creates a ticket and inserts the first audit trail entry atomically.

**Triggers:** Defined in `resolvia_database.sql` for automatic audit logging on status changes.

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'flask'`**
→ Make sure the virtual environment is active (`venv\Scripts\activate` on Windows).

**`Access denied for user 'root'@'localhost'`**
→ Check your `DB_PASSWORD` in the `.env` file.

**`Can't connect to MySQL server`**
→ Make sure MySQL is running. In XAMPP, start the MySQL service in the control panel.

**`Database resolvia_db does not exist`**
→ Run the `resolvia_database.sql` script again (Step 2).

**Frontend shows no data after connecting to API**
→ Make sure Flask is running on port 5000 and CORS is not blocked by your browser.
