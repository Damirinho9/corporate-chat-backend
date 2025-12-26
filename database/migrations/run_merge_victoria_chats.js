#!/usr/bin/env node
/**
 * Merge Victoria's duplicate chats migration
 *
 * This script:
 * 1. Migrates all messages from duplicate chats (46, 51, 43, 41, 38, 35) to chat 58
 * 2. Removes Sergey from direct chats with Victoria
 * 3. Deletes empty duplicate chats
 *
 * Usage: node database/migrations/run_merge_victoria_chats.js
 */

const { pool } = require('../../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting migration: Merge Victoria chats\n');

        // Read SQL file
        const sqlPath = path.join(__dirname, 'merge_victoria_chats.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute migration
        console.log('📝 Executing SQL migration...\n');
        const result = await client.query(sql);

        console.log('\n✅ Migration completed successfully!');
        console.log('📊 Check the output above for verification.\n');

        // Additional verification query
        console.log('=== POST-MIGRATION VERIFICATION ===');
        const verification = await client.query(`
            SELECT
                c.id,
                c.type,
                COUNT(m.id) as message_count,
                STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) as participants
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
            LEFT JOIN chat_participants cp ON c.id = cp.chat_id
            LEFT JOIN users u ON cp.user_id = u.id
            WHERE c.id = 58
               OR c.id IN (46, 51, 43, 41, 38, 35)
            GROUP BY c.id, c.type
            ORDER BY c.id
        `);

        console.log('\nChat status after migration:');
        console.table(verification.rows);

        if (verification.rows.length === 1 && verification.rows[0].id === 58) {
            console.log('\n✅ Perfect! Only chat 58 exists with all messages.');
            console.log(`✅ Total messages: ${verification.rows[0].message_count}`);
            console.log(`✅ Participants: ${verification.rows[0].participants}`);
        } else {
            console.log('\n⚠️  Warning: Unexpected chat state. Please review.');
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('\n⚠️  Database was rolled back to previous state.');
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Confirmation prompt
console.log('⚠️  WARNING: This will modify the database!\n');
console.log('This migration will:');
console.log('  1. Move all messages from chats 46, 51, 43, 41, 38, 35 → chat 58');
console.log('  2. Remove Sergey from direct chats with Victoria');
console.log('  3. Delete duplicate chats\n');

const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
    console.log('To run this migration, use:');
    console.log('  node database/migrations/run_merge_victoria_chats.js --confirm\n');
    process.exit(0);
}

runMigration();
