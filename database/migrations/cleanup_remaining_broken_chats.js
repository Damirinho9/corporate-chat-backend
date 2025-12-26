#!/usr/bin/env node
/**
 * Clean up remaining 2 broken direct chats (IDs 10, 16)
 *
 * These chats have only 1 participant each (Sergey)
 * This script will handle them safely
 */

const { pool } = require('../../config/database');

async function cleanupBrokenChats() {
    const client = await pool.connect();

    try {
        console.log('🔍 Checking remaining broken chats...\n');

        // Check the current state of broken chats
        const brokenChats = await client.query(`
            SELECT
                c.id,
                c.type,
                c.created_at,
                (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count,
                (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) as participant_count,
                ARRAY(
                    SELECT json_build_object('id', u.id, 'name', u.name)
                    FROM chat_participants cp
                    JOIN users u ON cp.user_id = u.id
                    WHERE cp.chat_id = c.id
                ) as participants
            FROM chats c
            WHERE c.type = 'direct'
              AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2
            ORDER BY c.id
        `);

        if (brokenChats.rows.length === 0) {
            console.log('✅ No broken chats found! All direct chats have exactly 2 participants.\n');
            return;
        }

        console.log(`Found ${brokenChats.rows.length} broken chat(s):\n`);
        console.table(brokenChats.rows.map(chat => ({
            id: chat.id,
            participants: chat.participant_count,
            messages: chat.message_count,
            users: chat.participants.map(p => p.name).join(', ') || 'none'
        })));

        // For each broken chat, decide what to do
        for (const chat of brokenChats.rows) {
            console.log(`\n--- Processing chat ${chat.id} ---`);
            console.log(`Participants: ${chat.participant_count}`);
            console.log(`Messages: ${chat.message_count}`);
            console.log(`Users: ${chat.participants.map(p => p.name).join(', ') || 'none'}`);

            if (chat.participant_count === 0 && chat.message_count === 0) {
                // Empty chat with no participants - safe to delete
                console.log('→ Deleting empty chat with no participants');
                await client.query('DELETE FROM chats WHERE id = $1', [chat.id]);
                console.log('✅ Deleted');
            } else if (chat.participant_count === 1 && chat.message_count === 0) {
                // Chat with 1 participant but no messages - delete participants then chat
                console.log('→ Deleting chat with 1 participant and no messages');
                await client.query('DELETE FROM chat_participants WHERE chat_id = $1', [chat.id]);
                await client.query('DELETE FROM chats WHERE id = $1', [chat.id]);
                console.log('✅ Deleted');
            } else if (chat.participant_count === 1 && chat.message_count > 0) {
                // Chat with 1 participant but HAS messages - this is tricky
                // These are likely from deleted users or corrupted data
                // Best to keep them for now and let admin decide
                console.log('⚠️  Chat has messages but only 1 participant');
                console.log('   Recommendation: Manually review this chat');
                console.log('   - If messages are important, find the other user and add them');
                console.log('   - If messages are not needed, can delete the chat');
                console.log('   Skipping for now...');
            } else {
                console.log('⚠️  Unexpected state - skipping');
            }
        }

        // Final verification
        console.log('\n=== FINAL STATE ===');
        const finalCheck = await client.query(`
            SELECT
                COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2) as correct_chats,
                COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2) as broken_chats,
                COUNT(*) as total_chats
            FROM chats c
            WHERE c.type = 'direct'
        `);

        const stats = finalCheck.rows[0];
        console.log(`Total direct chats: ${stats.total_chats}`);
        console.log(`✅ Correct (2 participants): ${stats.correct_chats}`);
        console.log(`⚠️  Broken (!= 2 participants): ${stats.broken_chats}`);

        if (parseInt(stats.broken_chats) > 0) {
            console.log('\n📝 Remaining broken chats require manual review.');
            console.log('   Run this query to see details:');
            console.log('   SELECT c.id, COUNT(cp.user_id) as participants,');
            console.log('          (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as messages');
            console.log('   FROM chats c');
            console.log('   LEFT JOIN chat_participants cp ON c.id = cp.chat_id');
            console.log('   WHERE c.type = \'direct\'');
            console.log('   GROUP BY c.id');
            console.log('   HAVING COUNT(cp.user_id) != 2;');
        } else {
            console.log('\n🎉 Perfect! All direct chats are now valid!');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

cleanupBrokenChats();
