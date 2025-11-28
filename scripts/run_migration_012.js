#!/usr/bin/env node
/**
 * Run migration 012 - Create calls tables
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function runMigration() {
    try {
        console.log('Running migration 012: Create calls tables...');

        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '012_create_calls_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration
        await pool.query(sql);

        console.log('✅ Migration 012 completed successfully!');
        console.log('Created tables:');
        console.log('  - calls');
        console.log('  - call_participants');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
