const { query } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, 'database', 'migrations', '009_create_pinned_and_favorites.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Running migration: 009_create_pinned_and_favorites.sql');
        await query(sql);
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
