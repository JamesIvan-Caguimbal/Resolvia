-- ============================================================
--  RESOLVIA — Customer Complaint Management System
--  MySQL Workbench Database Script
--  Batangas State University · College of Informatics and Computing Sciences
--
--  Features:
--    • Entity-Relationship design normalized to 3NF
--    • Primary keys, foreign keys, constraints, indexes
--    • Views with LEFT JOIN (so unassigned complaints show)
--    • Stored procedures for common operations
--    • Trigger for audit logging
--    • Sample data with staff names
-- ============================================================

-- ── Drop and recreate schema ──────────────────────────────────
DROP DATABASE IF EXISTS resolvia_db;
CREATE DATABASE resolvia_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE resolvia_db;


-- ============================================================
--  LOOKUP / REFERENCE TABLES
-- ============================================================

CREATE TABLE complaint_types (
  type_id        TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type_name      VARCHAR(50)      NOT NULL,
  routing_dept   VARCHAR(60)      NOT NULL,
  PRIMARY KEY (type_id),
  UNIQUE KEY uq_type_name (type_name)
);

CREATE TABLE departments (
  dept_id        TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dept_name      VARCHAR(60)      NOT NULL,
  PRIMARY KEY (dept_id),
  UNIQUE KEY uq_dept_name (dept_name)
);

CREATE TABLE priority_levels (
  priority_id    TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  priority_name  VARCHAR(10)      NOT NULL,
  sort_order     TINYINT          NOT NULL DEFAULT 0,
  PRIMARY KEY (priority_id),
  UNIQUE KEY uq_priority_name (priority_name)
);

CREATE TABLE ticket_statuses (
  status_id      TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  status_name    VARCHAR(20)      NOT NULL,
  PRIMARY KEY (status_id),
  UNIQUE KEY uq_status_name (status_name)
);

CREATE TABLE feedback_categories (
  category_id    TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name  VARCHAR(50)      NOT NULL,
  icon           VARCHAR(10)      NOT NULL DEFAULT '💬',
  PRIMARY KEY (category_id),
  UNIQUE KEY uq_category_name (category_name)
);

CREATE TABLE sentiment_types (
  sentiment_id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sentiment_name VARCHAR(10)      NOT NULL,
  PRIMARY KEY (sentiment_id),
  UNIQUE KEY uq_sentiment_name (sentiment_name)
);


-- ============================================================
--  CORE ENTITY TABLES
-- ============================================================

CREATE TABLE staff (
  staff_id        INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  staff_name      VARCHAR(100)     NOT NULL,
  dept_id         TINYINT UNSIGNED NOT NULL,
  handles_type_id TINYINT UNSIGNED NOT NULL,
  is_active       BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_id),
  CONSTRAINT fk_staff_dept FOREIGN KEY (dept_id)          REFERENCES departments    (dept_id),
  CONSTRAINT fk_staff_type FOREIGN KEY (handles_type_id)  REFERENCES complaint_types (type_id),
  INDEX idx_staff_dept   (dept_id),
  INDEX idx_staff_active (is_active)
);

CREATE TABLE admin_accounts (
  account_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)   NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  full_name     VARCHAR(100)  NOT NULL,
  email         VARCHAR(100)  NULL,
  role          VARCHAR(50)   NOT NULL DEFAULT 'Administrator',
  is_builtin    BOOLEAN       NOT NULL DEFAULT FALSE,
  staff_id      INT UNSIGNED  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  UNIQUE KEY uq_admin_username (username),
  CONSTRAINT fk_admin_staff FOREIGN KEY (staff_id) REFERENCES staff (staff_id) ON DELETE SET NULL,
  INDEX idx_admin_username (username)
);

CREATE TABLE customer_accounts (
  customer_id   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)   NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  full_name     VARCHAR(100)  NOT NULL,
  email         VARCHAR(100)  NOT NULL,
  role          VARCHAR(20)   NOT NULL DEFAULT 'Customer',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  UNIQUE KEY uq_cust_username (username),
  UNIQUE KEY uq_cust_email    (email),
  INDEX idx_cust_email (email)
);

CREATE TABLE complaints (
  complaint_id      INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  ref_number        VARCHAR(10)      NOT NULL,
  submitted_date    DATE             NOT NULL,
  customer_name     VARCHAR(100)     NOT NULL,
  customer_email    VARCHAR(100)     NOT NULL,
  type_id           TINYINT UNSIGNED NOT NULL,
  priority_id       TINYINT UNSIGNED NOT NULL,
  status_id         TINYINT UNSIGNED NOT NULL,
  assigned_staff_id INT UNSIGNED     NULL,
  subject           VARCHAR(255)     NULL,
  description       TEXT             NOT NULL,
  resolution_notes  TEXT             NULL,
  satisfaction_rating TINYINT        NULL CHECK (satisfaction_rating BETWEEN 1 AND 5),
  customer_id       INT UNSIGNED     NULL,
  created_at        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (complaint_id),
  UNIQUE KEY uq_ref_number (ref_number),
  CONSTRAINT fk_complaint_type     FOREIGN KEY (type_id)            REFERENCES complaint_types   (type_id),
  CONSTRAINT fk_complaint_priority FOREIGN KEY (priority_id)        REFERENCES priority_levels   (priority_id),
  CONSTRAINT fk_complaint_status   FOREIGN KEY (status_id)          REFERENCES ticket_statuses   (status_id),
  CONSTRAINT fk_complaint_staff    FOREIGN KEY (assigned_staff_id)  REFERENCES staff             (staff_id),
  CONSTRAINT fk_complaint_customer FOREIGN KEY (customer_id)        REFERENCES customer_accounts (customer_id) ON DELETE SET NULL,
  INDEX idx_complaint_status   (status_id),
  INDEX idx_complaint_type     (type_id),
  INDEX idx_complaint_priority (priority_id),
  INDEX idx_complaint_staff    (assigned_staff_id),
  INDEX idx_complaint_date     (submitted_date),
  INDEX idx_complaint_email    (customer_email)
);

CREATE TABLE complaint_audit_trail (
  audit_id     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  complaint_id INT UNSIGNED  NOT NULL,
  audit_entry  TEXT          NOT NULL,
  recorded_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by   VARCHAR(100)  NULL,
  PRIMARY KEY (audit_id),
  CONSTRAINT fk_audit_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (complaint_id) ON DELETE CASCADE,
  INDEX idx_audit_complaint (complaint_id),
  INDEX idx_audit_date      (recorded_at)
);

CREATE TABLE customer_feedback (
  feedback_id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  customer_id          INT UNSIGNED     NOT NULL,
  complaint_id         INT UNSIGNED     NULL,
  feedback_text        TEXT             NOT NULL,
  category_id          TINYINT UNSIGNED NOT NULL,
  sentiment_id         TINYINT UNSIGNED NOT NULL,
  assigned_to_staff_id INT UNSIGNED     NULL,
  is_read              BOOLEAN          NOT NULL DEFAULT FALSE,
  staff_reply          TEXT             NULL,
  replied_at           TIMESTAMP        NULL,
  user_read_reply      BOOLEAN          NOT NULL DEFAULT FALSE,
  submitted_at         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (feedback_id),
  CONSTRAINT fk_feedback_customer  FOREIGN KEY (customer_id)          REFERENCES customer_accounts (customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_complaint FOREIGN KEY (complaint_id)         REFERENCES complaints        (complaint_id) ON DELETE SET NULL,
  CONSTRAINT fk_feedback_category  FOREIGN KEY (category_id)          REFERENCES feedback_categories (category_id),
  CONSTRAINT fk_feedback_sentiment FOREIGN KEY (sentiment_id)         REFERENCES sentiment_types   (sentiment_id),
  CONSTRAINT fk_feedback_staff     FOREIGN KEY (assigned_to_staff_id) REFERENCES staff             (staff_id) ON DELETE SET NULL,
  INDEX idx_feedback_customer (customer_id),
  INDEX idx_feedback_category (category_id),
  INDEX idx_feedback_staff    (assigned_to_staff_id)
);

CREATE TABLE notification_log (
  notif_id   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  username   VARCHAR(50)   NOT NULL,
  message    TEXT          NOT NULL,
  icon       VARCHAR(10)   NOT NULL DEFAULT '🔔',
  is_read    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notif_id),
  INDEX idx_notif_user (username),
  INDEX idx_notif_read (is_read)
);


-- ============================================================
--  VIEWS  (all use LEFT JOIN so unassigned tickets still show)
-- ============================================================

-- v_complaints_full: full denormalized view for all queries
CREATE VIEW v_complaints_full AS
SELECT
  c.complaint_id,
  c.ref_number,
  c.submitted_date,
  c.customer_name,
  c.customer_email,
  ct.type_name        AS complaint_type,
  ct.routing_dept,
  pl.priority_name    AS priority,
  ts.status_name      AS status,
  s.staff_name        AS assigned_to,
  d.dept_name         AS assigned_dept,
  c.subject,
  c.description,
  c.resolution_notes,
  c.satisfaction_rating,
  c.created_at,
  c.updated_at
FROM complaints          c
JOIN  complaint_types    ct ON ct.type_id     = c.type_id
JOIN  priority_levels    pl ON pl.priority_id = c.priority_id
JOIN  ticket_statuses    ts ON ts.status_id   = c.status_id
LEFT JOIN staff          s  ON s.staff_id     = c.assigned_staff_id
LEFT JOIN departments    d  ON d.dept_id      = s.dept_id;

-- v_resolution_report: summary per complaint type
CREATE VIEW v_resolution_report AS
SELECT
  ct.type_name,
  COUNT(*)                                                        AS total,
  SUM(ts.status_name = 'Resolved')                               AS resolved,
  SUM(ts.status_name = 'Pending')                                AS pending,
  SUM(ts.status_name = 'In Progress')                            AS in_progress,
  ROUND(SUM(ts.status_name = 'Resolved') / COUNT(*) * 100, 1)   AS resolution_rate_pct
FROM complaints       c
JOIN complaint_types  ct ON ct.type_id   = c.type_id
JOIN ticket_statuses  ts ON ts.status_id = c.status_id
GROUP BY ct.type_name;

-- v_staff_workload: open/resolved ticket counts per staff member
CREATE VIEW v_staff_workload AS
SELECT
  s.staff_id,
  s.staff_name,
  d.dept_name,
  ct.type_name                                                    AS handles_type,
  s.is_active,
  COUNT(c.complaint_id)                                           AS total_tickets,
  COALESCE(SUM(ts.status_name != 'Resolved'), 0)                 AS open_tickets,
  COALESCE(SUM(ts.status_name =  'Resolved'), 0)                 AS resolved_tickets
FROM staff               s
JOIN  departments        d  ON d.dept_id   = s.dept_id
JOIN  complaint_types    ct ON ct.type_id  = s.handles_type_id
LEFT JOIN complaints     c  ON c.assigned_staff_id = s.staff_id
LEFT JOIN ticket_statuses ts ON ts.status_id = c.status_id
GROUP BY s.staff_id, s.staff_name, d.dept_name, ct.type_name, s.is_active;

-- v_satisfaction_ratings: all rated tickets
CREATE VIEW v_satisfaction_ratings AS
SELECT
  c.ref_number,
  c.customer_name,
  ct.type_name      AS complaint_type,
  s.staff_name      AS assigned_to,
  c.satisfaction_rating
FROM complaints        c
JOIN  complaint_types  ct ON ct.type_id = c.type_id
LEFT JOIN staff        s  ON s.staff_id = c.assigned_staff_id
WHERE c.satisfaction_rating IS NOT NULL
ORDER BY c.submitted_date DESC;


-- ============================================================
--  STORED PROCEDURES
-- ============================================================

DELIMITER $$

CREATE PROCEDURE sp_submit_complaint (
  IN  p_customer_name  VARCHAR(100),
  IN  p_customer_email VARCHAR(100),
  IN  p_type_name      VARCHAR(50),
  IN  p_priority_name  VARCHAR(10),
  IN  p_subject        VARCHAR(255),
  IN  p_description    TEXT,
  IN  p_customer_id    INT UNSIGNED,
  OUT p_ref_number     VARCHAR(10)
)
BEGIN
  DECLARE v_type_id      TINYINT UNSIGNED;
  DECLARE v_priority_id  TINYINT UNSIGNED;
  DECLARE v_status_id    TINYINT UNSIGNED;
  DECLARE v_staff_id     INT UNSIGNED;
  DECLARE v_complaint_id INT UNSIGNED;
  DECLARE v_next_num     INT;

  SELECT type_id     INTO v_type_id     FROM complaint_types WHERE type_name     = p_type_name;
  SELECT priority_id INTO v_priority_id FROM priority_levels WHERE priority_name = p_priority_name;
  SELECT status_id   INTO v_status_id   FROM ticket_statuses WHERE status_name   = 'Pending';

  -- Auto-assign: active staff in routing dept with fewest open tickets
  SELECT s.staff_id INTO v_staff_id
  FROM staff s
  JOIN departments    d  ON d.dept_id  = s.dept_id
  JOIN complaint_types ct ON ct.type_id = v_type_id
  WHERE s.is_active = TRUE AND d.dept_name = ct.routing_dept
  ORDER BY (
    SELECT COUNT(*) FROM complaints c2
    JOIN ticket_statuses ts2 ON ts2.status_id = c2.status_id
    WHERE c2.assigned_staff_id = s.staff_id AND ts2.status_name != 'Resolved'
  ) ASC
  LIMIT 1;

  -- Generate ref number RV-XXXX
  SELECT COALESCE(MAX(CAST(SUBSTRING(ref_number, 4) AS UNSIGNED)), 1000) + 1
  INTO v_next_num FROM complaints;
  SET p_ref_number = CONCAT('RV-', LPAD(v_next_num, 4, '0'));

  INSERT INTO complaints (
    ref_number, submitted_date, customer_name, customer_email,
    type_id, priority_id, status_id, assigned_staff_id,
    subject, description, customer_id
  ) VALUES (
    p_ref_number, CURDATE(), p_customer_name, p_customer_email,
    v_type_id, v_priority_id, v_status_id, v_staff_id,
    p_subject, p_description, p_customer_id
  );
  SET v_complaint_id = LAST_INSERT_ID();

  INSERT INTO complaint_audit_trail (complaint_id, audit_entry)
  VALUES (v_complaint_id, CONCAT('Ticket created · ', DATE_FORMAT(CURDATE(), '%b %e, %Y')));

  INSERT INTO complaint_audit_trail (complaint_id, audit_entry)
  SELECT v_complaint_id,
    CONCAT('Auto-assigned to ', s.staff_name, ' · ', d.dept_name, ' · ', DATE_FORMAT(CURDATE(), '%b %e, %Y'))
  FROM staff s JOIN departments d ON d.dept_id = s.dept_id
  WHERE s.staff_id = v_staff_id;

  -- Return ref number and assigned staff name
  SELECT p_ref_number, s.staff_name
  FROM staff s WHERE s.staff_id = v_staff_id;
END$$


CREATE PROCEDURE sp_update_status (
  IN p_ref_number VARCHAR(10),
  IN p_new_status VARCHAR(20),
  IN p_updated_by VARCHAR(100),
  IN p_notes      TEXT
)
BEGIN
  DECLARE v_complaint_id INT UNSIGNED;
  DECLARE v_status_id    TINYINT UNSIGNED;

  SELECT complaint_id INTO v_complaint_id FROM complaints    WHERE ref_number  = p_ref_number;
  SELECT status_id    INTO v_status_id    FROM ticket_statuses WHERE status_name = p_new_status;

  UPDATE complaints
  SET status_id        = v_status_id,
      resolution_notes = IF(p_notes IS NOT NULL AND p_notes != '', p_notes, resolution_notes)
  WHERE complaint_id = v_complaint_id;

  INSERT INTO complaint_audit_trail (complaint_id, audit_entry, created_by)
  VALUES (
    v_complaint_id,
    CONCAT('Status → ', p_new_status, ' · ', DATE_FORMAT(NOW(), '%b %e, %Y'),
           IF(p_updated_by IS NOT NULL, CONCAT(' · by ', p_updated_by), '')),
    p_updated_by
  );
END$$


CREATE PROCEDURE sp_submit_rating (
  IN p_ref_number VARCHAR(10),
  IN p_rating     TINYINT
)
BEGIN
  DECLARE v_complaint_id INT UNSIGNED;

  IF p_rating NOT BETWEEN 1 AND 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rating must be between 1 and 5.';
  END IF;

  SELECT complaint_id INTO v_complaint_id FROM complaints WHERE ref_number = p_ref_number;

  UPDATE complaints SET satisfaction_rating = p_rating WHERE complaint_id = v_complaint_id;

  INSERT INTO complaint_audit_trail (complaint_id, audit_entry)
  VALUES (
    v_complaint_id,
    CONCAT('Customer rated experience: ', REPEAT('⭐', p_rating), ' (', p_rating, '/5) · ', DATE_FORMAT(NOW(), '%b %e, %Y'))
  );
END$$

DELIMITER ;


-- ============================================================
--  TRIGGER
-- ============================================================

DELIMITER $$

CREATE TRIGGER trg_complaint_status_change
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
  IF NEW.status_id != OLD.status_id THEN
    INSERT INTO complaint_audit_trail (complaint_id, audit_entry)
    SELECT NEW.complaint_id,
      CONCAT('Status changed to ', ts.status_name, ' · ', DATE_FORMAT(NOW(), '%b %e, %Y'))
    FROM ticket_statuses ts WHERE ts.status_id = NEW.status_id;
  END IF;
END$$

DELIMITER ;


-- ============================================================
--  SEED DATA — Lookup tables
-- ============================================================

INSERT INTO complaint_types (type_name, routing_dept) VALUES
  ('Billing Dispute',  'Finance Team'),
  ('Technical Issue',  'Tech Support'),
  ('General Inquiry',  'Customer Success'),
  ('Service Quality',  'Quality Team');

INSERT INTO departments (dept_name) VALUES
  ('Finance Team'),
  ('Tech Support'),
  ('Customer Success'),
  ('Quality Team');

INSERT INTO priority_levels (priority_name, sort_order) VALUES
  ('Low',    1),
  ('Medium', 2),
  ('High',   3),
  ('Urgent', 4);

INSERT INTO ticket_statuses (status_name) VALUES
  ('Pending'),
  ('In Progress'),
  ('Resolved');

INSERT INTO feedback_categories (category_name, icon) VALUES
  ('Service Quality', '⭐'),
  ('Response Time',   '⏱'),
  ('Staff Attitude',  '🤝'),
  ('Resolution',      '✅'),
  ('General',         '💬');

INSERT INTO sentiment_types (sentiment_name) VALUES
  ('Positive'),
  ('Neutral'),
  ('Negative');


-- ============================================================
--  SEED DATA — Staff
-- ============================================================

INSERT INTO staff (staff_id, staff_name, dept_id, handles_type_id, is_active) VALUES
  (1, 'Christan Michael Diola',     1, 1, TRUE),
  (2, 'Kester Marty Laygo',         2, 2, TRUE),
  (3, 'Derick Gabriel Peñaflorida', 3, 3, TRUE),
  (4, 'Cedrick Miguel Peñaflorida', 4, 4, TRUE);


-- ============================================================
--  SEED DATA — Admin & Customer accounts
--  NOTE: Passwords are plaintext here — run setup_db.py after
--        importing to hash them with bcrypt
-- ============================================================

INSERT INTO admin_accounts (username, password_hash, full_name, email, role, is_builtin, staff_id) VALUES
  ('admin',  'Admin@2025', 'Admin User',            NULL, 'Administrator',      TRUE, NULL),
  ('staff1', 'Staff@2025', 'Christan Michael Diola', NULL, 'Finance Specialist', TRUE, 1),
  ('staff2', 'Staff@2025', 'Kester Marty Laygo',     NULL, 'Tech Support',       TRUE, 2),
  ('staff3', 'Staff@2025', 'Derick Gabriel Peñaflorida', NULL, 'Customer Success', TRUE, 3),
  ('staff4', 'Staff@2025', 'Cedrick Miguel Peñaflorida', NULL, 'Quality Team',    TRUE, 4);

INSERT INTO customer_accounts (username, password_hash, full_name, email, role) VALUES
  ('ivan',  'User@2025',  'James Ivan Caguimbal', 'ivan@resolvia.com',  'Customer'),
  ('demo',  'Demo@2025!', 'Demo Customer',        'demo@resolvia.com',  'Customer');


-- ============================================================
--  SEED DATA — Sample complaints
-- ============================================================

INSERT INTO complaints
  (ref_number, submitted_date, customer_name, customer_email,
   type_id, priority_id, status_id, assigned_staff_id,
   subject, description, resolution_notes, satisfaction_rating)
VALUES
  ('RV-1001','2025-01-09','Acme Corp','acme@corp.com',
   1,3,1,1,
   'Incorrect Invoice Amount',
   'Incorrect invoice amount charged for the January billing cycle. We were billed $240 instead of $120.',
   NULL, NULL),

  ('RV-1002','2025-01-11','TechFlow','info@techflow.com',
   2,4,2,2,
   'Login Page 500 Error',
   'Login page returns HTTP 500 error intermittently during peak hours.',
   'Checking server logs for 500 error.', NULL),

  ('RV-1003','2025-01-15','Kaira Fiala','k.fiala@mail.com',
   3,1,3,3,
   'Refund Policy Inquiry',
   'Customer inquiring about refund policy and eligibility window.',
   'Resolved via email reply with full refund policy document.', 5),

  ('RV-1004','2025-01-21','Commerce Ltd','ops@commltd.com',
   1,3,1,1,
   'Overcharged on Q1 Renewal',
   'Overcharged on Q1 subscription renewal. Invoice shows $450 vs agreed $300.',
   NULL, NULL),

  ('RV-1005','2025-01-21','Kala Radia','k.radia@corp.co',
   4,2,3,4,
   'Dashboard Reports Slow',
   'Dashboard reports extremely slow to load — taking 12+ seconds on average.',
   'Issue escalated and permanently fixed in v2.4 patch.', 4),

  ('RV-1006','2025-02-03','Nova Systems','hello@nova.io',
   2,4,2,2,
   'API Rate Limit Errors',
   'API rate limit errors appearing on production endpoints causing 429 responses.',
   'Patch deploying to staging environment.', NULL),

  ('RV-1007','2025-02-10','Greenleaf Co','contact@green.co',
   3,1,1,3,
   'Enterprise Pricing Inquiry',
   'Requesting information about custom API integration and enterprise pricing.',
   NULL, NULL),

  ('RV-1008','2025-02-14','Orbit Media','billing@orbit.net',
   1,3,3,1,
   'Double Charged February',
   'Double charged for February subscription renewal. Two identical charges on credit card.',
   'Credit of $120 issued to account on file.', 3),

  ('RV-1009','2025-02-20','Pulse Analytics','cto@pulse.com',
   2,2,2,2,
   'CSV Export Failing',
   'CSV data export feature fails silently for datasets larger than 50,000 rows.',
   'Reproducing issue locally.', NULL),

  ('RV-1010','2025-03-01','Bright Digital','help@bright.com',
   4,2,1,4,
   'Confusing Onboarding Flow',
   'Onboarding flow is confusing for new users — 60% drop-off at step 3 of 5.',
   NULL, NULL);


-- ============================================================
--  SEED DATA — Audit trail
-- ============================================================

INSERT INTO complaint_audit_trail (complaint_id, audit_entry) VALUES
  (1,  'Ticket created · Jan 9, 2025'),
  (1,  'Auto-assigned to Christan Michael Diola · Finance Team · Jan 9, 2025'),

  (2,  'Ticket created · Jan 11, 2025'),
  (2,  'Auto-assigned to Kester Marty Laygo · Tech Support · Jan 11, 2025'),
  (2,  'Status changed to In Progress · Jan 12, 2025'),

  (3,  'Ticket created · Jan 15, 2025'),
  (3,  'Auto-assigned to Derick Gabriel Peñaflorida · Customer Success · Jan 15, 2025'),
  (3,  'Status changed to In Progress · Jan 15, 2025'),
  (3,  'Status changed to Resolved · Jan 16, 2025'),
  (3,  'Customer rated experience: ⭐⭐⭐⭐⭐ (5/5) · Jan 17, 2025'),

  (4,  'Ticket created · Jan 21, 2025'),
  (4,  'Auto-assigned to Christan Michael Diola · Finance Team · Jan 21, 2025'),

  (5,  'Ticket created · Jan 21, 2025'),
  (5,  'Auto-assigned to Cedrick Miguel Peñaflorida · Quality Team · Jan 21, 2025'),
  (5,  'Status changed to In Progress · Jan 22, 2025'),
  (5,  'Status changed to Resolved · Jan 24, 2025'),
  (5,  'Customer rated experience: ⭐⭐⭐⭐ (4/5) · Jan 25, 2025'),

  (6,  'Ticket created · Feb 3, 2025'),
  (6,  'Auto-assigned to Kester Marty Laygo · Tech Support · Feb 3, 2025'),
  (6,  'Status changed to In Progress · Feb 4, 2025'),

  (7,  'Ticket created · Feb 10, 2025'),
  (7,  'Auto-assigned to Derick Gabriel Peñaflorida · Customer Success · Feb 10, 2025'),

  (8,  'Ticket created · Feb 14, 2025'),
  (8,  'Auto-assigned to Christan Michael Diola · Finance Team · Feb 14, 2025'),
  (8,  'Status changed to In Progress · Feb 14, 2025'),
  (8,  'Status changed to Resolved · Feb 15, 2025'),
  (8,  'Customer rated experience: ⭐⭐⭐ (3/5) · Feb 16, 2025'),

  (9,  'Ticket created · Feb 20, 2025'),
  (9,  'Auto-assigned to Kester Marty Laygo · Tech Support · Feb 20, 2025'),
  (9,  'Status changed to In Progress · Feb 21, 2025'),

  (10, 'Ticket created · Mar 1, 2025'),
  (10, 'Auto-assigned to Cedrick Miguel Peñaflorida · Quality Team · Mar 1, 2025');


-- ============================================================
--  VERIFICATION QUERIES
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM complaints)                                   AS total_complaints,
  (SELECT COUNT(*) FROM complaints WHERE status_id = 3)               AS resolved,
  (SELECT COUNT(*) FROM complaints WHERE status_id = 2)               AS in_progress,
  (SELECT COUNT(*) FROM complaints WHERE status_id = 1)               AS pending,
  (SELECT ROUND(AVG(satisfaction_rating), 2) FROM complaints
   WHERE satisfaction_rating IS NOT NULL)                             AS avg_rating;

SELECT * FROM v_complaints_full    ORDER BY submitted_date;
SELECT * FROM v_resolution_report;
SELECT * FROM v_staff_workload;
SELECT * FROM v_satisfaction_ratings;

-- ============================================================
--  END OF SCRIPT
-- ============================================================
DROP DATABASE IF EXISTS resolvia_db;