#!/usr/bin/env node
/**
 * Verification script for direct chat cleanup
 *
 * Shows the current state of all direct chats and identifies any remaining issues
 * Safe to run - does not modify any data
 */

const { pool } = require('../../config/database');

async function verifyCleanup() {
    const client = await pool.connect();

    try {
        console.log('🔍 DIRECT CHAT CLEANUP VERIFICATION\n');
        console.log('='.repeat(60));

        // Overall statistics
        const stats = await client.query(`
            SELECT
                COUNT(*) as total_direct_chats,
                COUNT(*) FILTER (
                    WHERE (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2
                ) as correct_chats,
                COUNT(*) FILTER (
                    WHERE (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2
                ) as broken_chats,
                SUM((SELECT COUNT(*) FROM messages WHERE chat_id = c.id)) as total_messages
            FROM chats c
            WHERE c.type = 'direct'
        `);

        const summary = stats.rows[0];
        console.log('\n📊 OVERALL STATISTICS:');
        console.log(`   Total direct chats: ${summary.total_direct_chats}`);
        console.log(`   ✅ Correct (2 participants): ${summary.correct_chats}`);
        console.log(`   ⚠️  Broken (!= 2 participants): ${summary.broken_chats}`);
        console.log(`   📨 Total messages: ${summary.total_messages}`);

        // Check for duplicates
        const duplicates = await client.query(`
            WITH chat_pairs AS (
                SELECT
                    LEAST(cp1.user_id, cp2.user_id) as user1,
                    GREATEST(cp1.user_id, cp2.user_id) as user2,
                    COUNT(DISTINCT c.id) as chat_count,
                    ARRAY_AGG(c.id ORDER BY c.id) as chat_ids
                FROM chats c
                JOIN chat_participants cp1 ON c.id = cp1.chat_id
                JOIN chat_participants cp2 ON c.id = cp2.chat_id
                WHERE c.type = 'direct'
                  AND cp1.user_id < cp2.user_id
                  AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2
                GROUP BY user1, user2
                HAVING COUNT(DISTINCT c.id) > 1
            )
            SELECT * FROM chat_pairs
        `);

        console.log('\n🔄 DUPLICATE CHATS:');
        if (duplicates.rows.length === 0) {
            console.log('   ✅ No duplicates found!');
        } else {
            console.log(`   ⚠️  Found ${duplicates.rows.length} user pairs with duplicate chats:`);
            console.table(duplicates.rows);
        }

        // List broken chats if any
        if (parseInt(summary.broken_chats) > 0) {
            const broken = await client.query(`
                SELECT
                    c.id,
                    c.created_at,
                    (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) as participant_count,
                    (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count,
                    (
                        SELECT STRING_AGG(u.name, ', ' ORDER BY u.name)
                        FROM chat_participants cp
                        JOIN users u ON cp.user_id = u.id
                        WHERE cp.chat_id = c.id
                    ) as participants
                FROM chats c
                WHERE c.type = 'direct'
                  AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2
                ORDER BY
                    (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) DESC,
                    c.id
            `);

            console.log('\n⚠️  BROKEN CHATS (detailed):\n');
            console.table(broken.rows);

            console.log('\n💡 RECOMMENDATIONS:');
            broken.rows.forEach(chat => {
                console.log(`\n   Chat ${chat.id}:`);
                if (chat.participant_count === 0 && chat.message_count === 0) {
                    console.log('      → Safe to delete (no participants, no messages)');
                    console.log(`      DELETE FROM chats WHERE id = ${chat.id};`);
                } else if (chat.participant_count === 1 && chat.message_count === 0) {
                    console.log('      → Safe to delete (only 1 participant, no messages)');
                    console.log(`      DELETE FROM chat_participants WHERE chat_id = ${chat.id};`);
                    console.log(`      DELETE FROM chats WHERE id = ${chat.id};`);
                } else if (chat.participant_count === 1 && chat.message_count > 0) {
                    console.log(`      ⚠️  Has ${chat.message_count} messages with only 1 participant`);
                    console.log('      → Manual review needed:');
                    console.log('         1. Check if other user was deleted');
                    console.log('         2. If messages are important, restore missing participant');
                    console.log('         3. If not needed, delete the chat');
                } else if (chat.participant_count > 2) {
                    console.log(`      ⚠️  Has ${chat.participant_count} participants (should be 2)`);
                    console.log('      → Run cleanup migration to fix');
                }
            });
        }

        // Check for orphaned messages
        const orphans = await client.query(`
            SELECT COUNT(*) as orphaned_messages
            FROM messages m
            WHERE NOT EXISTS (SELECT 1 FROM chats WHERE id = m.chat_id)
        `);

        console.log('\n\n💾 MESSAGE INTEGRITY:');
        if (parseInt(orphans.rows[0].orphaned_messages) === 0) {
            console.log('   ✅ No orphaned messages - all messages belong to valid chats');
        } else {
            console.log(`   ❌ WARNING: ${orphans.rows[0].orphaned_messages} orphaned messages found!`);
        }

        // Final summary
        console.log('\n' + '='.repeat(60));
        if (parseInt(summary.broken_chats) === 0 &&
            duplicates.rows.length === 0 &&
            parseInt(orphans.rows[0].orphaned_messages) === 0) {
            console.log('🎉 PERFECT! All direct chats are clean and valid!');
        } else {
            console.log('⚠️  Some issues found - see details above');
        }
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

console.log('Starting verification...\n');
verifyCleanup();
