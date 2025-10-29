const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determine database path (same logic as server.js)
let dbPath;
try {
  if (fs.existsSync('/var/data')) {
    const testFile = '/var/data/.db-write-test';
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    dbPath = '/var/data/testing_feedback.db';
    console.log('✅ Using Render persistent disk for database at:', dbPath);
  } else {
    throw new Error('/var/data does not exist');
  }
} catch (error) {
  dbPath = './testing_feedback.db';
  console.log('✅ Using local database at:', dbPath);
}

console.log('\n🔄 Starting database migration...\n');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Run migration
db.serialize(() => {
  console.log('\n📋 Checking if columns already exist...');

  db.all("PRAGMA table_info(upcoming_features)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking table schema:', err);
      db.close();
      process.exit(1);
    }

    const hasStartDate = columns.some(col => col.name === 'start_date');
    const hasEndDate = columns.some(col => col.name === 'end_date');

    if (hasStartDate && hasEndDate) {
      console.log('✅ Columns start_date and end_date already exist!');
      console.log('✅ Migration not needed - database is up to date');
      db.close();
      process.exit(0);
    }

    console.log('\n🔧 Adding new columns...\n');

    // Add start_date column if missing
    if (!hasStartDate) {
      db.run("ALTER TABLE upcoming_features ADD COLUMN start_date DATE", (err) => {
        if (err) {
          console.error('❌ Error adding start_date column:', err);
          db.close();
          process.exit(1);
        }
        console.log('✅ Added column: start_date');
      });
    }

    // Add end_date column if missing
    if (!hasEndDate) {
      db.run("ALTER TABLE upcoming_features ADD COLUMN end_date DATE", (err) => {
        if (err) {
          console.error('❌ Error adding end_date column:', err);
          db.close();
          process.exit(1);
        }
        console.log('✅ Added column: end_date');
      });
    }

    // Verify the migration
    db.all("PRAGMA table_info(upcoming_features)", [], (err, updatedColumns) => {
      if (err) {
        console.error('❌ Error verifying migration:', err);
        db.close();
        process.exit(1);
      }

      console.log('\n✅ Migration completed successfully!\n');
      console.log('📊 Updated table schema:');
      console.log('Columns:', updatedColumns.map(c => c.name).join(', '));

      db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err);
          process.exit(1);
        }
        console.log('\n✅ Database connection closed');
        console.log('🎉 You can now create features with start_date and end_date!');
        process.exit(0);
      });
    });
  });
});
