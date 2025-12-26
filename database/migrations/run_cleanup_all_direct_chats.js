#!/usr/bin/env node
/**
 * Clean up all broken direct chats migration
 *
 * This script:
 * 1. Deletes empty broken chats (0 or 1 participant, no messages)
 * 2. Fixes chats with 3+ participants (keeps first 2)
 * 3. Merges duplicate direct chats (preserves ALL messages)
 * 4. Verifies no messages were lost
 *
 * Usage: node database/migrations/run_cleanup_all_direct_chats.js --confirm
 */

const { pool } = require('../../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting migration: Clean up all broken direct chats\n');
        console.log('⚠️  This will:');
        console.log('   - Delete empty broken chats (0 or 1 participant)');
        console.log('   - Fix chats with 3+ participants');
        console.log('   - Merge duplicate chats between same users');
        console.log('   - Preserve ALL messages\n');

        // Read SQL file
        const sqlPath = path.join(__dirname, 'cleanup_all_direct_chats.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute migration
        console.log('📝 Executing SQL migration...\n');
        const result = await client.query(sql);

        console.log('\n✅ Migration completed successfully!');
        console.log('📊 Check the output above for detailed results.\n');

        // Additional verification query
        console.log('=== POST-MIGRATION DETAILED VERIFICATION ===');
        const verification = await client.query(`
            SELECT
                'Total direct chats' as metric,
                COUNT(*)::text as value
            FROM chats
            WHERE type = 'direct'

            UNION ALL

            SELECT
                'Chats with 2 participants (correct)' as metric,
                COUNT(*)::text as value
            FROM chats c
            WHERE c.type = 'direct'
              AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2

            UNION ALL

            SELECT
                'Chats with wrong participant count' as metric,
                COUNT(*)::text as value
            FROM chats c
            WHERE c.type = 'direct'
              AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2

            UNION ALL

            SELECT
                'Total messages in direct chats' as metric,
                COUNT(*)::text as value
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE c.type = 'direct'

            UNION ALL

            SELECT
                'Orphaned messages (should be 0)' as metric,
                COUNT(*)::text as value
            FROM messages m
            WHERE NOT EXISTS (SELECT 1 FROM chats WHERE id = m.chat_id)
        `);

        console.log('\nVerification Results:');
        console.table(verification.rows);

        // Check for any remaining issues
        const issues = await client.query(`
            SELECT
                c.id,
                COUNT(cp.user_id) as participant_count,
                (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count,
                STRING_AGG(u.name, ' ↔ ' ORDER BY u.name) as participants
            FROM chats c
            LEFT JOIN chat_participants cp ON c.id = cp.chat_id
            LEFT JOIN users u ON cp.user_id = u.id
            WHERE c.type = 'direct'
              AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2
            GROUP BY c.id
            ORDER BY participant_count DESC, message_count DESC
        `);

        if (issues.rows.length > 0) {
            console.log('\n⚠️  Remaining issues (chats with != 2 participants):');
            console.table(issues.rows);
        } else {
            console.log('\n✅ Perfect! All direct chats now have exactly 2 participants.');
        }

        // Show sample of cleaned chats
        const sample = await client.query(`
            SELECT
                c.id,
                COUNT(DISTINCT cp.user_id) as participants,
                (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as messages,
                STRING_AGG(DISTINCT u.name, ' ↔ ' ORDER BY u.name) as user_names
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            JOIN users u ON cp.user_id = u.id
            WHERE c.type = 'direct'
            GROUP BY c.id
            ORDER BY messages DESC
            LIMIT 10
        `);

        console.log('\nSample of cleaned direct chats (top 10 by message count):');
        console.table(sample.rows);

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('\n⚠️  Database was rolled back to previous state.');
        console.error('\nError details:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Confirmation prompt
console.log('⚠️  WARNING: This will modify the database!\n');
console.log('This migration will:');
console.log('  1. Delete empty broken chats (0 or 1 participant, no messages)');
console.log('  2. Fix chats with 3+ participants (keep first 2)');
console.log('  3. Merge duplicate chats between same users');
console.log('  4. Preserve ALL messages (no message deletion)\n');

const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
    console.log('To run this migration, use:');
    console.log('  node database/migrations/run_cleanup_all_direct_chats.js --confirm\n');
    console.log('💡 Tip: First check current state with:');
    console.log('  psql -d corporate_chat -c "SELECT type, COUNT(*) FROM chats GROUP BY type"\n');
    process.exit(0);
}

runMigration();
