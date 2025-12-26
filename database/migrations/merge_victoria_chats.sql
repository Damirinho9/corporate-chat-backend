-- Migration: Merge duplicate Victoria chats into chat 58
-- Author: Claude
-- Date: 2025-12-26
-- Purpose: Fix duplicate direct chat issue - merge all messages into proper direct chat

-- ============================================
-- BACKUP FIRST (manual step before running)
-- ============================================
-- pg_dump -U postgres -d chat_db > backup_before_merge_$(date +%Y%m%d_%H%M%S).sql

BEGIN;

-- Step 1: Show current state
DO $$
BEGIN
    RAISE NOTICE '=== CURRENT STATE ===';
    RAISE NOTICE 'Chat 46: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 46);
    RAISE NOTICE 'Chat 51: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 51);
    RAISE NOTICE 'Chat 43: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 43);
    RAISE NOTICE 'Chat 41: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 41);
    RAISE NOTICE 'Chat 38: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 38);
    RAISE NOTICE 'Chat 35: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 35);
    RAISE NOTICE 'Chat 58: % messages (target)', (SELECT COUNT(*) FROM messages WHERE chat_id = 58);
    RAISE NOTICE 'Total to migrate: % messages', (
        SELECT COUNT(*) FROM messages
        WHERE chat_id IN (46, 51, 43, 41, 38, 35)
    );
END $$;

-- Step 2: Migrate all messages from duplicate chats to chat 58
-- This preserves all metadata: timestamps, user_id, content, files, etc.
UPDATE messages
SET chat_id = 58
WHERE chat_id IN (46, 51, 43, 41, 38, 35);

-- Step 3: Update chat 58 timestamp to most recent message
UPDATE chats
SET updated_at = (
    SELECT MAX(created_at) FROM messages WHERE chat_id = 58
)
WHERE id = 58;

-- Step 4: Remove Sergey (user 13) from all direct chats with Victoria
-- This prevents future duplicate chat creation
DELETE FROM chat_participants
WHERE chat_id IN (
    SELECT c.id
    FROM chats c
    JOIN chat_participants cp ON c.id = cp.chat_id
    WHERE c.type = 'direct'
      AND cp.user_id = 13
      AND EXISTS (
          SELECT 1 FROM chat_participants cp2
          WHERE cp2.chat_id = c.id AND cp2.user_id = 1
      )
      AND EXISTS (
          SELECT 1 FROM chat_participants cp3
          WHERE cp3.chat_id = c.id AND cp3.user_id = 20
      )
)
AND user_id = 13;

-- Step 5: Delete empty duplicate chats
-- First, remove all participants from these chats
DELETE FROM chat_participants
WHERE chat_id IN (46, 51, 43, 41, 38, 35);

-- Then delete the chats themselves
DELETE FROM chats
WHERE id IN (46, 51, 43, 41, 38, 35);

-- Step 6: Verify final state
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL STATE ===';
    RAISE NOTICE 'Chat 58: % messages', (SELECT COUNT(*) FROM messages WHERE chat_id = 58);
    RAISE NOTICE 'Chat 58 participants: %', (
        SELECT STRING_AGG(u.name, ', ' ORDER BY u.name)
        FROM chat_participants cp
        JOIN users u ON cp.user_id = u.id
        WHERE cp.chat_id = 58
    );
    RAISE NOTICE 'Deleted chats still exist: %', (
        SELECT COUNT(*) FROM chats WHERE id IN (46, 51, 43, 41, 38, 35)
    );
    RAISE NOTICE 'Sergey in direct chats with Victoria: %', (
        SELECT COUNT(*)
        FROM chat_participants cp
        WHERE cp.user_id = 13
          AND cp.chat_id IN (
              SELECT c.id
              FROM chats c
              JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = 1
              JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = 20
              WHERE c.type = 'direct'
          )
    );
END $$;

-- If everything looks good in the output above, COMMIT
-- If something is wrong, ROLLBACK manually

-- Uncomment one of these lines after reviewing the output:
-- COMMIT;
-- ROLLBACK;

COMMIT;
