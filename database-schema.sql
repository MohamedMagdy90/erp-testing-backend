-- =============================================================================
-- DNA ERP Testing Portal - Database Schema
-- SQLite Database Schema for Hosting on Any Platform
-- Generated: February 2026
-- =============================================================================

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'tester',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  last_login DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Modules Table
CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Versions Table
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id TEXT UNIQUE NOT NULL,
  version_number TEXT NOT NULL,
  version_name TEXT NOT NULL,
  description TEXT,
  release_date DATE,
  status TEXT DEFAULT 'active',
  is_current BOOLEAN DEFAULT 0,
  features TEXT,        -- JSON array
  bug_fixes TEXT,       -- JSON array
  known_issues TEXT,    -- JSON array
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- TESTING TABLES
-- =============================================================================

-- Test Sessions Table
CREATE TABLE IF NOT EXISTS test_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  tester_name TEXT NOT NULL,
  tester_email TEXT,
  environment TEXT,
  browser TEXT,
  version_id TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  overall_status TEXT,
  overall_notes TEXT
);

-- Test Results Table
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  test_case_title TEXT NOT NULL,
  category TEXT,
  priority TEXT,
  status TEXT DEFAULT 'Not Started',
  passed BOOLEAN DEFAULT 0,
  notes TEXT,
  error_message TEXT,
  screenshots TEXT,
  version_id TEXT,
  tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES test_sessions(session_id)
);

-- Test Feedback Table
CREATE TABLE IF NOT EXISTS test_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  module_name TEXT,
  feedback_type TEXT,
  severity TEXT,
  title TEXT NOT NULL,
  description TEXT,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  screenshots TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES test_sessions(session_id)
);

-- Custom Tests Table
CREATE TABLE IF NOT EXISTS custom_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL,
  category TEXT,
  priority TEXT DEFAULT 'Medium',
  steps TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  prerequisites TEXT,
  test_data TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1,
  tags TEXT,
  applicable_versions TEXT DEFAULT '[]'
);

-- =============================================================================
-- BUG TRACKING TABLES
-- =============================================================================

-- Bugs Table
CREATE TABLE IF NOT EXISTS bugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  steps_to_reproduce TEXT,
  expected_result TEXT,
  actual_result TEXT,

  -- Classification
  priority TEXT DEFAULT 'P3' CHECK(priority IN ('P1', 'P2', 'P3', 'P4')),
  severity TEXT DEFAULT 'Minor' CHECK(severity IN ('Critical', 'Major', 'Minor', 'Trivial')),
  category TEXT,
  type TEXT DEFAULT 'Functional' CHECK(type IN ('Functional', 'UI', 'Performance', 'Security', 'Other')),

  -- Status & Workflow
  status TEXT DEFAULT 'New' CHECK(status IN ('New', 'Triaged', 'Assigned', 'In Progress', 'Fixed', 'Ready for Test', 'Verified', 'Closed', 'Reopened', 'Rejected')),
  resolution TEXT CHECK(resolution IN ('Fixed', 'Won''t Fix', 'Duplicate', 'Cannot Reproduce', 'By Design', NULL)),

  -- Relationships
  linked_tests TEXT,      -- JSON array of test IDs
  related_bugs TEXT,      -- JSON array of bug IDs
  parent_bug_id TEXT,
  module_id TEXT,         -- Links to modules table
  session_id TEXT,        -- Links to test_sessions table

  -- People
  reporter_id TEXT,
  reporter_name TEXT,
  reporter_email TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  verifier_id TEXT,
  verifier_name TEXT,
  verifier_email TEXT,

  -- Environment
  environment TEXT,       -- JSON object with browser, OS, version, URL

  -- Version tracking
  found_in_version TEXT,
  fixed_in_version TEXT,
  target_release TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  verified_at DATETIME,

  -- Additional data
  attachments TEXT,       -- JSON array of attachment URLs/IDs
  tags TEXT,              -- JSON array of tags
  is_deleted BOOLEAN DEFAULT 0,

  FOREIGN KEY (session_id) REFERENCES test_sessions(session_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id)
);

-- Bug Comments Table
CREATE TABLE IF NOT EXISTS bug_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT,
  author_email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_internal BOOLEAN DEFAULT 0,
  FOREIGN KEY (bug_id) REFERENCES bugs(bug_id) ON DELETE CASCADE
);

-- Bug Attachments Table
CREATE TABLE IF NOT EXISTS bug_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attachment_id TEXT UNIQUE NOT NULL,
  bug_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT,
  size INTEGER,
  path TEXT,
  uploaded_by_id TEXT,
  uploaded_by_name TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bug_id) REFERENCES bugs(bug_id) ON DELETE CASCADE
);

-- Bug History Table
CREATE TABLE IF NOT EXISTS bug_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by_id TEXT,
  changed_by_name TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bug_id) REFERENCES bugs(bug_id) ON DELETE CASCADE
);

-- =============================================================================
-- UPCOMING FEATURES TABLES
-- =============================================================================

-- Main Features Table
CREATE TABLE IF NOT EXISTS upcoming_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- Business Value
  business_value TEXT,
  user_story TEXT,
  acceptance_criteria TEXT,

  -- Classification
  priority TEXT DEFAULT 'P3' CHECK(priority IN ('P1', 'P2', 'P3', 'P4')),
  feature_type TEXT DEFAULT 'Enhancement' CHECK(feature_type IN (
    'New Feature',
    'Enhancement',
    'Improvement',
    'Technical Debt',
    'Refactoring'
  )),
  category TEXT,
  complexity TEXT DEFAULT 'Medium' CHECK(complexity IN ('Low', 'Medium', 'High', 'Very High')),

  -- Status & Workflow
  status TEXT DEFAULT 'Planned' CHECK(status IN (
    'Planned',
    'In Design',
    'Ready for Dev',
    'In Development',
    'Code Review',
    'Ready for Test',
    'In Testing',
    'Test Failed',
    'Completed',
    'On Hold',
    'Cancelled'
  )),

  -- Relationships
  module_id TEXT NOT NULL,
  target_version TEXT NOT NULL,
  linked_tests TEXT,         -- JSON array
  related_features TEXT,     -- JSON array
  dependencies TEXT,         -- JSON array
  blocks TEXT,               -- JSON array

  -- People
  creator_id TEXT,
  creator_name TEXT NOT NULL,
  creator_email TEXT,
  owner_id TEXT,
  owner_name TEXT,
  owner_email TEXT,
  developer_id TEXT,
  developer_name TEXT,
  developer_email TEXT,
  tester_id TEXT,
  tester_name TEXT,
  tester_email TEXT,

  -- Estimation & Progress
  estimated_hours REAL,
  actual_hours REAL,
  progress_percentage INTEGER DEFAULT 0 CHECK(progress_percentage >= 0 AND progress_percentage <= 100),

  -- Date Fields (for timeline visualization)
  start_date DATE,
  end_date DATE,

  -- Technical Details
  technical_notes TEXT,
  api_endpoints TEXT,
  database_changes TEXT,
  dependencies_external TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  released_at DATETIME,

  -- Additional data
  attachments TEXT,          -- JSON array
  tags TEXT,                 -- JSON array
  is_deleted BOOLEAN DEFAULT 0,

  FOREIGN KEY (module_id) REFERENCES modules(module_id),
  FOREIGN KEY (target_version) REFERENCES versions(version_id)
);

-- Feature Comments Table
CREATE TABLE IF NOT EXISTS feature_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT,
  is_internal BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feature_id) REFERENCES upcoming_features(feature_id) ON DELETE CASCADE
);

-- Feature History Table
CREATE TABLE IF NOT EXISTS feature_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by_id TEXT,
  changed_by_name TEXT NOT NULL,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feature_id) REFERENCES upcoming_features(feature_id) ON DELETE CASCADE
);

-- Feature Attachments Table
CREATE TABLE IF NOT EXISTS feature_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attachment_id TEXT UNIQUE NOT NULL,
  feature_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT,
  size INTEGER,
  path TEXT NOT NULL,
  uploaded_by_id TEXT,
  uploaded_by_name TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feature_id) REFERENCES upcoming_features(feature_id) ON DELETE CASCADE
);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Module Statistics View
CREATE VIEW IF NOT EXISTS module_statistics AS
SELECT
  module_name,
  COUNT(DISTINCT test_case_id) as total_tests,
  SUM(CASE WHEN UPPER(status) = 'PASS' THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN UPPER(status) = 'FAIL' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN UPPER(status) = 'BLOCKED' THEN 1 ELSE 0 END) as blocked,
  SUM(CASE WHEN UPPER(status) = 'NOT STARTED' THEN 1 ELSE 0 END) as not_started,
  MAX(tested_at) as last_tested
FROM test_results
GROUP BY module_name;

-- Bug Statistics View
CREATE VIEW IF NOT EXISTS bug_statistics AS
SELECT
  module_id,
  COUNT(*) as total_bugs,
  SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_bugs,
  SUM(CASE WHEN status IN ('Assigned', 'In Progress') THEN 1 ELSE 0 END) as in_progress,
  SUM(CASE WHEN status = 'Fixed' THEN 1 ELSE 0 END) as fixed,
  SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) as verified,
  SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
  SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) as p1_bugs,
  SUM(CASE WHEN priority = 'P2' THEN 1 ELSE 0 END) as p2_bugs,
  SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) as critical_bugs
FROM bugs
GROUP BY module_id;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Bug Indexes
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_assignee ON bugs(assignee_id);
CREATE INDEX IF NOT EXISTS idx_bugs_priority ON bugs(priority);
CREATE INDEX IF NOT EXISTS idx_bugs_module ON bugs(module_id);
CREATE INDEX IF NOT EXISTS idx_bug_comments_bug_id ON bug_comments(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_attachments_bug_id ON bug_attachments(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_history_bug_id ON bug_history(bug_id);

-- Feature Indexes
CREATE INDEX IF NOT EXISTS idx_features_module ON upcoming_features(module_id);
CREATE INDEX IF NOT EXISTS idx_features_version ON upcoming_features(target_version);
CREATE INDEX IF NOT EXISTS idx_features_status ON upcoming_features(status);
CREATE INDEX IF NOT EXISTS idx_features_owner ON upcoming_features(owner_id);
CREATE INDEX IF NOT EXISTS idx_features_created ON upcoming_features(created_at);
CREATE INDEX IF NOT EXISTS idx_feature_comments_feature ON feature_comments(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_history_feature ON feature_history(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_attachments_feature ON feature_attachments(feature_id);

-- =============================================================================
-- DEFAULT DATA
-- =============================================================================

-- Default Admin and Test Users
INSERT OR IGNORE INTO users (id, email, password, name, role, status) VALUES
  ('admin-001', 'admin@dnaerp.com', 'admin123', 'System Administrator', 'admin', 'active'),
  ('tester-001', 'tester@dnaerp.com', 'tester123', 'Test User', 'tester', 'active');

-- Default Modules
INSERT OR IGNORE INTO modules (module_id, name, description, icon, display_order, created_by) VALUES
  ('MOD_INV', 'Inventory Management', 'Inventory, warehouse, and stock management', 'Package', 1, 'System'),
  ('MOD_PUR', 'Purchases & Procurement', 'Purchase orders, vendors, and procurement', 'ShoppingCart', 2, 'System'),
  ('MOD_SAL', 'Sales & CRM', 'Sales orders, customers, and CRM', 'Users', 3, 'System'),
  ('MOD_FIN', 'Finance & Accounting', 'Financial management and accounting', 'Calculator', 4, 'System'),
  ('MOD_BUD', 'Budget & Planning', 'Budget planning and financial forecasting', 'DollarSign', 5, 'System'),
  ('MOD_SYS', 'System Administration', 'System configuration and administration', 'Shield', 6, 'System'),
  ('MOD_INT', 'Integration & Interfaces', 'External integrations and API interfaces', 'RefreshCw', 7, 'System');

-- Default Versions
INSERT OR IGNORE INTO versions (version_id, version_number, version_name, description, release_date, status, is_current, features, bug_fixes, known_issues, created_by) VALUES
  ('VER_1_0_0', '1.0.0', 'Initial Release', 'Initial version of DNA ERP system', '2024-01-01', 'archived', 0, '["Core modules", "User management", "Basic reporting"]', '[]', '["Performance optimization needed"]', 'System'),
  ('VER_1_1_0', '1.1.0', 'Feature Update', 'Added inventory management and improved UI', '2024-06-01', 'active', 0, '["Advanced inventory", "UI improvements", "API enhancements"]', '["Fixed login issues", "Resolved data export bugs"]', '["Minor UI glitches in reports"]', 'System'),
  ('VER_1_2_0', '1.2.0', 'Current Release', 'Latest stable version with all features', '2024-10-01', 'active', 1, '["Budget planning", "Enhanced security", "Mobile responsive"]', '["Fixed calculation errors", "Improved performance"]', '[]', 'System');

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
