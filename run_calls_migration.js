#!/usr/bin/env node
/**
 * Standalone migration script for creating calls tables
 * This script can be run independently of the main application
 *
 * Usage: node run_calls_migration.js [DATABASE_URL]
 *
 * Examples:
 *   node run_calls_migration.js
 *   node run_calls_migration.js "postgresql://user:pass@host:5432/dbname"
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    // Get database connection string from argument or environment
    const databaseUrl = process.argv[2] || process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('❌ Error: DATABASE_URL not provided');
        console.error('');
        console.error('Usage:');
        console.error('  node run_calls_migration.js "postgresql://user:pass@host:5432/dbname"');
        console.error('');
        console.error('Or set DATABASE_URL environment variable');
        process.exit(1);
    }

    const client = new Client({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('localhost') ? false : {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔌 Connecting to database...');
        await client.connect();
        console.log('✅ Connected');

        console.log('📖 Reading migration file...');
        const migrationPath = path.join(__dirname, 'database', 'migrations', '012_create_calls_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('✅ Migration file loaded');

        console.log('🔄 Running migration 012: Create calls tables...');
        await client.query(sql);
        console.log('✅ Migration executed successfully!');

        // Verify tables were created
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('calls', 'call_participants')
            ORDER BY table_name
        `);

        console.log('');
        console.log('📋 Created tables:');
        result.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        console.log('');
        console.log('🎉 Migration completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Restart your server (if needed)');
        console.log('  2. Test the video/audio call buttons');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('❌ Migration failed:', error.message);
        console.error('');
        console.error('Details:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigration();
