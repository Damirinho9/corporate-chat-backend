#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/database');

async function runMigration(filename) {
    console.log(`\n📦 Running migration: ${filename}`);

    const filePath = path.join(__dirname, 'migrations', filename);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
        await query(sql);
        console.log(`✅ Migration ${filename} completed successfully`);
        return true;
    } catch (error) {
        console.error(`❌ Migration ${filename} failed:`, error.message);
        return false;
    }
}

async function migrate() {
    console.log('🚀 Starting database migrations...\n');

    try {
        // Check database connection
        await query('SELECT 1');
        console.log('✅ Database connected\n');

        // Get all migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort(); // Sort to ensure order

        console.log(`Found ${files.length} migration(s):\n${files.map(f => `  - ${f}`).join('\n')}\n`);

        // Run specific migration if provided as argument
        const targetMigration = process.argv[2];

        if (targetMigration) {
            console.log(`🎯 Running specific migration: ${targetMigration}\n`);
            if (files.includes(targetMigration)) {
                const success = await runMigration(targetMigration);
                process.exit(success ? 0 : 1);
            } else {
                console.error(`❌ Migration file not found: ${targetMigration}`);
                process.exit(1);
            }
        }

        // Run all migrations
        let successCount = 0;
        for (const file of files) {
            const success = await runMigration(file);
            if (success) successCount++;
        }

        console.log(`\n✅ Completed ${successCount}/${files.length} migrations\n`);
        process.exit(successCount === files.length ? 0 : 1);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    migrate();
}

module.exports = migrate;
