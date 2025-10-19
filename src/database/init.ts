import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const db = new Database(path.join(dataDir, 'erp_testing.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  console.log('🔄 Initializing database...');

  // Create tables ONLY if they don't exist (won't delete existing data)

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'tester',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Modules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      module_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Versions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS versions (
      version_id TEXT PRIMARY KEY,
      version_number TEXT NOT NULL,
      version_name TEXT NOT NULL,
      release_date DATE,
      status TEXT DEFAULT 'planned',
      description TEXT,
      bug_fixes TEXT,
      new_features TEXT,
      known_issues TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Features table (new table, won't affect existing data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      feature_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      release_date DATE NOT NULL,
      version_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      status TEXT DEFAULT 'Planned',
      priority TEXT DEFAULT 'P3',
      feature_type TEXT DEFAULT 'New Feature',
      business_impact TEXT,
      target_users TEXT,
      success_metrics TEXT,
      technical_spec TEXT,
      dependencies TEXT,
      dependent_features TEXT,
      blocking_features TEXT,
      api_changes INTEGER DEFAULT 0,
      database_changes INTEGER DEFAULT 0,
      breaking_changes INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'Medium',
      risk_mitigation TEXT,
      rollback_plan TEXT,
      progress_percentage INTEGER DEFAULT 0,
      development_start_date DATE,
      development_end_date DATE,
      testing_start_date DATE,
      testing_end_date DATE,
      actual_release_date DATE,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      feature_owner TEXT,
      technical_lead TEXT,
      qa_lead TEXT,
      is_active INTEGER DEFAULT 1,
      is_deleted INTEGER DEFAULT 0,
      tags TEXT,
      FOREIGN KEY (version_id) REFERENCES versions(version_id),
      FOREIGN KEY (module_id) REFERENCES modules(module_id)
    )
  `);

  // Feature Comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_comments (
      comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (feature_id) REFERENCES features(feature_id) ON DELETE CASCADE
    )
  `);

  // Feature Attachments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_attachments (
      attachment_id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER,
      mimetype TEXT,
      uploaded_by TEXT,
      uploaded_by_name TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (feature_id) REFERENCES features(feature_id) ON DELETE CASCADE
    )
  `);

  // Feature Tests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_tests (
      feature_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      test_type TEXT DEFAULT 'Integration',
      is_mandatory INTEGER DEFAULT 1,
      test_status TEXT DEFAULT 'Pending',
      tested_by TEXT,
      tested_at DATETIME,
      PRIMARY KEY (feature_id, test_id),
      FOREIGN KEY (feature_id) REFERENCES features(feature_id) ON DELETE CASCADE
    )
  `);

  // Feature History table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT NOT NULL,
      action TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (feature_id) REFERENCES features(feature_id) ON DELETE CASCADE
    )
  `);

  // Feature Dependencies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_dependencies (
      dependency_id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT NOT NULL,
      depends_on_feature_id TEXT NOT NULL,
      dependency_type TEXT DEFAULT 'blocks',
      is_critical INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (feature_id) REFERENCES features(feature_id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_feature_id) REFERENCES features(feature_id) ON DELETE CASCADE
    )
  `);

  // Bugs table - EXISTING DATA SAFE
  db.exec(`
    CREATE TABLE IF NOT EXISTS bugs (
      bug_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'New',
      priority TEXT DEFAULT 'Medium',
      severity TEXT DEFAULT 'Medium',
      module_id TEXT,
      version_id TEXT,
      assigned_to TEXT,
      reported_by TEXT NOT NULL,
      steps_to_reproduce TEXT,
      expected_behavior TEXT,
      actual_behavior TEXT,
      environment TEXT,
      attachments TEXT,
      is_deleted INTEGER DEFAULT 0,
      is_rejected INTEGER DEFAULT 0,
      rejection_reason TEXT,
      resolution TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (module_id) REFERENCES modules(module_id),
      FOREIGN KEY (version_id) REFERENCES versions(version_id)
    )
  `);

  // Bug Comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_comments (
      comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      bug_id TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bug_id) REFERENCES bugs(bug_id) ON DELETE CASCADE
    )
  `);

  // Custom Tests table - EXISTING DATA SAFE
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_tests (
      test_id TEXT PRIMARY KEY,
      test_name TEXT NOT NULL,
      module_id TEXT NOT NULL,
      category TEXT,
      priority TEXT DEFAULT 'Medium',
      description TEXT,
      steps TEXT,
      expected_result TEXT,
      prerequisites TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(module_id)
    )
  `);

  // Test Sessions table - EXISTING DATA SAFE
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_sessions (
      session_id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      tester_id TEXT NOT NULL,
      tester_name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (version_id) REFERENCES versions(version_id)
    )
  `);

  // Test Results table - EXISTING DATA SAFE
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_results (
      result_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      test_id TEXT,
      test_case_id TEXT,
      module_name TEXT,
      test_case_title TEXT,
      test_name TEXT,
      status TEXT,
      priority TEXT,
      category TEXT,
      bugs_found INTEGER DEFAULT 0,
      tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tested_by TEXT,
      notes TEXT,
      FOREIGN KEY (session_id) REFERENCES test_sessions(session_id),
      FOREIGN KEY (test_id) REFERENCES custom_tests(test_id)
    )
  `);

  // Test Feedback table
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_feedback (
      feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      module_name TEXT,
      feedback TEXT NOT NULL,
      severity TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      FOREIGN KEY (session_id) REFERENCES test_sessions(session_id)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_features_version ON features(version_id);
    CREATE INDEX IF NOT EXISTS idx_features_module ON features(module_id);
    CREATE INDEX IF NOT EXISTS idx_features_status ON features(status);
    CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
    CREATE INDEX IF NOT EXISTS idx_bugs_module ON bugs(module_id);
    CREATE INDEX IF NOT EXISTS idx_test_results_session ON test_results(session_id);
  `);

  // Insert default admin user ONLY if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
  if (userCount.count === 0) {
    console.log('📝 Creating default admin user...');
    const hashedPassword = bcrypt.hashSync('admin123', 10);

    db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run(
      'admin@dnaerp.com',
      hashedPassword,
      'Admin User',
      'admin'
    );
    console.log('✅ Default admin user created (email: admin@dnaerp.com, password: admin123)');
  } else {
    console.log('✅ Users table already has data, skipping default user creation');
  }

  // Insert sample modules ONLY if none exist
  const moduleCount = db.prepare('SELECT COUNT(*) as count FROM modules').get() as any;
  if (moduleCount.count === 0) {
    console.log('📝 Creating sample modules...');
    const modules = [
      { module_id: 'finance', name: 'Finance', description: 'Financial management module' },
      { module_id: 'hr', name: 'Human Resources', description: 'HR management module' },
      { module_id: 'inventory', name: 'Inventory', description: 'Inventory management module' },
      { module_id: 'sales', name: 'Sales', description: 'Sales and CRM module' },
      { module_id: 'purchasing', name: 'Purchasing', description: 'Procurement module' },
      { module_id: 'security', name: 'Security', description: 'Security and access control' },
      { module_id: 'core', name: 'Core System', description: 'Core system functionality' },
      { module_id: 'customer', name: 'Customer Service', description: 'Customer service module' },
    ];

    const insertModule = db.prepare(`
      INSERT OR IGNORE INTO modules (module_id, name, description)
      VALUES (?, ?, ?)
    `);

    modules.forEach(module => {
      insertModule.run(module.module_id, module.name, module.description);
    });
    console.log('✅ Sample modules created');
  } else {
    console.log('✅ Modules table already has data, skipping sample module creation');
  }

  // Insert sample versions ONLY if none exist
  const versionCount = db.prepare('SELECT COUNT(*) as count FROM versions').get() as any;
  if (versionCount.count === 0) {
    console.log('📝 Creating sample versions...');
    const versions = [
      { version_id: 'v1.0', version_number: '1.0', version_name: 'Initial Release', status: 'released' },
      { version_id: 'v1.1', version_number: '1.1', version_name: 'Performance Update', status: 'released' },
      { version_id: 'v1.2', version_number: '1.2', version_name: 'Security Patch', status: 'current' },
      { version_id: 'v1.3', version_number: '1.3', version_name: 'Feature Update', status: 'planned' },
      { version_id: 'v2.0', version_number: '2.0', version_name: 'Major Update', status: 'planned' },
    ];

    const insertVersion = db.prepare(`
      INSERT OR IGNORE INTO versions (version_id, version_number, version_name, status, release_date)
      VALUES (?, ?, ?, ?, ?)
    `);

    versions.forEach(version => {
      const releaseDate = version.status === 'released'
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : version.status === 'current'
        ? new Date().toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      insertVersion.run(version.version_id, version.version_number, version.version_name, version.status, releaseDate);
    });
    console.log('✅ Sample versions created');
  } else {
    console.log('✅ Versions table already has data, skipping sample version creation');
  }

  // Log data statistics
  const bugCount = db.prepare('SELECT COUNT(*) as count FROM bugs').get() as any;
  const testCount = db.prepare('SELECT COUNT(*) as count FROM custom_tests').get() as any;
  const featureCount = db.prepare('SELECT COUNT(*) as count FROM features').get() as any;

  console.log('📊 Database Statistics:');
  console.log(`   - Users: ${userCount.count}`);
  console.log(`   - Modules: ${moduleCount.count}`);
  console.log(`   - Versions: ${versionCount.count}`);
  console.log(`   - Bugs: ${bugCount.count}`);
  console.log(`   - Tests: ${testCount.count}`);
  console.log(`   - Features: ${featureCount.count}`);

  console.log('✅ Database initialization complete - All existing data preserved!');
}

export default db;
