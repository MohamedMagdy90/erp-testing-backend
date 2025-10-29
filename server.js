const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create uploads directory - use persistent disk on Render if available
let uploadsDir;
try {
  // Check if we can write to /var/data (Render persistent disk)
  if (fs.existsSync('/var/data')) {
    // Test write permissions
    const testFile = '/var/data/.write-test';
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    uploadsDir = '/var/data/uploads';
    console.log('Using Render persistent disk at /var/data/uploads');
  } else {
    throw new Error('/var/data does not exist');
  }
} catch (error) {
  // Fallback to local directory
  uploadsDir = path.join(__dirname, 'uploads');
  console.log('Using local uploads directory:', uploadsDir);
  console.log('Note: File uploads will not persist across deployments without persistent disk');
}

// Create uploads directory
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }
} catch (error) {
  console.error('Error creating uploads directory:', error);
  // Continue without uploads - server can still run
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const bugUploadsDir = path.join(uploadsDir, 'bugs');
    if (!fs.existsSync(bugUploadsDir)) {
      fs.mkdirSync(bugUploadsDir, { recursive: true });
    }
    cb(null, bugUploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `bug-attachment-${uniqueSuffix}${ext}`);
  }
});

// File filter to allow only certain file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|rar|mp4|mov|avi/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not allowed. Allowed types: images, documents, videos, archives'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  },
  fileFilter: fileFilter
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Safe JSON parsing helper with better error handling
function safeJsonParse(str, defaultValue) {
  try {
    // Handle null, undefined, or empty strings
    if (!str || str === '' || str === 'null' || str === 'undefined') {
      return defaultValue;
    }

    // Check if it's already an object/array (shouldn't happen but be safe)
    if (typeof str === 'object') {
      return str;
    }

    // Try to parse as JSON
    return JSON.parse(str);
  } catch (error) {
    // Only log parse errors in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('JSON parse error:', error.message, 'Input:', str ? str.substring(0, 100) : 'empty');
    }

    // If it's a simple string that should be an array, try to convert it
    if (typeof str === 'string' && Array.isArray(defaultValue)) {
      // Check if it looks like a comma or newline separated list
      if (str.includes(',') || str.includes('\n')) {
        const items = str.split(/[,\n]/).map(s => s.trim()).filter(s => s);
        // Debug only in development
        if (process.env.NODE_ENV !== 'production') {
          console.log('Converted corrupted string to array:', items);
        }
        return items;
      }
      // Single item - make it an array
      if (process.env.NODE_ENV !== 'production') {
        console.log('Converted single string to array:', [str]);
      }
      return [str];
    }

    return defaultValue;
  }
}

// Database path - use /var/data for Render.com persistent disk if available
let dbPath;
try {
  // Check if we can write to /var/data (Render persistent disk)
  if (fs.existsSync('/var/data')) {
    // Test write permissions
    const testFile = '/var/data/.db-write-test';
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    dbPath = '/var/data/testing_feedback.db';
    console.log('Using Render persistent disk for database at:', dbPath);
  } else {
    throw new Error('/var/data does not exist');
  }
} catch (error) {
  // Fallback to local directory
  dbPath = './testing_feedback.db';
  console.log('Using local database at:', dbPath);
  console.log('WARNING: Database will not persist across deployments without persistent disk');
}

let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS test_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      tester_name TEXT NOT NULL,
      tester_email TEXT,
      environment TEXT,
      browser TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      overall_status TEXT,
      overall_notes TEXT
    )
  `, (err) => {
    if (err) console.error('Error creating test_sessions table:', err);
    else console.log('Test sessions table ready');
  });

  db.run(`
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
      tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES test_sessions(session_id)
    )
  `, (err) => {
    if (err) console.error('Error creating test_results table:', err);
    else console.log('Test results table ready');
  });

  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creating test_feedback table:', err);
    else console.log('Test feedback table ready');
  });

  db.run(`
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
    GROUP BY module_name
  `, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Error creating view:', err);
    }
  });

  db.run(`
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
      tags TEXT
    )
  `, (err) => {
    if (err) console.error('Error creating custom_tests table:', err);
    else console.log('Custom tests table ready');
  });

  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creating users table:', err);
    else {
      console.log('Users table ready');
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (!err && row.count === 0) {
          const defaultUsers = [
            {
              id: 'admin-001',
              email: 'admin@dnaerp.com',
              password: 'admin123',
              name: 'System Administrator',
              role: 'admin',
              status: 'active'
            },
            {
              id: 'tester-001',
              email: 'tester@dnaerp.com',
              password: 'tester123',
              name: 'Test User',
              role: 'tester',
              status: 'active'
            }
          ];

          defaultUsers.forEach(user => {
            db.run(
              `INSERT INTO users (id, email, password, name, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
              [user.id, user.email, user.password, user.name, user.role, user.status],
              (err) => {
                if (err) console.error('Error creating default user:', err);
              }
            );
          });
          console.log('Default users created');
        }
      });
    }
  });

  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creating modules table:', err);
    else {
      console.log('Modules table ready');
      db.get('SELECT COUNT(*) as count FROM modules', [], (err, row) => {
        if (!err && row.count === 0) {
          const defaultModules = [
            {
              module_id: 'MOD_INV',
              name: 'Inventory Management',
              description: 'Inventory, warehouse, and stock management',
              icon: 'Package',
              display_order: 1
            },
            {
              module_id: 'MOD_PUR',
              name: 'Purchases & Procurement',
              description: 'Purchase orders, vendors, and procurement',
              icon: 'ShoppingCart',
              display_order: 2
            },
            {
              module_id: 'MOD_SAL',
              name: 'Sales & CRM',
              description: 'Sales orders, customers, and CRM',
              icon: 'Users',
              display_order: 3
            },
            {
              module_id: 'MOD_FIN',
              name: 'Finance & Accounting',
              description: 'Financial management and accounting',
              icon: 'Calculator',
              display_order: 4
            },
            {
              module_id: 'MOD_BUD',
              name: 'Budget & Planning',
              description: 'Budget planning and financial forecasting',
              icon: 'DollarSign',
              display_order: 5
            },
            {
              module_id: 'MOD_SYS',
              name: 'System Administration',
              description: 'System configuration and administration',
              icon: 'Shield',
              display_order: 6
            },
            {
              module_id: 'MOD_INT',
              name: 'Integration & Interfaces',
              description: 'External integrations and API interfaces',
              icon: 'RefreshCw',
              display_order: 7
            }
          ];

          defaultModules.forEach(module => {
            db.run(
              `INSERT INTO modules (module_id, name, description, icon, display_order, created_by)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [module.module_id, module.name, module.description, module.icon, module.display_order, 'System'],
              (err) => {
                if (err) console.error('Error creating default module:', err);
              }
            );
          });
          console.log('Default modules created');
        }
      });
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id TEXT UNIQUE NOT NULL,
      version_number TEXT NOT NULL,
      version_name TEXT NOT NULL,
      description TEXT,
      release_date DATE,
      status TEXT DEFAULT 'active',
      is_current BOOLEAN DEFAULT 0,
      features TEXT,
      bug_fixes TEXT,
      known_issues TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating versions table:', err);
    else {
      console.log('Versions table ready');
      db.get('SELECT COUNT(*) as count FROM versions', [], (err, row) => {
        if (!err && row.count === 0) {
          const defaultVersions = [
            {
              version_id: 'VER_1_0_0',
              version_number: '1.0.0',
              version_name: 'Initial Release',
              description: 'Initial version of DNA ERP system',
              release_date: '2024-01-01',
              status: 'archived',
              is_current: 0,
              features: JSON.stringify(['Core modules', 'User management', 'Basic reporting']),
              bug_fixes: JSON.stringify([]),
              known_issues: JSON.stringify(['Performance optimization needed'])
            },
            {
              version_id: 'VER_1_1_0',
              version_number: '1.1.0',
              version_name: 'Feature Update',
              description: 'Added inventory management and improved UI',
              release_date: '2024-06-01',
              status: 'active',
              is_current: 0,
              features: JSON.stringify(['Advanced inventory', 'UI improvements', 'API enhancements']),
              bug_fixes: JSON.stringify(['Fixed login issues', 'Resolved data export bugs']),
              known_issues: JSON.stringify(['Minor UI glitches in reports'])
            },
            {
              version_id: 'VER_1_2_0',
              version_number: '1.2.0',
              version_name: 'Current Release',
              description: 'Latest stable version with all features',
              release_date: '2024-10-01',
              status: 'active',
              is_current: 1,
              features: JSON.stringify(['Budget planning', 'Enhanced security', 'Mobile responsive']),
              bug_fixes: JSON.stringify(['Fixed calculation errors', 'Improved performance']),
              known_issues: JSON.stringify([])
            }
          ];

          defaultVersions.forEach(version => {
            db.run(
              `INSERT INTO versions (version_id, version_number, version_name, description, release_date, status, is_current, features, bug_fixes, known_issues, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                version.version_id,
                version.version_number,
                version.version_name,
                version.description,
                version.release_date,
                version.status,
                version.is_current,
                version.features,
                version.bug_fixes,
                version.known_issues,
                'System'
              ],
              (err) => {
                if (err) console.error('Error creating default version:', err);
              }
            );
          });
          console.log('Default versions created');
        }
      });
    }
  });

  // Add version_id column to existing tables to link with versions
  db.run(`
    ALTER TABLE test_sessions ADD COLUMN version_id TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding version_id to test_sessions:', err);
    }
  });

  db.run(`
    ALTER TABLE test_results ADD COLUMN version_id TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding version_id to test_results:', err);
    }
  });

  db.run(`
    ALTER TABLE custom_tests ADD COLUMN applicable_versions TEXT DEFAULT '[]'
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding applicable_versions to custom_tests:', err);
    }
  });

  // ============ BUG TRACKING TABLES - NEW FEATURE ============
  // These tables integrate bug tracking into the existing testing system
  // Use serialize to ensure tables are created in order
  db.serialize(() => {
    db.run(`
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

      -- Relationships to existing system
      linked_tests TEXT, -- JSON array of test IDs from test_results table
      related_bugs TEXT, -- JSON array of bug IDs
      parent_bug_id TEXT,
      module_id TEXT, -- Links to modules table
      session_id TEXT, -- Links to test_sessions table that found the bug

      -- People (using existing user system)
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
      environment TEXT, -- JSON object with browser, OS, version, URL

      -- Version tracking (links to versions table)
      found_in_version TEXT,
      fixed_in_version TEXT,
      target_release TEXT,

      -- Timestamps
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      verified_at DATETIME,

      -- Additional data
      attachments TEXT, -- JSON array of attachment URLs/IDs
      tags TEXT, -- JSON array of tags
      is_deleted BOOLEAN DEFAULT 0, -- Track explicitly deleted bugs

      FOREIGN KEY (session_id) REFERENCES test_sessions(session_id),
      FOREIGN KEY (module_id) REFERENCES modules(module_id)
    )
  `, (err) => {
    if (err) console.error('Error creating bugs table:', err);
    else console.log('Bugs table ready - Bug tracking feature initialized');
  });

  // Bug Comments Table for collaboration
  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creating bug_comments table:', err);
    else console.log('Bug comments table ready');
  });

  // Bug Attachments Table for file uploads
  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creating bug_attachments table:', err);
    else console.log('Bug attachments table ready');
  });

  // Bug History Table for tracking all changes
  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creating bug_history table:', err);
    else console.log('Bug history table ready');
  });

  // Add is_deleted column to bugs table (for existing databases)
  db.run(`
    ALTER TABLE bugs ADD COLUMN is_deleted BOOLEAN DEFAULT 0
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Note: is_deleted column may already exist or will be created with table');
    }
  });

  // Create indexes for better performance - wrapped in serialize for proper sequencing
  db.serialize(() => {
    // Create bug table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bugs status index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_bugs_assignee ON bugs(assignee_id)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bugs assignee index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_bugs_priority ON bugs(priority)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bugs priority index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_bugs_module ON bugs(module_id)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bugs module index:', err);
      }
    });

    // Create bug_comments index with proper error handling
    db.run(`CREATE INDEX IF NOT EXISTS idx_bug_comments_bug_id ON bug_comments(bug_id)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bug_comments index:', err);
      }
    });

    // Create bug_attachments index
    db.run(`CREATE INDEX IF NOT EXISTS idx_bug_attachments_bug_id ON bug_attachments(bug_id)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bug_attachments index:', err);
      }
    });

    // Create bug_history index
    db.run(`CREATE INDEX IF NOT EXISTS idx_bug_history_bug_id ON bug_history(bug_id)`, (err) => {
      if (err && !err.message.includes('already exists') && !err.message.includes('no such table')) {
        console.error('Error creating bug_history index:', err);
      }
    });
  });
  }); // End of serialize block for bug tables

  // Create a view for bug statistics
  db.run(`
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
    GROUP BY module_id
  `, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Error creating bug_statistics view:', err);
    }
  });

  // ============ UPCOMING FEATURES TABLES - NEW FEATURE ============
  // These tables enable feature planning and tracking for upcoming releases
  db.serialize(() => {
    // Main Features Table
    db.run(`
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
        linked_tests TEXT,
        related_features TEXT,
        dependencies TEXT,
        blocks TEXT,

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
        attachments TEXT,
        tags TEXT,
        is_deleted BOOLEAN DEFAULT 0,

        FOREIGN KEY (module_id) REFERENCES modules(module_id),
        FOREIGN KEY (target_version) REFERENCES versions(version_id)
      )
    `, (err) => {
      if (err) console.error('Error creating upcoming_features table:', err);
      else console.log('Upcoming features table ready - Feature planning initialized');
    });

    // Feature Comments Table
    db.run(`
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
      )
    `, (err) => {
      if (err) console.error('Error creating feature_comments table:', err);
      else console.log('Feature comments table ready');
    });

    // Feature History Table
    db.run(`
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
      )
    `, (err) => {
      if (err) console.error('Error creating feature_history table:', err);
      else console.log('Feature history table ready');
    });

    // Feature Attachments Table
    db.run(`
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
      )
    `, (err) => {
      if (err) console.error('Error creating feature_attachments table:', err);
      else console.log('Feature attachments table ready');
    });

    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_features_module ON upcoming_features(module_id)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating features module index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_features_version ON upcoming_features(target_version)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating features version index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_features_status ON upcoming_features(status)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating features status index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_features_owner ON upcoming_features(owner_id)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating features owner index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_features_created ON upcoming_features(created_at)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating features created index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_feature_comments_feature ON feature_comments(feature_id)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating feature_comments index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_feature_history_feature ON feature_history(feature_id)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating feature_history index:', err);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_feature_attachments_feature ON feature_attachments(feature_id)`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Error creating feature_attachments index:', err);
      }
    });
  }); // End of serialize block for feature tables
}

// API Routes

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    database: fs.existsSync(dbPath) ? 'connected' : 'initializing',
    uploads: fs.existsSync(uploadsDir) ? 'available' : 'unavailable'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ERP Testing Portal Backend API',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      api: '/api/*'
    }
  });
});

app.post('/api/sessions', (req, res) => {
  const { tester_name, tester_email, environment, browser, version_id } = req.body;
  const session_id = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  db.run(
    `INSERT INTO test_sessions (session_id, tester_name, tester_email, environment, browser, version_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [session_id, tester_name, tester_email, environment, browser, version_id || null],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          session_id,
          message: 'Test session created successfully'
        });
      }
    }
  );
});

app.get('/api/sessions', (req, res) => {
  db.all(
    `SELECT * FROM test_sessions ORDER BY started_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

app.get('/api/sessions/:session_id', (req, res) => {
  const { session_id } = req.params;

  db.get(
    `SELECT * FROM test_sessions WHERE session_id = ?`,
    [session_id],
    (err, session) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!session) {
        res.status(404).json({ error: 'Session not found' });
      } else {
        db.all(
          `SELECT * FROM test_results WHERE session_id = ? ORDER BY tested_at DESC`,
          [session_id],
          (err, results) => {
            if (err) {
              res.status(500).json({ error: err.message });
            } else {
              db.all(
                `SELECT * FROM test_feedback WHERE session_id = ? ORDER BY created_at DESC`,
                [session_id],
                (err, feedback) => {
                  if (err) {
                    res.status(500).json({ error: err.message });
                  } else {
                    res.json({
                      session,
                      results,
                      feedback
                    });
                  }
                }
              );
            }
          }
        );
      }
    }
  );
});

app.post('/api/results', (req, res) => {
  const {
    session_id,
    module_name,
    test_case_id,
    test_case_title,
    category,
    priority,
    status,
    passed,
    notes,
    error_message,
    screenshots,
    version_id
  } = req.body;

  db.run(
    `INSERT INTO test_results
     (session_id, module_name, test_case_id, test_case_title, category, priority, status, passed, notes, error_message, screenshots, version_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [session_id, module_name, test_case_id, test_case_title, category, priority, status, passed, notes, error_message, screenshots, version_id || null],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          id: this.lastID,
          message: 'Test result saved successfully'
        });
      }
    }
  );
});

app.post('/api/feedback', (req, res) => {
  const {
    session_id,
    module_name,
    feedback_type,
    severity,
    title,
    description,
    steps_to_reproduce,
    expected_behavior,
    actual_behavior,
    screenshots
  } = req.body;

  db.run(
    `INSERT INTO test_feedback
     (session_id, module_name, feedback_type, severity, title, description, steps_to_reproduce, expected_behavior, actual_behavior, screenshots)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [session_id, module_name, feedback_type, severity, title, description, steps_to_reproduce, expected_behavior, actual_behavior, screenshots],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          id: this.lastID,
          message: 'Feedback submitted successfully'
        });
      }
    }
  );
});

app.get('/api/results/module/:module_name', (req, res) => {
  const { module_name } = req.params;

  db.all(
    `SELECT * FROM test_results WHERE module_name = ? ORDER BY tested_at DESC`,
    [module_name],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

app.get('/api/feedback', (req, res) => {
  const { severity, module_name, feedback_type } = req.query;

  let query = `SELECT * FROM test_feedback WHERE 1=1`;
  const params = [];

  if (severity) {
    query += ` AND severity = ?`;
    params.push(severity);
  }

  if (module_name) {
    query += ` AND module_name = ?`;
    params.push(module_name);
  }

  if (feedback_type) {
    query += ` AND feedback_type = ?`;
    params.push(feedback_type);
  }

  query += ` ORDER BY created_at DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/statistics', (req, res) => {
  const queries = {
    totalSessions: `SELECT COUNT(*) as count FROM test_sessions`,
    totalTests: `SELECT COUNT(*) as count FROM test_results`,
    totalFeedback: `SELECT COUNT(*) as count FROM test_feedback`,
    moduleStats: `SELECT * FROM module_statistics`,
    recentSessions: `SELECT * FROM test_sessions ORDER BY started_at DESC LIMIT 5`,
    criticalBugs: `SELECT COUNT(*) as count FROM test_feedback WHERE severity = 'Critical'`,
    testsByStatus: `
      SELECT
        CASE
          WHEN UPPER(status) = 'PASS' THEN 'Pass'
          WHEN UPPER(status) = 'FAIL' THEN 'Fail'
          WHEN UPPER(status) = 'BLOCKED' THEN 'Blocked'
          WHEN UPPER(status) = 'NOT STARTED' THEN 'Not Started'
          ELSE status
        END as status,
        COUNT(*) as count
      FROM test_results
      GROUP BY CASE
        WHEN UPPER(status) = 'PASS' THEN 'Pass'
        WHEN UPPER(status) = 'FAIL' THEN 'Fail'
        WHEN UPPER(status) = 'BLOCKED' THEN 'Blocked'
        WHEN UPPER(status) = 'NOT STARTED' THEN 'Not Started'
        ELSE status
      END
    `,
    recentTests: `
      SELECT
        tr.test_case_id,
        tr.test_case_title,
        tr.module_name,
        tr.status,
        tr.tested_at,
        ts.tester_name
      FROM test_results tr
      LEFT JOIN test_sessions ts ON tr.session_id = ts.session_id
      ORDER BY tr.tested_at DESC
      LIMIT 10
    `
  };

  const stats = {};
  let completed = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error(`Error in ${key}:`, err);
        stats[key] = null;
      } else {
        stats[key] = rows.length === 1 && rows[0].count !== undefined ? rows[0].count : rows;
      }

      completed++;
      if (completed === totalQueries) {
        res.json(stats);
      }
    });
  });
});

app.put('/api/sessions/:session_id', (req, res) => {
  const { session_id } = req.params;
  const { overall_status, overall_notes } = req.body;

  db.run(
    `UPDATE test_sessions
     SET overall_status = ?, overall_notes = ?, completed_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
    [overall_status, overall_notes, session_id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          message: 'Session updated successfully'
        });
      }
    }
  );
});

// Custom Tests API Endpoints

app.post('/api/custom-tests', (req, res) => {
  const {
    title,
    description,
    module,
    category,
    priority,
    steps,
    expected_result,
    prerequisites,
    test_data,
    created_by,
    tags
  } = req.body;

  const test_id = `CUSTOM-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  db.run(
    `INSERT INTO custom_tests
     (test_id, title, description, module, category, priority, steps, expected_result, prerequisites, test_data, created_by, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      test_id,
      title,
      description,
      module,
      category || 'Custom',
      priority || 'Medium',
      JSON.stringify(steps),
      expected_result,
      JSON.stringify(prerequisites || []),
      test_data,
      created_by,
      JSON.stringify(tags || [])
    ],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          test_id,
          id: this.lastID,
          message: 'Custom test created successfully'
        });
      }
    }
  );
});

// Get all custom tests
app.get('/api/custom-tests', (req, res) => {
  const query = `
    SELECT * FROM custom_tests
    WHERE is_active = 1
    ORDER BY created_at DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching custom tests:', err);
      res.status(500).json({ error: 'Failed to fetch custom tests' });
      return;
    }

    // Parse JSON fields with error handling and data validation
    const tests = [];
    rows.forEach(row => {
      try {
        // Validate and clean the data before parsing
        let steps = [];
        let prerequisites = [];
        let test_data = {};
        let tags = [];

        // Safely parse steps
        if (row.steps) {
          try {
            const parsed = safeJsonParse(row.steps, []);
            steps = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error(`Invalid steps for test ${row.test_id}:`, row.steps);
            steps = [];
          }
        }

        // Safely parse prerequisites
        if (row.prerequisites) {
          try {
            const parsed = safeJsonParse(row.prerequisites, []);
            prerequisites = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error(`Invalid prerequisites for test ${row.test_id}:`, row.prerequisites);
            prerequisites = [];
          }
        }

        // Safely parse test_data
        if (row.test_data) {
          try {
            const parsed = safeJsonParse(row.test_data, {});
            test_data = typeof parsed === 'object' && parsed !== null ? parsed : {};
          } catch (e) {
            console.error(`Invalid test_data for test ${row.test_id}:`, row.test_data);
            test_data = {};
          }
        }

        // Safely parse tags
        if (row.tags) {
          try {
            const parsed = safeJsonParse(row.tags, []);
            tags = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error(`Invalid tags for test ${row.test_id}:`, row.tags);
            tags = [];
          }
        }

        tests.push({
          ...row,
          steps: steps,
          prerequisites: prerequisites,
          test_data: test_data,
          tags: tags
        });
      } catch (error) {
        console.error('Error processing custom test row:', row.test_id, error);
        // Skip this row if it has critical errors
      }
    });

    res.json(tests);
  });
});

// Add endpoint to fix prerequisites stored as strings
app.post('/api/admin/fix-prerequisites', (req, res) => {
  console.log('Fixing prerequisites stored as plain strings...');

  db.all(`SELECT test_id, prerequisites FROM custom_tests`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch tests' });
    }

    let fixed = 0;
    let errors = 0;

    rows.forEach(row => {
      if (row.prerequisites && typeof row.prerequisites === 'string') {
        try {
          // Try to parse as JSON first
          JSON.parse(row.prerequisites);
        } catch (e) {
          // Not valid JSON, convert to JSON array
          const jsonPrereqs = JSON.stringify([row.prerequisites]);

          db.run(
            `UPDATE custom_tests SET prerequisites = ? WHERE test_id = ?`,
            [jsonPrereqs, row.test_id],
            (updateErr) => {
              if (updateErr) {
                console.error('Error fixing prerequisites for test:', row.test_id, updateErr);
                errors++;
              } else {
                fixed++;
              }
            }
          );
        }
      }
    });

    setTimeout(() => {
      res.json({
        success: true,
        message: `Fixed ${fixed} tests, ${errors} errors`
      });
    }, 2000);
  });
});

// Add endpoint to clean corrupted data (admin only)
app.post('/api/admin/clean-corrupted-data', (req, res) => {
  // This endpoint should be protected with authentication in production

  // Clean up corrupted JSON data in custom_tests table
  db.all('SELECT * FROM custom_tests', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch tests for cleaning' });
      return;
    }

    let cleaned = 0;
    let errors = 0;

    rows.forEach(row => {
      let needsUpdate = false;
      let updates = {};

      // Check and clean each JSON field
      ['steps', 'prerequisites', 'test_data', 'tags'].forEach(field => {
        if (row[field]) {
          try {
            JSON.parse(row[field]);
          } catch (e) {
            // Field has invalid JSON, replace with empty array/object
            needsUpdate = true;
            updates[field] = field === 'test_data' ? '{}' : '[]';
            console.log(`Cleaning corrupted ${field} in test ${row.test_id}`);
          }
        }
      });

      if (needsUpdate) {
        const updateFields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
        const updateValues = Object.values(updates);
        updateValues.push(row.test_id);

        db.run(
          `UPDATE custom_tests SET ${updateFields} WHERE test_id = ?`,
          updateValues,
          (err) => {
            if (err) {
              console.error('Error cleaning test:', row.test_id, err);
              errors++;
            } else {
              cleaned++;
            }
          }
        );
      }
    });

    setTimeout(() => {
      res.json({
        success: true,
        message: `Cleaned ${cleaned} records, ${errors} errors`
      });
    }, 2000);
  });
});

app.get('/api/custom-tests/:test_id', (req, res) => {
  const { test_id } = req.params;

  db.get(
    `SELECT * FROM custom_tests WHERE test_id = ?`,
    [test_id],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Test not found' });
      } else {
        try {
          const test = {
            ...row,
            steps: safeJsonParse(row.steps, []),
            prerequisites: safeJsonParse(row.prerequisites, []),
            test_data: safeJsonParse(row.test_data, {}),
            tags: safeJsonParse(row.tags, [])
          };
          res.json(test);
        } catch (error) {
          console.error('Error processing custom test:', row.test_id, error);
          res.json({
            ...row,
            steps: [],
            prerequisites: [],
            test_data: {},
            tags: []
          });
        }
      }
    }
  );
});

app.post('/api/custom-tests/sync', (req, res) => {
  const { tests } = req.body;

  if (!Array.isArray(tests)) {
    res.status(400).json({ error: 'Tests must be an array' });
    return;
  }

  let processed = 0;
  let errors = [];

  const processTest = (index) => {
    if (index >= tests.length) {
      res.json({
        success: true,
        processed,
        errors: errors.length > 0 ? errors : undefined
      });
      return;
    }

    const test = tests[index];

    db.get(
      'SELECT id FROM custom_tests WHERE test_id = ?',
      [test.test_id],
      (err, existing) => {
        if (err) {
          errors.push({ test_id: test.test_id, error: err.message });
          processTest(index + 1);
          return;
        }

        if (existing) {
          const updateQuery = `
            UPDATE custom_tests SET
              title = ?, description = ?, module = ?, category = ?,
              priority = ?, steps = ?, expected_result = ?,
              prerequisites = ?, test_data = ?, tags = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE test_id = ?
          `;

          db.run(
            updateQuery,
            [
              test.title,
              test.description || '',
              test.module,
              test.category || 'General',
              test.priority || 'Medium',
              JSON.stringify(test.steps || []),
              test.expected_result,
              JSON.stringify(test.prerequisites || []),
              JSON.stringify(test.test_data || {}),
              JSON.stringify(test.tags || []),
              test.test_id
            ],
            (err) => {
              if (err) {
                errors.push({ test_id: test.test_id, error: err.message });
              } else {
                processed++;
              }
              processTest(index + 1);
            }
          );
        } else {
          const insertQuery = `
            INSERT INTO custom_tests (
              test_id, title, description, module, category, priority,
              steps, expected_result, prerequisites, test_data, created_by, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(
            insertQuery,
            [
              test.test_id || `CT_${Date.now()}_${index}`,
              test.title,
              test.description || '',
              test.module,
              test.category || 'General',
              test.priority || 'Medium',
              JSON.stringify(test.steps || []),
              test.expected_result,
              JSON.stringify(test.prerequisites || []),
              JSON.stringify(test.test_data || {}),
              test.created_by || 'System',
              JSON.stringify(test.tags || [])
            ],
            (err) => {
              if (err) {
                errors.push({ test_id: test.test_id, error: err.message });
              } else {
                processed++;
              }
              processTest(index + 1);
            }
          );
        }
      }
    );
  };

  processTest(0);
});

app.put('/api/custom-tests/:test_id', (req, res) => {
  const { test_id } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];

  Object.keys(updates).forEach(key => {
    if (key !== 'test_id' && key !== 'id' && key !== 'created_at') {
      fields.push(`${key} = ?`);

      if (['steps', 'prerequisites', 'tags'].includes(key)) {
        values.push(JSON.stringify(updates[key]));
      } else {
        values.push(updates[key]);
      }
    }
  });

  fields.push('updated_at = CURRENT_TIMESTAMP');

  values.push(test_id);

  const query = `UPDATE custom_tests SET ${fields.join(', ')} WHERE test_id = ?`;

  db.run(query, values, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Test not found' });
    } else {
      res.json({
        success: true,
        message: 'Custom test updated successfully'
      });
    }
  });
});

app.delete('/api/custom-tests/:test_id', (req, res) => {
  const { test_id } = req.params;

  db.run(
    `UPDATE custom_tests SET is_active = 0 WHERE test_id = ?`,
    [test_id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Test not found' });
      } else {
        res.json({
          success: true,
          message: 'Custom test deleted successfully'
        });
      }
    }
  );
});

// User Management API Endpoints

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  db.get(
    `SELECT id, email, name, role, status FROM users WHERE email = ? AND password = ? AND status = 'active'`,
    [email.toLowerCase(), password],
    (err, user) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
      } else {
        db.run(
          `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
          [user.id]
        );

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          }
        });
      }
    }
  );
});

// Token verification endpoint (simple implementation)
app.post('/api/auth/verify', (req, res) => {
  // For now, we'll just return success if the user is authenticated
  // In a production app, you'd verify a JWT token here
  res.json({
    valid: true,
    success: true,
    message: 'Token is valid'
  });
});

// Also support GET for testing
app.get('/api/auth/verify', (req, res) => {
  res.json({
    valid: true,
    success: true,
    message: 'Token is valid'
  });
});

app.get('/api/users', (req, res) => {
  db.all(
    `SELECT id, email, name, role, status, created_at, created_by, last_login FROM users ORDER BY created_at DESC`,
    [],
    (err, users) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(users);
      }
    }
  );
});

app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT id, email, name, role, status, created_at, created_by, last_login FROM users WHERE id = ?`,
    [id],
    (err, user) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!user) {
        res.status(404).json({ error: 'User not found' });
      } else {
        res.json(user);
      }
    }
  );
});

app.post('/api/users', (req, res) => {
  const { email, password, name, role, status, created_by } = req.body;
  const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  db.get(
    `SELECT id FROM users WHERE email = ?`,
    [email.toLowerCase()],
    (err, existing) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (existing) {
        res.status(400).json({ error: 'Email already exists' });
      } else {
        db.run(
          `INSERT INTO users (id, email, password, name, role, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, email.toLowerCase(), password, name, role || 'tester', status || 'active', created_by],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
            } else {
              res.json({
                success: true,
                id,
                message: 'User created successfully'
              });
            }
          }
        );
      }
    }
  );
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];

  Object.keys(updates).forEach(key => {
    if (key !== 'id' && key !== 'created_at') {
      if (key === 'email') {
        fields.push(`${key} = ?`);
        values.push(updates[key].toLowerCase());
      } else {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
  });

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

  db.run(query, values, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.json({
        success: true,
        message: 'User updated successfully'
      });
    }
  });
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT COUNT(*) as adminCount FROM users WHERE role = 'admin' AND id != ?`,
    [id],
    (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        db.get(
          `SELECT role FROM users WHERE id = ?`,
          [id],
          (err, user) => {
            if (err) {
              res.status(500).json({ error: err.message });
            } else if (!user) {
              res.status(404).json({ error: 'User not found' });
            } else if (user.role === 'admin' && result.adminCount === 0) {
              res.status(400).json({ error: 'Cannot delete the last admin user' });
            } else {
              db.run(
                `DELETE FROM users WHERE id = ?`,
                [id],
                function(err) {
                  if (err) {
                    res.status(500).json({ error: err.message });
                  } else {
                    res.json({
                      success: true,
                      message: 'User deleted successfully'
                    });
                  }
                }
              );
            }
          }
        );
      }
    }
  );
});

app.put('/api/users/:id/password', (req, res) => {
  const { id } = req.params;
  const { oldPassword, newPassword } = req.body;

  db.get(
    `SELECT password FROM users WHERE id = ?`,
    [id],
    (err, user) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!user) {
        res.status(404).json({ error: 'User not found' });
      } else if (user.password !== oldPassword) {
        res.status(401).json({ error: 'Current password is incorrect' });
      } else {
        db.run(
          `UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newPassword, id],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
            } else {
              res.json({
                success: true,
                message: 'Password changed successfully'
              });
            }
          }
        );
      }
    }
  );
});

app.get('/api/dashboard', (req, res) => {
  const dashboard = {};

  db.all(
    `SELECT
      tr.*,
      ts.tester_name
     FROM test_results tr
     JOIN test_sessions ts ON tr.session_id = ts.session_id
     ORDER BY tr.tested_at DESC
     LIMIT 10`,
    [],
    (err, recentTests) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        dashboard.recentTests = recentTests;

        db.all(
          `SELECT
            tf.*,
            ts.tester_name
           FROM test_feedback tf
           JOIN test_sessions ts ON tf.session_id = ts.session_id
           ORDER BY tf.created_at DESC
           LIMIT 10`,
          [],
          (err, recentFeedback) => {
            if (err) {
              res.status(500).json({ error: err.message });
            } else {
              dashboard.recentFeedback = recentFeedback;

              db.all(
                `SELECT
                  module_name,
                  COUNT(DISTINCT test_case_id) as tests_run,
                  SUM(CASE WHEN UPPER(status) = 'PASS' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as pass_rate
                 FROM test_results
                 GROUP BY module_name`,
                [],
                (err, moduleCoverage) => {
                  if (err) {
                    res.status(500).json({ error: err.message });
                  } else {
                    dashboard.moduleCoverage = moduleCoverage;
                    res.json(dashboard);
                  }
                }
              );
            }
          }
        );
      }
    }
  );
});

// =====================================================
// Admin Database Management
// =====================================================

app.post('/api/admin/reset-database', (req, res) => {
  // This endpoint should be protected in production
  // For now, it's open for testing purposes

  console.log('Database reset requested');

  // Close current database connection
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
      return res.status(500).json({ error: 'Failed to close database' });
    }

    // Delete the database file
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Database file deleted');
      }
    } catch (error) {
      console.error('Error deleting database:', error);
    }

    // Recreate database
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error recreating database:', err);
        return res.status(500).json({ error: 'Failed to recreate database' });
      }

      console.log('Database recreated');
      initializeDatabase();

      res.json({
        success: true,
        message: 'Database has been reset successfully'
      });
    });
  });
});

// Admin endpoint to reset only testing data (preserves users and modules)
app.post('/api/admin/reset-testing-data', (req, res) => {
  console.log('Testing data reset requested (preserving users and modules)');

  // Start a transaction to ensure consistency
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Error starting transaction:', err);
        return res.status(500).json({ error: 'Failed to start transaction' });
      }

      // Clear only testing-related tables
      const clearQueries = [
        'DELETE FROM test_sessions',
        'DELETE FROM test_results',
        'DELETE FROM test_feedback',
        'DELETE FROM custom_tests'
      ];

      let completed = 0;
      let hasError = false;

      clearQueries.forEach((query) => {
        db.run(query, (err) => {
          if (err) {
            console.error(`Error executing: ${query}`, err);
            hasError = true;
          }

          completed++;

          if (completed === clearQueries.length) {
            if (hasError) {
              db.run('ROLLBACK', () => {
                res.status(500).json({
                  error: 'Failed to clear testing data',
                  message: 'Some tables could not be cleared'
                });
              });
            } else {
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('Error committing transaction:', err);
                  res.status(500).json({ error: 'Failed to commit changes' });
                } else {
                  console.log('Testing data cleared successfully, users and modules preserved');
                  res.json({
                    success: true,
                    message: 'Testing data has been cleared. Users and modules preserved.',
                    clearedTables: [
                      'test_sessions',
                      'test_results',
                      'test_feedback',
                      'custom_tests'
                    ],
                    preservedTables: [
                      'users',
                      'modules'
                    ]
                  });
                }
              });
            }
          }
        });
      });
    });
  });
});

// =====================================================
// Module Management API Endpoints
// =====================================================

app.get('/api/modules', (req, res) => {
  const { is_active } = req.query;

  let query = `SELECT * FROM modules WHERE 1=1`;
  const params = [];

  if (is_active !== undefined) {
    query += ` AND is_active = ?`;
    params.push(is_active === 'true' ? 1 : 0);
  }

  query += ` ORDER BY display_order ASC, created_at ASC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/modules/:module_id', (req, res) => {
  const { module_id } = req.params;

  db.get(
    `SELECT * FROM modules WHERE module_id = ?`,
    [module_id],
    (err, module) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!module) {
        res.status(404).json({ error: 'Module not found' });
      } else {
        res.json(module);
      }
    }
  );
});

app.post('/api/modules', (req, res) => {
  const { name, description, icon, display_order, created_by } = req.body;
  const module_id = `MOD_${Date.now()}_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  db.run(
    `INSERT INTO modules (module_id, name, description, icon, display_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [module_id, name, description || '', icon || 'Folder', display_order || 999, created_by],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          module_id,
          id: this.lastID,
          message: 'Module created successfully'
        });
      }
    }
  );
});

app.put('/api/modules/:module_id', (req, res) => {
  const { module_id } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];

  Object.keys(updates).forEach(key => {
    if (key !== 'module_id' && key !== 'id' && key !== 'created_at') {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  });

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(module_id);

  const query = `UPDATE modules SET ${fields.join(', ')} WHERE module_id = ?`;

  db.run(query, values, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Module not found' });
    } else {
      res.json({
        success: true,
        message: 'Module updated successfully'
      });
    }
  });
});

app.delete('/api/modules/:module_id', (req, res) => {
  const { module_id } = req.params;

  db.get(
    `SELECT COUNT(*) as count FROM custom_tests WHERE module = (SELECT name FROM modules WHERE module_id = ?)`,
    [module_id],
    (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (result.count > 0) {
        res.status(400).json({ error: 'Cannot delete module with associated tests' });
      } else {
        db.run(
          `UPDATE modules SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE module_id = ?`,
          [module_id],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
              res.status(404).json({ error: 'Module not found' });
            } else {
              res.json({
                success: true,
                message: 'Module deleted successfully'
              });
            }
          }
        );
      }
    }
  );
});

app.put('/api/modules/reorder', (req, res) => {
  const { modules } = req.body;

  if (!Array.isArray(modules)) {
    res.status(400).json({ error: 'Modules must be an array' });
    return;
  }

  let completed = 0;
  let errors = [];

  modules.forEach(({ module_id, display_order }) => {
    db.run(
      `UPDATE modules SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE module_id = ?`,
      [display_order, module_id],
      (err) => {
        if (err) errors.push(err.message);
        completed++;

        if (completed === modules.length) {
          if (errors.length > 0) {
            res.status(500).json({ error: 'Some modules failed to update', errors });
          } else {
            res.json({ success: true, message: 'Modules reordered successfully' });
          }
        }
      }
    );
  });
});

// =====================================================
// Version Management API Endpoints
// =====================================================

app.get('/api/versions', (req, res) => {
  const { status, is_current } = req.query;

  let query = `SELECT * FROM versions WHERE 1=1`;
  const params = [];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  if (is_current !== undefined) {
    query += ` AND is_current = ?`;
    params.push(is_current === 'true' ? 1 : 0);
  }

  query += ` ORDER BY release_date DESC, version_number DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      // Parse JSON fields
      const versions = rows.map(row => ({
        ...row,
        features: safeJsonParse(row.features, []),
        bug_fixes: safeJsonParse(row.bug_fixes, []),
        known_issues: safeJsonParse(row.known_issues, [])
      }));
      res.json(versions);
    }
  });
});

app.get('/api/versions/current', (req, res) => {
  db.get(
    `SELECT * FROM versions WHERE is_current = 1 LIMIT 1`,
    [],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'No current version found' });
      } else {
        const version = {
          ...row,
          features: safeJsonParse(row.features, []),
          bug_fixes: safeJsonParse(row.bug_fixes, []),
          known_issues: safeJsonParse(row.known_issues, [])
        };
        res.json(version);
      }
    }
  );
});

app.get('/api/versions/:version_id', (req, res) => {
  const { version_id } = req.params;

  db.get(
    `SELECT * FROM versions WHERE version_id = ?`,
    [version_id],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Version not found' });
      } else {
        const version = {
          ...row,
          features: safeJsonParse(row.features, []),
          bug_fixes: safeJsonParse(row.bug_fixes, []),
          known_issues: safeJsonParse(row.known_issues, [])
        };
        res.json(version);
      }
    }
  );
});

app.post('/api/versions', (req, res) => {
  const {
    version_number,
    version_name,
    description,
    release_date,
    status,
    is_current,
    features,
    bug_fixes,
    known_issues,
    created_by
  } = req.body;

  const version_id = `VER_${version_number.replace(/\./g, '_')}`;

  // If setting as current, unset all other versions first
  const handleCurrentVersion = (callback) => {
    if (is_current) {
      db.run(
        `UPDATE versions SET is_current = 0, updated_at = CURRENT_TIMESTAMP`,
        [],
        (err) => {
          if (err) {
            res.status(500).json({ error: err.message });
          } else {
            callback();
          }
        }
      );
    } else {
      callback();
    }
  };

  handleCurrentVersion(() => {
    db.run(
      `INSERT INTO versions (version_id, version_number, version_name, description, release_date, status, is_current, features, bug_fixes, known_issues, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        version_id,
        version_number,
        version_name,
        description || '',
        release_date || new Date().toISOString().split('T')[0],
        status || 'active',
        is_current ? 1 : 0,
        JSON.stringify(features || []),
        JSON.stringify(bug_fixes || []),
        JSON.stringify(known_issues || []),
        created_by
      ],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({
            success: true,
            version_id,
            id: this.lastID,
            message: 'Version created successfully'
          });
        }
      }
    );
  });
});

app.put('/api/versions/:version_id', (req, res) => {
  const { version_id } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];

  // Handle is_current flag
  const handleCurrentVersion = (callback) => {
    if (updates.is_current) {
      db.run(
        `UPDATE versions SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE version_id != ?`,
        [version_id],
        (err) => {
          if (err) {
            res.status(500).json({ error: err.message });
          } else {
            callback();
          }
        }
      );
    } else {
      callback();
    }
  };

  handleCurrentVersion(() => {
    Object.keys(updates).forEach(key => {
      if (key !== 'version_id' && key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);

        if (['features', 'bug_fixes', 'known_issues'].includes(key)) {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(version_id);

    const query = `UPDATE versions SET ${fields.join(', ')} WHERE version_id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Version not found' });
      } else {
        res.json({
          success: true,
          message: 'Version updated successfully'
        });
      }
    });
  });
});

app.delete('/api/versions/:version_id', (req, res) => {
  const { version_id } = req.params;

  // Check if version is current
  db.get(
    `SELECT is_current FROM versions WHERE version_id = ?`,
    [version_id],
    (err, version) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!version) {
        res.status(404).json({ error: 'Version not found' });
      } else if (version.is_current) {
        res.status(400).json({ error: 'Cannot delete current version' });
      } else {
        // Check if version has associated test sessions
        db.get(
          `SELECT COUNT(*) as count FROM test_sessions WHERE version_id = ?`,
          [version_id],
          (err, result) => {
            if (err) {
              res.status(500).json({ error: err.message });
            } else if (result.count > 0) {
              // Soft delete - just change status
              db.run(
                `UPDATE versions SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE version_id = ?`,
                [version_id],
                function(err) {
                  if (err) {
                    res.status(500).json({ error: err.message });
                  } else {
                    res.json({
                      success: true,
                      message: 'Version archived successfully'
                    });
                  }
                }
              );
            } else {
              // Hard delete if no associated data
              db.run(
                `DELETE FROM versions WHERE version_id = ?`,
                [version_id],
                function(err) {
                  if (err) {
                    res.status(500).json({ error: err.message });
                  } else {
                    res.json({
                      success: true,
                      message: 'Version deleted successfully'
                    });
                  }
                }
              );
            }
          }
        );
      }
    }
  );
});

app.put('/api/versions/:version_id/set-current', (req, res) => {
  const { version_id } = req.params;

  // First unset all versions
  db.run(
    `UPDATE versions SET is_current = 0, updated_at = CURRENT_TIMESTAMP`,
    [],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Then set the specified version as current
        db.run(
          `UPDATE versions SET is_current = 1, updated_at = CURRENT_TIMESTAMP WHERE version_id = ?`,
          [version_id],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
              res.status(404).json({ error: 'Version not found' });
            } else {
              res.json({
                success: true,
                message: 'Current version updated successfully'
              });
            }
          }
        );
      }
    }
  );
});

// Get test statistics for a specific version
app.get('/api/versions/:version_id/statistics', (req, res) => {
  const { version_id } = req.params;

  // Debug: Log what test results exist for this version
  db.all(`
    SELECT tr.status, COUNT(*) as count
    FROM test_results tr
    JOIN test_sessions ts ON tr.session_id = ts.session_id
    WHERE ts.version_id = ?
    GROUP BY tr.status
  `, [version_id], (err, statusRows) => {
    console.log('Debug - Raw status values for version', version_id, ':', statusRows);
  });

  const queries = {
    totalSessions: `SELECT COUNT(*) as count FROM test_sessions WHERE version_id = ?`,
    totalTests: `
      SELECT COUNT(*) as count
      FROM test_results tr
      JOIN test_sessions ts ON tr.session_id = ts.session_id
      WHERE ts.version_id = ?
    `,
    testsByStatus: `
      SELECT
        CASE
          WHEN UPPER(TRIM(tr.status)) IN ('PASS', 'PASSED') THEN 'Pass'
          WHEN UPPER(TRIM(tr.status)) IN ('FAIL', 'FAILED') THEN 'Fail'
          WHEN UPPER(TRIM(tr.status)) = 'BLOCKED' THEN 'Blocked'
          WHEN UPPER(TRIM(tr.status)) IN ('NOT STARTED', 'NOTSTARTED') THEN 'Not Started'
          ELSE TRIM(tr.status)
        END as status,
        COUNT(*) as count
      FROM test_results tr
      JOIN test_sessions ts ON tr.session_id = ts.session_id
      WHERE ts.version_id = ?
      GROUP BY CASE
        WHEN UPPER(TRIM(tr.status)) IN ('PASS', 'PASSED') THEN 'Pass'
        WHEN UPPER(TRIM(tr.status)) IN ('FAIL', 'FAILED') THEN 'Fail'
        WHEN UPPER(TRIM(tr.status)) = 'BLOCKED' THEN 'Blocked'
        WHEN UPPER(TRIM(tr.status)) IN ('NOT STARTED', 'NOTSTARTED') THEN 'Not Started'
        ELSE TRIM(tr.status)
      END
    `,
    moduleStats: `
      SELECT
        tr.module_name,
        COUNT(*) as total_tests,
        SUM(CASE WHEN UPPER(tr.status) = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN UPPER(tr.status) = 'FAIL' THEN 1 ELSE 0 END) as failed
      FROM test_results tr
      JOIN test_sessions ts ON tr.session_id = ts.session_id
      WHERE ts.version_id = ?
      GROUP BY tr.module_name
    `,
    // Bug fixes: Tests that failed in previous version but pass in current version
    bugFixes: `
      SELECT DISTINCT
        curr.test_case_id,
        curr.test_case_title,
        curr.module_name,
        prev.status as prev_status,
        curr.status as curr_status
      FROM test_results curr
      JOIN test_sessions curr_ts ON curr.session_id = curr_ts.session_id
      LEFT JOIN (
        SELECT tr.*, ts.version_id
        FROM test_results tr
        JOIN test_sessions ts ON tr.session_id = ts.session_id
      ) prev ON
        prev.test_case_id = curr.test_case_id
        AND prev.version_id != curr_ts.version_id
      WHERE
        curr_ts.version_id = ?
        AND UPPER(curr.status) = 'PASS'
        AND UPPER(prev.status) = 'FAIL'
    `,
    // Known issues: Tests currently failing in this version
    knownIssues: `
      SELECT DISTINCT
        tr.test_case_id,
        tr.test_case_title,
        tr.module_name,
        tr.notes,
        tr.error_message
      FROM test_results tr
      JOIN test_sessions ts ON tr.session_id = ts.session_id
      WHERE
        ts.version_id = ?
        AND UPPER(tr.status) = 'FAIL'
      ORDER BY tr.tested_at DESC
    `,
    // New features: New tests added in this version
    newFeatures: `
      SELECT DISTINCT
        curr.test_case_id,
        curr.test_case_title,
        curr.module_name,
        curr.category
      FROM test_results curr
      JOIN test_sessions curr_ts ON curr.session_id = curr_ts.session_id
      WHERE
        curr_ts.version_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM test_results prev
          JOIN test_sessions prev_ts ON prev.session_id = prev_ts.session_id
          WHERE prev.test_case_id = curr.test_case_id
          AND prev_ts.version_id != curr_ts.version_id
          AND prev.tested_at < curr.tested_at
        )
    `
  };

  const stats = {};
  let completed = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    const params = key === 'bugFixes' ? [version_id] :
                  key === 'knownIssues' ? [version_id] :
                  key === 'newFeatures' ? [version_id] : [version_id];

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error(`Error in ${key}:`, err);
        // Return empty array for array fields, 0 for counts
        if (key === 'bugFixes' || key === 'knownIssues' || key === 'newFeatures' || key === 'testsByStatus' || key === 'moduleStats') {
          stats[key] = [];
        } else {
          stats[key] = 0;
        }
      } else {
        // For count queries, return the count value, for array queries return the rows
        if (rows.length === 1 && rows[0].count !== undefined) {
          stats[key] = rows[0].count;
        } else {
          stats[key] = rows || [];
        }
      }

      completed++;
      if (completed === totalQueries) {
        res.json(stats);
      }
    });
  });
});

// ============ BUG TRACKING API ENDPOINTS ============

// Generate unique bug ID
function generateBugId() {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `BUG-${year}-${timestamp}`;
}

// Create a new bug
app.post('/api/bugs', (req, res) => {
  const {
    title,
    description,
    steps_to_reproduce,
    expected_result,
    actual_result,
    priority = 'P3',
    severity = 'Minor',
    category,
    type = 'Functional',
    module_id,
    session_id,
    linked_tests,
    reporter_id,
    reporter_name,
    reporter_email,
    assignee_id,
    assignee_name,
    assignee_email,
    environment,
    found_in_version,
    target_release,
    tags,
    attachments
  } = req.body;

  const bug_id = generateBugId();

  db.run(
    `INSERT INTO bugs (
      bug_id, title, description, steps_to_reproduce, expected_result, actual_result,
      priority, severity, category, type, module_id, session_id, linked_tests,
      reporter_id, reporter_name, reporter_email, assignee_id, assignee_name, assignee_email,
      environment, found_in_version, target_release, tags, attachments
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bug_id, title, description,
      JSON.stringify(steps_to_reproduce || []),
      expected_result, actual_result,
      priority, severity, category, type,
      module_id, session_id,
      JSON.stringify(linked_tests || []),
      reporter_id, reporter_name, reporter_email,
      assignee_id, assignee_name, assignee_email,
      JSON.stringify(environment || {}),
      found_in_version, target_release,
      JSON.stringify(tags || []),
      JSON.stringify(attachments || [])
    ],
    function(err) {
      if (err) {
        console.error('Error creating bug:', err);
        res.status(500).json({ error: err.message });
      } else {
        // Log the creation in history
        db.run(
          `INSERT INTO bug_history (bug_id, action, changed_by_id, changed_by_name)
           VALUES (?, ?, ?, ?)`,
          [bug_id, 'Created', reporter_id, reporter_name],
          (histErr) => {
            if (histErr) console.error('Error logging bug creation:', histErr);
          }
        );

        res.json({
          success: true,
          id: this.lastID,
          bug_id: bug_id,
          message: 'Bug created successfully'
        });
      }
    }
  );
});

// Get all bugs with filtering
app.get('/api/bugs', (req, res) => {
  const {
    status,
    priority,
    severity,
    assignee_id,
    module_id,
    search,
    show_deleted,
    show_rejected,
    limit = 100,
    offset = 0
  } = req.query;

  let query = `SELECT * FROM bugs WHERE 1=1`;
  const params = [];

  // Handle deleted and rejected filters
  // show_deleted: 'true' = show only deleted, 'false' = hide deleted, 'all' = show all
  // show_rejected: 'true' = show rejected (not deleted), 'false' = hide rejected
  if (show_deleted === 'false') {
    query += ` AND (is_deleted = 0 OR is_deleted IS NULL)`;
  } else if (show_deleted === 'true') {
    query += ` AND is_deleted = 1`;
  }
  // If show_deleted is 'all' or undefined, don't filter by is_deleted

  if (show_rejected === 'false') {
    query += ` AND (status != 'Rejected' OR is_deleted = 1)`;
  } else if (show_rejected === 'true') {
    query += ` AND status = 'Rejected' AND (is_deleted = 0 OR is_deleted IS NULL)`;
  }

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  if (priority) {
    query += ` AND priority = ?`;
    params.push(priority);
  }

  if (severity) {
    query += ` AND severity = ?`;
    params.push(severity);
  }

  if (assignee_id) {
    query += ` AND assignee_id = ?`;
    params.push(assignee_id);
  }

  if (module_id) {
    query += ` AND module_id = ?`;
    params.push(module_id);
  }

  if (search) {
    query += ` AND (title LIKE ? OR description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY created_at DESC
    LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      // Parse JSON fields
      rows.forEach(row => {
        if (row.steps_to_reproduce) row.steps_to_reproduce = safeJsonParse(row.steps_to_reproduce, []);
        if (row.linked_tests) row.linked_tests = safeJsonParse(row.linked_tests, []);
        if (row.related_bugs) row.related_bugs = safeJsonParse(row.related_bugs, []);
        if (row.environment) row.environment = safeJsonParse(row.environment, {});
        if (row.tags) row.tags = safeJsonParse(row.tags, []);
        if (row.attachments) row.attachments = safeJsonParse(row.attachments, []);
      });
      res.json(rows);
    }
  });
});

// Get bug statistics (must be before :bug_id route to avoid route conflict)
app.get('/api/bugs/stats', (req, res) => {
  const { module_id, assignee_id } = req.query;

  let query = `
    SELECT
      COUNT(*) as total_bugs,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_bugs,
      SUM(CASE WHEN status IN ('Assigned', 'In Progress') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'Fixed' THEN 1 ELSE 0 END) as fixed,
      SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) as p1_bugs,
      SUM(CASE WHEN priority = 'P2' THEN 1 ELSE 0 END) as p2_bugs,
      SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) as critical_bugs,
      SUM(CASE WHEN severity = 'Major' THEN 1 ELSE 0 END) as major_bugs
    FROM bugs WHERE 1=1`;

  const params = [];

  if (module_id) {
    query += ` AND module_id = ?`;
    params.push(module_id);
  }

  if (assignee_id) {
    query += ` AND assignee_id = ?`;
    params.push(assignee_id);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(row || {});
    }
  });
});

// Get single bug by ID
app.get('/api/bugs/:bug_id', (req, res) => {
  const { bug_id } = req.params;

  db.get(
    `SELECT * FROM bugs WHERE bug_id = ?`,
    [bug_id],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Bug not found' });
      } else {
        // Parse JSON fields
        if (row.steps_to_reproduce) row.steps_to_reproduce = safeJsonParse(row.steps_to_reproduce, []);
        if (row.linked_tests) row.linked_tests = safeJsonParse(row.linked_tests, []);
        if (row.related_bugs) row.related_bugs = safeJsonParse(row.related_bugs, []);
        if (row.environment) row.environment = safeJsonParse(row.environment, {});
        if (row.tags) row.tags = safeJsonParse(row.tags, []);
        if (row.attachments) row.attachments = safeJsonParse(row.attachments, []);

        res.json(row);
      }
    }
  );
});

// Update bug
app.put('/api/bugs/:bug_id', (req, res) => {
  const { bug_id } = req.params;
  const updates = req.body;
  const { changed_by_id, changed_by_name } = updates;

  // Remove meta fields from updates
  delete updates.changed_by_id;
  delete updates.changed_by_name;

  // Get current bug state for history
  db.get(`SELECT * FROM bugs WHERE bug_id = ?`, [bug_id], (err, currentBug) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!currentBug) {
      res.status(404).json({ error: 'Bug not found' });
    } else {
      // Build update query dynamically
      const updateFields = [];
      const params = [];

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && key !== 'id' && key !== 'bug_id' && key !== 'created_at') {
          let value = updates[key];

          // Stringify JSON fields
          if (['steps_to_reproduce', 'linked_tests', 'related_bugs', 'environment', 'tags', 'attachments'].includes(key)) {
            value = JSON.stringify(value);
          }

          updateFields.push(`${key} = ?`);
          params.push(value);

          // Log changes to history
          if (currentBug[key] !== value) {
            db.run(
              `INSERT INTO bug_history (bug_id, action, field_name, old_value, new_value, changed_by_id, changed_by_name)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [bug_id, 'Updated', key, currentBug[key], value, changed_by_id, changed_by_name],
              (histErr) => {
                if (histErr) console.error('Error logging bug update:', histErr);
              }
            );
          }
        }
      });

      if (updateFields.length === 0) {
        res.json({ success: true, message: 'No changes to update' });
        return;
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(bug_id);

      const query = `UPDATE bugs SET ${updateFields.join(', ')} WHERE bug_id = ?`;

      db.run(query, params, function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({
            success: true,
            message: 'Bug updated successfully',
            changes: this.changes
          });
        }
      });
    }
  });
});

// Update bug status
app.post('/api/bugs/:bug_id/status', (req, res) => {
  const { bug_id } = req.params;
  const { status, resolution, changed_by_id, changed_by_name } = req.body;

  // Get current status
  db.get(`SELECT status, resolution FROM bugs WHERE bug_id = ?`, [bug_id], (err, currentBug) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!currentBug) {
      res.status(404).json({ error: 'Bug not found' });
    } else {
      let updateQuery = `UPDATE bugs SET status = ?, updated_at = CURRENT_TIMESTAMP`;
      const params = [status];

      // Handle resolution and timestamps based on status
      if (status === 'Fixed' || status === 'Rejected') {
        updateQuery += `, resolution = ?, resolved_at = CURRENT_TIMESTAMP`;
        params.push(resolution || (status === 'Fixed' ? 'Fixed' : 'Won\'t Fix'));
      } else if (status === 'Verified') {
        updateQuery += `, verified_at = CURRENT_TIMESTAMP`;
      }

      updateQuery += ` WHERE bug_id = ?`;
      params.push(bug_id);

      db.run(updateQuery, params, function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          // Log status change to history
          db.run(
            `INSERT INTO bug_history (bug_id, action, field_name, old_value, new_value, changed_by_id, changed_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [bug_id, 'Status Changed', 'status', currentBug.status, status, changed_by_id, changed_by_name],
            (histErr) => {
              if (histErr) console.error('Error logging status change:', histErr);
            }
          );

          res.json({
            success: true,
            message: `Bug status updated to ${status}`
          });
        }
      });
    }
  });
});

// Delete bug (soft delete)
app.delete('/api/bugs/:bug_id', (req, res) => {
  const { bug_id } = req.params;
  const { deleted_by_id, deleted_by_name } = req.body;

  // Mark bug as deleted instead of actually removing it
  db.run(
    `UPDATE bugs SET
      is_deleted = 1,
      status = 'Rejected',
      resolution = 'Won''t Fix',
      updated_at = CURRENT_TIMESTAMP
    WHERE bug_id = ?`,
    [bug_id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Bug not found' });
      } else {
        // Log the deletion in history
        db.run(
          `INSERT INTO bug_history (bug_id, action, field_name, new_value, changed_by_id, changed_by_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [bug_id, 'Deleted', 'is_deleted', 'true', deleted_by_id || 'System', deleted_by_name || 'System'],
          (histErr) => {
            if (histErr) console.error('Error logging bug deletion:', histErr);
          }
        );

        res.json({
          success: true,
          message: 'Bug deleted successfully'
        });
      }
    }
  );
});

// Add comment to bug
app.post('/api/bugs/:bug_id/comments', (req, res) => {
  const { bug_id } = req.params;
  const { comment_text, author_id, author_name, author_email, is_internal } = req.body;

  db.run(
    `INSERT INTO bug_comments (bug_id, comment_text, author_id, author_name, author_email, is_internal)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [bug_id, comment_text, author_id, author_name, author_email, is_internal || 0],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          success: true,
          id: this.lastID,
          message: 'Comment added successfully'
        });
      }
    }
  );
});

// Get comments for a bug
app.get('/api/bugs/:bug_id/comments', (req, res) => {
  const { bug_id } = req.params;

  db.all(
    `SELECT * FROM bug_comments WHERE bug_id = ? ORDER BY created_at DESC`,
    [bug_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

// Get bug history
app.get('/api/bugs/:bug_id/history', (req, res) => {
  const { bug_id } = req.params;

  db.all(
    `SELECT * FROM bug_history WHERE bug_id = ? ORDER BY changed_at DESC`,
    [bug_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

// Link bug to test
app.post('/api/bugs/:bug_id/link-test', (req, res) => {
  const { bug_id } = req.params;
  const { test_id, changed_by_id, changed_by_name } = req.body;

  db.get(`SELECT linked_tests FROM bugs WHERE bug_id = ?`, [bug_id], (err, bug) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!bug) {
      res.status(404).json({ error: 'Bug not found' });
    } else {
      const linkedTests = safeJsonParse(bug.linked_tests, []);

      if (!linkedTests.includes(test_id)) {
        linkedTests.push(test_id);

        db.run(
          `UPDATE bugs SET linked_tests = ?, updated_at = CURRENT_TIMESTAMP WHERE bug_id = ?`,
          [JSON.stringify(linkedTests), bug_id],
          function(err) {
            if (err) {
              res.status(500).json({ error: err.message });
            } else {
              // Log the linking
              db.run(
                `INSERT INTO bug_history (bug_id, action, field_name, new_value, changed_by_id, changed_by_name)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [bug_id, 'Test Linked', 'linked_tests', test_id, changed_by_id, changed_by_name],
                (histErr) => {
                  if (histErr) console.error('Error logging test link:', histErr);
                }
              );

              res.json({
                success: true,
                message: 'Test linked to bug successfully'
              });
            }
          }
        );
      } else {
        res.json({
          success: true,
          message: 'Test already linked to this bug'
        });
      }
    }
  });
});

// Get bugs by test ID
app.get('/api/bugs/by-test/:test_id', (req, res) => {
  const { test_id } = req.params;

  db.all(
    `SELECT * FROM bugs WHERE linked_tests LIKE ? ORDER BY created_at DESC`,
    [`%"${test_id}"%`],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Parse JSON fields
        rows.forEach(row => {
          if (row.linked_tests) row.linked_tests = safeJsonParse(row.linked_tests, []);
          if (row.steps_to_reproduce) row.steps_to_reproduce = safeJsonParse(row.steps_to_reproduce, []);
          if (row.environment) row.environment = safeJsonParse(row.environment, {});
          if (row.tags) row.tags = safeJsonParse(row.tags, []);
          if (row.attachments) row.attachments = safeJsonParse(row.attachments, []);
        });
        res.json(rows);
      }
    }
  );
});

// Get bug statistics
app.get('/api/bugs/stats', (req, res) => {
  const { module_id, assignee_id } = req.query;

  let query = `
    SELECT
      COUNT(*) as total_bugs,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_bugs,
      SUM(CASE WHEN status IN ('Assigned', 'In Progress') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'Fixed' THEN 1 ELSE 0 END) as fixed,
      SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) as p1_bugs,
      SUM(CASE WHEN priority = 'P2' THEN 1 ELSE 0 END) as p2_bugs,
      SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) as critical_bugs,
      SUM(CASE WHEN severity = 'Major' THEN 1 ELSE 0 END) as major_bugs
    FROM bugs WHERE 1=1`;

  const params = [];

  if (module_id) {
    query += ` AND module_id = ?`;
    params.push(module_id);
  }

  if (assignee_id) {
    query += ` AND assignee_id = ?`;
    params.push(assignee_id);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(row || {});
    }
  });
});

// Upload attachment for a bug
app.post('/api/bugs/:bug_id/attachments', upload.array('files', 5), (req, res) => {
  const { bug_id } = req.params;
  const { uploaded_by_id, uploaded_by_name } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  // Check if bug exists
  db.get(`SELECT * FROM bugs WHERE bug_id = ?`, [bug_id], (err, bug) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!bug) {
      // Delete uploaded files if bug doesn't exist
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
      return res.status(404).json({ error: 'Bug not found' });
    }

    const attachments = [];
    const promises = [];

    req.files.forEach(file => {
      const attachment_id = `ATT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const relativePath = path.relative(__dirname, file.path);

      attachments.push({
        attachment_id,
        filename: file.filename,
        original_name: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: `/uploads/bugs/${file.filename}`
      });

      promises.push(new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO bug_attachments (attachment_id, bug_id, filename, original_name, mimetype, size, path, uploaded_by_id, uploaded_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [attachment_id, bug_id, file.filename, file.originalname, file.mimetype, file.size, `/uploads/bugs/${file.filename}`, uploaded_by_id, uploaded_by_name],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      }));
    });

    Promise.all(promises)
      .then(() => {
        // Update bug attachments field
        const currentAttachments = safeJsonParse(bug.attachments, []);
        const newAttachments = [...currentAttachments, ...attachments.map(a => a.attachment_id)];

        db.run(
          `UPDATE bugs SET attachments = ?, updated_at = CURRENT_TIMESTAMP WHERE bug_id = ?`,
          [JSON.stringify(newAttachments), bug_id],
          (err) => {
            if (err) {
              console.error('Error updating bug attachments:', err);
            }

            // Log the attachment upload
            db.run(
              `INSERT INTO bug_history (bug_id, action, field_name, new_value, changed_by_id, changed_by_name)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [bug_id, 'Attachment Added', 'attachments', `${req.files.length} file(s) uploaded`, uploaded_by_id, uploaded_by_name],
              (histErr) => {
                if (histErr) console.error('Error logging attachment upload:', histErr);
              }
            );
          }
        );

        res.json({
          success: true,
          message: `${attachments.length} file(s) uploaded successfully`,
          attachments
        });
      })
      .catch(err => {
        // Delete uploaded files on error
        req.files.forEach(file => {
          fs.unlinkSync(file.path);
        });
        res.status(500).json({ error: 'Failed to save attachment records: ' + err.message });
      });
  });
});

// Get attachments for a bug
app.get('/api/bugs/:bug_id/attachments', (req, res) => {
  const { bug_id } = req.params;

  db.all(
    `SELECT * FROM bug_attachments WHERE bug_id = ? ORDER BY uploaded_at DESC`,
    [bug_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    }
  );
});

// Delete an attachment
app.delete('/api/bugs/:bug_id/attachments/:attachment_id', (req, res) => {
  const { bug_id, attachment_id } = req.params;
  const { deleted_by_id, deleted_by_name } = req.body;

  // Get attachment details
  db.get(
    `SELECT * FROM bug_attachments WHERE attachment_id = ? AND bug_id = ?`,
    [attachment_id, bug_id],
    (err, attachment) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Delete file from filesystem
      const filePath = path.join(__dirname, 'uploads', 'bugs', attachment.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from database
      db.run(
        `DELETE FROM bug_attachments WHERE attachment_id = ?`,
        [attachment_id],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          // Update bug attachments field
          db.get(`SELECT attachments FROM bugs WHERE bug_id = ?`, [bug_id], (err, bug) => {
            if (!err && bug) {
              const attachments = safeJsonParse(bug.attachments, []);
              const updatedAttachments = attachments.filter(id => id !== attachment_id);

              db.run(
                `UPDATE bugs SET attachments = ?, updated_at = CURRENT_TIMESTAMP WHERE bug_id = ?`,
                [JSON.stringify(updatedAttachments), bug_id],
                (err) => {
                  if (err) console.error('Error updating bug attachments:', err);
                }
              );
            }
          });

          // Log the deletion
          db.run(
            `INSERT INTO bug_history (bug_id, action, field_name, old_value, changed_by_id, changed_by_name)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [bug_id, 'Attachment Deleted', 'attachments', attachment.original_name, deleted_by_id, deleted_by_name],
            (histErr) => {
              if (histErr) console.error('Error logging attachment deletion:', histErr);
            }
          );

          res.json({
            success: true,
            message: 'Attachment deleted successfully'
          });
        }
      );
    }
  );
});

// Create test from bug
app.post('/api/bugs/:bug_id/create-test', (req, res) => {
  const { bug_id } = req.params;
  const { created_by } = req.body;

  // Get bug details
  db.get(`SELECT * FROM bugs WHERE bug_id = ?`, [bug_id], (err, bug) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    // Generate test from bug data
    const testId = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const steps = safeJsonParse(bug.steps_to_reproduce, []);

    // Create test case from bug
    const testData = {
      test_id: testId,
      title: `Verify fix for: ${bug.title}`,
      description: `Regression test to verify that bug ${bug.bug_id} has been fixed.\n\nOriginal issue: ${bug.description}`,
      module: bug.category || 'General',
      category: 'Regression',
      priority: bug.priority === 'P1' ? 'High' : bug.priority === 'P2' ? 'High' : bug.priority === 'P3' ? 'Medium' : 'Low',
      steps: JSON.stringify([
        'Prerequisites: Ensure the bug fix has been deployed',
        ...steps,
        'Verify the issue no longer occurs'
      ]),
      expected_result: bug.expected_result || 'System should work as expected without the reported issue',
      prerequisites: JSON.stringify([`Bug ${bug.bug_id} should be in Fixed or Verified status`]),
      test_data: JSON.stringify({
        bug_id: bug.bug_id,
        environment: safeJsonParse(bug.environment, {}),
        found_in_version: bug.found_in_version
      }),
      created_by: created_by || bug.reporter_name || 'System',
      tags: JSON.stringify(['regression', `bug-${bug.bug_id}`, bug.type?.toLowerCase()].filter(Boolean))
    };

    // Insert the test
    db.run(
      `INSERT INTO custom_tests (test_id, title, description, module, category, priority, steps, expected_result, prerequisites, test_data, created_by, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [testData.test_id, testData.title, testData.description, testData.module, testData.category, testData.priority,
       testData.steps, testData.expected_result, testData.prerequisites, testData.test_data, testData.created_by, testData.tags],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create test: ' + err.message });
        }

        // Update bug with linked test
        const linkedTests = safeJsonParse(bug.linked_tests, []);
        linkedTests.push(testData.test_id);

        db.run(
          `UPDATE bugs SET linked_tests = ?, updated_at = CURRENT_TIMESTAMP WHERE bug_id = ?`,
          [JSON.stringify(linkedTests), bug_id],
          (updateErr) => {
            if (updateErr) {
              console.error('Error linking test to bug:', updateErr);
            }

            // Log the test creation
            db.run(
              `INSERT INTO bug_history (bug_id, action, field_name, new_value, changed_by_id, changed_by_name)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [bug_id, 'Test Created', 'linked_tests', testData.test_id, created_by, created_by],
              (histErr) => {
                if (histErr) console.error('Error logging test creation:', histErr);
              }
            );
          }
        );

        res.json({
          success: true,
          message: 'Test case created successfully',
          test_id: testData.test_id,
          test: testData
        });
      }
    );
  });
});

// Get test cases linked to a bug
app.get('/api/bugs/:bug_id/tests', (req, res) => {
  const { bug_id } = req.params;

  // First get bug to find linked tests
  db.get(`SELECT linked_tests FROM bugs WHERE bug_id = ?`, [bug_id], (err, bug) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    const linkedTestIds = safeJsonParse(bug.linked_tests, []);
    if (linkedTestIds.length === 0) {
      return res.json([]);
    }

    // Get test details - only get active tests (not deleted)
    const placeholders = linkedTestIds.map(() => '?').join(',');
    db.all(
      `SELECT * FROM custom_tests WHERE test_id IN (${placeholders}) AND is_active = 1 ORDER BY created_at DESC`,
      linkedTestIds,
      (err, tests) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          // Parse JSON fields for each test
          const parsedTests = (tests || []).map(test => ({
            ...test,
            steps: safeJsonParse(test.steps, []),
            prerequisites: safeJsonParse(test.prerequisites, []),
            test_data: safeJsonParse(test.test_data, {}),
            tags: safeJsonParse(test.tags, [])
          }));
          res.json(parsedTests);
        }
      }
    );
  });
});

// ============ UPCOMING FEATURES API ROUTES ============

// Create a new feature
app.post('/api/features', (req, res) => {
  const {
    title,
    description,
    business_value,
    user_story,
    acceptance_criteria,
    priority = 'P3',
    feature_type = 'Enhancement',
    category,
    complexity = 'Medium',
    module_id,
    target_version,
    owner_id,
    owner_name,
    owner_email,
    developer_id,
    developer_name,
    developer_email,
    tester_id,
    tester_name,
    tester_email,
    creator_name,
    creator_email,
    estimated_hours,
    start_date,
    end_date,
    technical_notes,
    api_endpoints,
    database_changes,
    dependencies_external,
    tags
  } = req.body;

  // Validate required fields
  if (!title || !module_id || !target_version || !creator_name) {
    return res.status(400).json({
      error: 'Missing required fields: title, module_id, target_version, creator_name'
    });
  }

  // Generate unique feature ID
  const feature_id = `FEAT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const sql = `
    INSERT INTO upcoming_features (
      feature_id, title, description, business_value, user_story, acceptance_criteria,
      priority, feature_type, category, complexity,
      module_id, target_version,
      creator_name, creator_email,
      owner_id, owner_name, owner_email,
      developer_id, developer_name, developer_email,
      tester_id, tester_name, tester_email,
      estimated_hours, start_date, end_date, technical_notes, api_endpoints, database_changes,
      dependencies_external, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      feature_id, title, description, business_value, user_story,
      JSON.stringify(acceptance_criteria || []),
      priority, feature_type, category, complexity,
      module_id, target_version,
      creator_name, creator_email,
      owner_id, owner_name, owner_email,
      developer_id, developer_name, developer_email,
      tester_id, tester_name, tester_email,
      estimated_hours, start_date, end_date, technical_notes,
      JSON.stringify(api_endpoints || []),
      database_changes,
      dependencies_external,
      JSON.stringify(tags || [])
    ],
    function(err) {
      if (err) {
        console.error('Error creating feature:', err);
        res.status(500).json({ error: err.message });
      } else {
        // Log to history
        db.run(
          `INSERT INTO feature_history (feature_id, action, changed_by_name, changed_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [feature_id, 'Feature Created', creator_name]
        );

        res.json({
          success: true,
          feature_id,
          message: 'Feature created successfully'
        });
      }
    }
  );
});

// Get all features with filters
app.get('/api/features', (req, res) => {
  const {
    status,
    priority,
    module_id,
    target_version,
    owner_id,
    search,
    show_deleted = 'false',
    limit = 100,
    offset = 0
  } = req.query;

  let sql = 'SELECT * FROM upcoming_features WHERE 1=1';
  const params = [];

  // Apply filters
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (priority) {
    sql += ' AND priority = ?';
    params.push(priority);
  }

  if (module_id) {
    sql += ' AND module_id = ?';
    params.push(module_id);
  }

  if (target_version) {
    sql += ' AND target_version = ?';
    params.push(target_version);
  }

  if (owner_id) {
    sql += ' AND owner_id = ?';
    params.push(owner_id);
  }

  if (search) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Handle deleted features
  if (show_deleted === 'false') {
    sql += ' AND is_deleted = 0';
  } else if (show_deleted === 'only') {
    sql += ' AND is_deleted = 1';
  }

  // Order by created_at DESC (most recent first)
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching features:', err);
      res.status(500).json({ error: err.message });
    } else {
      // Parse JSON fields
      const features = rows.map(f => ({
        ...f,
        acceptance_criteria: safeJsonParse(f.acceptance_criteria, []),
        linked_tests: safeJsonParse(f.linked_tests, []),
        related_features: safeJsonParse(f.related_features, []),
        dependencies: safeJsonParse(f.dependencies, []),
        blocks: safeJsonParse(f.blocks, []),
        api_endpoints: safeJsonParse(f.api_endpoints, []),
        attachments: safeJsonParse(f.attachments, []),
        tags: safeJsonParse(f.tags, []),
        is_deleted: Boolean(f.is_deleted)
      }));
      res.json(features);
    }
  });
});

// Get single feature
app.get('/api/features/:feature_id', (req, res) => {
  const { feature_id } = req.params;

  db.get(
    'SELECT * FROM upcoming_features WHERE feature_id = ?',
    [feature_id],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Feature not found' });
      } else {
        // Parse JSON fields
        const feature = {
          ...row,
          acceptance_criteria: safeJsonParse(row.acceptance_criteria, []),
          linked_tests: safeJsonParse(row.linked_tests, []),
          related_features: safeJsonParse(row.related_features, []),
          dependencies: safeJsonParse(row.dependencies, []),
          blocks: safeJsonParse(row.blocks, []),
          api_endpoints: safeJsonParse(row.api_endpoints, []),
          attachments: safeJsonParse(row.attachments, []),
          tags: safeJsonParse(row.tags, []),
          is_deleted: Boolean(row.is_deleted)
        };
        res.json(feature);
      }
    }
  );
});

// Update feature
app.put('/api/features/:feature_id', (req, res) => {
  const { feature_id } = req.params;
  const updates = req.body;
  const changed_by_name = updates.changed_by_name || 'Unknown';

  // Remove changed_by_name from updates
  delete updates.changed_by_name;

  // Build dynamic UPDATE query
  const allowedFields = [
    'title', 'description', 'business_value', 'user_story', 'acceptance_criteria',
    'priority', 'feature_type', 'category', 'complexity', 'status',
    'module_id', 'target_version',
    'owner_id', 'owner_name', 'owner_email',
    'developer_id', 'developer_name', 'developer_email',
    'tester_id', 'tester_name', 'tester_email',
    'estimated_hours', 'actual_hours', 'progress_percentage',
    'start_date', 'end_date',
    'technical_notes', 'api_endpoints', 'database_changes', 'dependencies_external',
    'started_at', 'completed_at', 'released_at',
    'tags', 'is_deleted'
  ];

  const setClauses = [];
  const params = [];

  // First get current values for history
  db.get('SELECT * FROM upcoming_features WHERE feature_id = ?', [feature_id], (err, oldFeature) => {
    if (err || !oldFeature) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        // Stringify arrays/objects
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }

        // Log change to history
        const oldValue = oldFeature[key];
        const newValue = value;
        if (oldValue !== newValue) {
          db.run(
            `INSERT INTO feature_history (feature_id, action, field_name, old_value, new_value, changed_by_name, changed_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [feature_id, 'Field Updated', key, String(oldValue || ''), String(newValue || ''), changed_by_name]
          );
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(feature_id);

    const sql = `UPDATE upcoming_features SET ${setClauses.join(', ')} WHERE feature_id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        console.error('Error updating feature:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, message: 'Feature updated successfully' });
      }
    });
  });
});

// Update feature status
app.put('/api/features/:feature_id/status', (req, res) => {
  const { feature_id } = req.params;
  const { status, changed_by_name } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  // Get current status for history
  db.get('SELECT status FROM upcoming_features WHERE feature_id = ?', [feature_id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    const oldStatus = row.status;

    // Update status
    db.run(
      'UPDATE upcoming_features SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE feature_id = ?',
      [status, feature_id],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          // Log to history
          db.run(
            `INSERT INTO feature_history (feature_id, action, field_name, old_value, new_value, changed_by_name, changed_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [feature_id, 'Status Changed', 'status', oldStatus, status, changed_by_name || 'Unknown']
          );

          res.json({ success: true, message: 'Feature status updated' });
        }
      }
    );
  });
});

// Delete feature (soft delete)
app.delete('/api/features/:feature_id', (req, res) => {
  const { feature_id } = req.params;
  const { changed_by_name } = req.body;

  db.run(
    'UPDATE upcoming_features SET is_deleted = 1, status = ?, updated_at = CURRENT_TIMESTAMP WHERE feature_id = ?',
    ['Cancelled', feature_id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Log to history
        db.run(
          `INSERT INTO feature_history (feature_id, action, changed_by_name, changed_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [feature_id, 'Feature Cancelled/Deleted', changed_by_name || 'Unknown']
        );

        res.json({ success: true, message: 'Feature cancelled successfully' });
      }
    }
  );
});

// Link test to feature
app.post('/api/features/:feature_id/link-test', (req, res) => {
  const { feature_id } = req.params;
  const { test_id, changed_by_name } = req.body;

  if (!test_id) {
    return res.status(400).json({ error: 'test_id is required' });
  }

  // Get current linked tests
  db.get('SELECT linked_tests FROM upcoming_features WHERE feature_id = ?', [feature_id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    let linkedTests = safeJsonParse(row.linked_tests, []);

    // Add test if not already linked
    if (!linkedTests.includes(test_id)) {
      linkedTests.push(test_id);

      db.run(
        'UPDATE upcoming_features SET linked_tests = ?, updated_at = CURRENT_TIMESTAMP WHERE feature_id = ?',
        [JSON.stringify(linkedTests), feature_id],
        function(err) {
          if (err) {
            res.status(500).json({ error: err.message });
          } else {
            // Log to history
            db.run(
              `INSERT INTO feature_history (feature_id, action, field_name, new_value, changed_by_name, changed_at)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [feature_id, 'Test Linked', 'linked_tests', test_id, changed_by_name || 'Unknown']
            );

            res.json({ success: true, message: 'Test linked to feature' });
          }
        }
      );
    } else {
      res.json({ success: true, message: 'Test already linked' });
    }
  });
});

// Unlink test from feature
app.delete('/api/features/:feature_id/unlink-test/:test_id', (req, res) => {
  const { feature_id, test_id } = req.params;
  const { changed_by_name } = req.body;

  db.get('SELECT linked_tests FROM upcoming_features WHERE feature_id = ?', [feature_id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    let linkedTests = safeJsonParse(row.linked_tests, []);
    linkedTests = linkedTests.filter(id => id !== test_id);

    db.run(
      'UPDATE upcoming_features SET linked_tests = ?, updated_at = CURRENT_TIMESTAMP WHERE feature_id = ?',
      [JSON.stringify(linkedTests), feature_id],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          // Log to history
          db.run(
            `INSERT INTO feature_history (feature_id, action, field_name, old_value, changed_by_name, changed_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [feature_id, 'Test Unlinked', 'linked_tests', test_id, changed_by_name || 'Unknown']
          );

          res.json({ success: true, message: 'Test unlinked from feature' });
        }
      }
    );
  });
});

// Get linked tests for a feature
app.get('/api/features/:feature_id/linked-tests', (req, res) => {
  const { feature_id } = req.params;

  db.get('SELECT linked_tests FROM upcoming_features WHERE feature_id = ?', [feature_id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    const linkedTestIds = safeJsonParse(row.linked_tests, []);
    if (linkedTestIds.length === 0) {
      return res.json([]);
    }

    // Get test details
    const placeholders = linkedTestIds.map(() => '?').join(',');
    db.all(
      `SELECT * FROM custom_tests WHERE test_id IN (${placeholders}) AND is_active = 1 ORDER BY created_at DESC`,
      linkedTestIds,
      (err, tests) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          const parsedTests = (tests || []).map(test => ({
            ...test,
            steps: safeJsonParse(test.steps, []),
            prerequisites: safeJsonParse(test.prerequisites, []),
            test_data: safeJsonParse(test.test_data, {}),
            tags: safeJsonParse(test.tags, [])
          }));
          res.json(parsedTests);
        }
      }
    );
  });
});

// Get features linked to a test
app.get('/api/tests/:test_id/linked-features', (req, res) => {
  const { test_id } = req.params;

  db.all(
    `SELECT * FROM upcoming_features WHERE linked_tests LIKE ? AND is_deleted = 0 ORDER BY created_at DESC`,
    [`%"${test_id}"%`],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        const features = rows.map(f => ({
          ...f,
          acceptance_criteria: safeJsonParse(f.acceptance_criteria, []),
          linked_tests: safeJsonParse(f.linked_tests, []),
          related_features: safeJsonParse(f.related_features, []),
          tags: safeJsonParse(f.tags, [])
        }));
        res.json(features);
      }
    }
  );
});

// Add comment to feature
app.post('/api/features/:feature_id/comments', (req, res) => {
  const { feature_id } = req.params;
  const { comment_text, author_name, author_email, author_id, is_internal = false } = req.body;

  if (!comment_text || !author_name) {
    return res.status(400).json({ error: 'comment_text and author_name are required' });
  }

  db.run(
    `INSERT INTO feature_comments (feature_id, comment_text, author_id, author_name, author_email, is_internal)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [feature_id, comment_text, author_id, author_name, author_email, is_internal ? 1 : 0],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, comment_id: this.lastID, message: 'Comment added' });
      }
    }
  );
});

// Get comments for a feature
app.get('/api/features/:feature_id/comments', (req, res) => {
  const { feature_id } = req.params;

  db.all(
    'SELECT * FROM feature_comments WHERE feature_id = ? ORDER BY created_at DESC',
    [feature_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    }
  );
});

// Get feature history
app.get('/api/features/:feature_id/history', (req, res) => {
  const { feature_id } = req.params;

  db.all(
    'SELECT * FROM feature_history WHERE feature_id = ? ORDER BY changed_at DESC',
    [feature_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    }
  );
});

// Upload attachment to feature
app.post('/api/features/:feature_id/attachments', upload.array('files', 5), (req, res) => {
  const { feature_id } = req.params;
  const { uploaded_by_name, uploaded_by_id } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  // Create features upload directory if needed
  const featureUploadsDir = path.join(uploadsDir, 'features');
  if (!fs.existsSync(featureUploadsDir)) {
    fs.mkdirSync(featureUploadsDir, { recursive: true });
  }

  const attachments = [];
  const insertPromises = req.files.map(file => {
    return new Promise((resolve, reject) => {
      const attachment_id = `ATT-FEAT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const newPath = path.join(featureUploadsDir, file.filename);

      // Move file to features directory
      fs.rename(file.path, newPath, (err) => {
        if (err) {
          console.error('Error moving file:', err);
          return reject(err);
        }

        db.run(
          `INSERT INTO feature_attachments (
            attachment_id, feature_id, filename, original_name, mimetype, size, path,
            uploaded_by_id, uploaded_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            attachment_id,
            feature_id,
            file.filename,
            file.originalname,
            file.mimetype,
            file.size,
            `/uploads/features/${file.filename}`,
            uploaded_by_id,
            uploaded_by_name
          ],
          function(err) {
            if (err) {
              reject(err);
            } else {
              attachments.push({
                attachment_id,
                filename: file.filename,
                original_name: file.originalname,
                path: `/uploads/features/${file.filename}`
              });
              resolve();
            }
          }
        );
      });
    });
  });

  Promise.all(insertPromises)
    .then(() => {
      res.json({
        success: true,
        message: `${attachments.length} file(s) uploaded successfully`,
        attachments
      });
    })
    .catch(err => {
      console.error('Error uploading attachments:', err);
      res.status(500).json({ error: err.message });
    });
});

// Get attachments for a feature
app.get('/api/features/:feature_id/attachments', (req, res) => {
  const { feature_id } = req.params;

  db.all(
    'SELECT * FROM feature_attachments WHERE feature_id = ? ORDER BY uploaded_at DESC',
    [feature_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    }
  );
});

// Delete attachment
app.delete('/api/features/:feature_id/attachments/:attachment_id', (req, res) => {
  const { attachment_id } = req.params;

  // Get attachment info first
  db.get(
    'SELECT * FROM feature_attachments WHERE attachment_id = ?',
    [attachment_id],
    (err, attachment) => {
      if (err || !attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Delete file from filesystem
      const filePath = path.join(uploadsDir, 'features', attachment.filename);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
        }
      });

      // Delete from database
      db.run(
        'DELETE FROM feature_attachments WHERE attachment_id = ?',
        [attachment_id],
        function(err) {
          if (err) {
            res.status(500).json({ error: err.message });
          } else {
            res.json({ success: true, message: 'Attachment deleted' });
          }
        }
      );
    }
  );
});

// Get feature statistics
app.get('/api/features/stats', (req, res) => {
  db.get(
    `SELECT
      COUNT(*) as total_features,
      SUM(CASE WHEN status = 'Planned' THEN 1 ELSE 0 END) as planned,
      SUM(CASE WHEN status = 'In Design' THEN 1 ELSE 0 END) as in_design,
      SUM(CASE WHEN status = 'In Development' THEN 1 ELSE 0 END) as in_development,
      SUM(CASE WHEN status = 'In Testing' THEN 1 ELSE 0 END) as in_testing,
      SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN priority = 'P1' THEN 1 ELSE 0 END) as p1_features,
      SUM(CASE WHEN priority = 'P2' THEN 1 ELSE 0 END) as p2_features,
      SUM(CASE WHEN priority = 'P3' THEN 1 ELSE 0 END) as p3_features,
      SUM(CASE WHEN priority = 'P4' THEN 1 ELSE 0 END) as p4_features
    FROM upcoming_features
    WHERE is_deleted = 0`,
    [],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(row || {});
      }
    }
  );
});

// Get features by version
app.get('/api/features/by-version/:version_id', (req, res) => {
  const { version_id } = req.params;

  db.all(
    'SELECT * FROM upcoming_features WHERE target_version = ? AND is_deleted = 0 ORDER BY priority, created_at DESC',
    [version_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        const features = rows.map(f => ({
          ...f,
          acceptance_criteria: safeJsonParse(f.acceptance_criteria, []),
          linked_tests: safeJsonParse(f.linked_tests, []),
          tags: safeJsonParse(f.tags, [])
        }));
        res.json(features);
      }
    }
  );
});

// Get features by module
app.get('/api/features/by-module/:module_id', (req, res) => {
  const { module_id } = req.params;

  db.all(
    'SELECT * FROM upcoming_features WHERE module_id = ? AND is_deleted = 0 ORDER BY priority, created_at DESC',
    [module_id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        const features = rows.map(f => ({
          ...f,
          acceptance_criteria: safeJsonParse(f.acceptance_criteria, []),
          linked_tests: safeJsonParse(f.linked_tests, []),
          tags: safeJsonParse(f.tags, [])
        }));
        res.json(features);
      }
    }
  );
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Testing feedback server running on port ${PORT}`);
  console.log(`📁 Database location: ${dbPath}`);
  console.log(`📂 Uploads directory: ${uploadsDir}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});
 
