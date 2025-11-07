#!/usr/bin/env node

// Quick script to run migration 010 using pm2's environment
const fs = require('fs');
const path = require('path');
const { query, pool } = require('./config/database');

async function runMigration() {
    console.log('🚀 Running migration 010_fix_department_constraint.sql...\n');

    try {
        const sql = fs.readFileSync(
            path.join(__dirname, 'database/migrations/010_fix_department_constraint.sql'),
            'utf8'
        );

        console.log('SQL to execute:');
        console.log(sql);
        console.log('\n---\n');

        await query(sql);
        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
