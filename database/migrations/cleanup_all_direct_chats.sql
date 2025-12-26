-- Migration: Clean up all broken direct chats
-- Author: Claude
-- Date: 2025-12-26
-- Purpose: Fix systemic issues with direct chats (duplicates, wrong participant counts)

-- ============================================
-- IMPORTANT: This migration preserves ALL messages!
-- Messages are moved, never deleted.
-- ============================================

BEGIN;

-- ========================================
-- STEP 1: ANALYZE CURRENT STATE
-- ========================================
DO $$
DECLARE
    v_total_direct_chats INTEGER;
    v_chats_with_0_participants INTEGER;
    v_chats_with_1_participant INTEGER;
    v_chats_with_2_participants INTEGER;
    v_chats_with_3plus_participants INTEGER;
    v_total_messages INTEGER;
BEGIN
    RAISE NOTICE '=== CURRENT STATE ANALYSIS ===';

    -- Count direct chats by participant count
    SELECT COUNT(*) INTO v_total_direct_chats
    FROM chats WHERE type = 'direct';

    SELECT COUNT(*) INTO v_chats_with_0_participants
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 0;

    SELECT COUNT(*) INTO v_chats_with_1_participant
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 1;

    SELECT COUNT(*) INTO v_chats_with_2_participants
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2;

    SELECT COUNT(*) INTO v_chats_with_3plus_participants
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) >= 3;

    SELECT COUNT(*) INTO v_total_messages
    FROM messages m
    JOIN chats c ON m.chat_id = c.id
    WHERE c.type = 'direct';

    RAISE NOTICE 'Total direct chats: %', v_total_direct_chats;
    RAISE NOTICE 'Chats with 0 participants (broken): %', v_chats_with_0_participants;
    RAISE NOTICE 'Chats with 1 participant (broken): %', v_chats_with_1_participant;
    RAISE NOTICE 'Chats with 2 participants (correct): %', v_chats_with_2_participants;
    RAISE NOTICE 'Chats with 3+ participants (wrong): %', v_chats_with_3plus_participants;
    RAISE NOTICE 'Total messages in direct chats: %', v_total_messages;
    RAISE NOTICE '';
END $$;

-- ========================================
-- STEP 2: DELETE EMPTY BROKEN CHATS
-- (0 or 1 participant, 0 messages)
-- ========================================
DO $$
DECLARE
    v_deleted INTEGER;
BEGIN
    RAISE NOTICE '=== DELETING EMPTY BROKEN CHATS ===';

    -- Delete chats with 0 participants and no messages
    WITH empty_chats AS (
        SELECT c.id
        FROM chats c
        WHERE c.type = 'direct'
          AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 0
          AND (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) = 0
    )
    DELETE FROM chats WHERE id IN (SELECT id FROM empty_chats);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % chats with 0 participants and 0 messages', v_deleted;

    -- Delete participants from chats with 1 participant and no messages
    WITH single_chats AS (
        SELECT c.id
        FROM chats c
        WHERE c.type = 'direct'
          AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 1
          AND (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) = 0
    )
    DELETE FROM chat_participants WHERE chat_id IN (SELECT id FROM single_chats);

    -- Delete those chats
    WITH single_chats AS (
        SELECT c.id
        FROM chats c
        WHERE c.type = 'direct'
          AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 0
    )
    DELETE FROM chats WHERE id IN (SELECT id FROM single_chats);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % chats with 1 participant and 0 messages', v_deleted;
    RAISE NOTICE '';
END $$;

-- ========================================
-- STEP 3: FIX CHATS WITH 3+ PARTICIPANTS
-- Keep only the first 2 participants
-- ========================================
DO $$
DECLARE
    v_fixed INTEGER := 0;
    v_chat RECORD;
    v_to_remove INTEGER[];
BEGIN
    RAISE NOTICE '=== FIXING CHATS WITH 3+ PARTICIPANTS ===';

    FOR v_chat IN
        SELECT c.id, ARRAY_AGG(cp.user_id ORDER BY cp.joined_at) as participants
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE c.type = 'direct'
        GROUP BY c.id
        HAVING COUNT(cp.user_id) > 2
    LOOP
        -- Remove all participants except first 2
        v_to_remove := v_chat.participants[3:array_length(v_chat.participants, 1)];

        DELETE FROM chat_participants
        WHERE chat_id = v_chat.id
          AND user_id = ANY(v_to_remove);

        RAISE NOTICE 'Chat %: Removed % extra participants', v_chat.id, array_length(v_to_remove, 1);
        v_fixed := v_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Fixed % chats with 3+ participants', v_fixed;
    RAISE NOTICE '';
END $$;

-- ========================================
-- STEP 4: MERGE DUPLICATE DIRECT CHATS
-- For each pair of users with multiple chats,
-- merge all messages into the chat with most messages
-- ========================================
DO $$
DECLARE
    v_pair RECORD;
    v_target_chat_id INTEGER;
    v_duplicate_ids INTEGER[];
    v_messages_moved INTEGER;
    v_total_pairs INTEGER := 0;
BEGIN
    RAISE NOTICE '=== MERGING DUPLICATE DIRECT CHATS ===';

    -- Find all user pairs that have multiple direct chats
    FOR v_pair IN
        WITH user_pairs AS (
            SELECT
                LEAST(cp1.user_id, cp2.user_id) as user1,
                GREATEST(cp1.user_id, cp2.user_id) as user2,
                ARRAY_AGG(DISTINCT c.id ORDER BY
                    (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) DESC,
                    c.created_at ASC
                ) as chat_ids,
                SUM((SELECT COUNT(*) FROM messages WHERE chat_id = c.id)) as total_messages
            FROM chats c
            JOIN chat_participants cp1 ON c.id = cp1.chat_id
            JOIN chat_participants cp2 ON c.id = cp2.chat_id
            WHERE c.type = 'direct'
              AND cp1.user_id < cp2.user_id
              AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2
            GROUP BY user1, user2
            HAVING COUNT(DISTINCT c.id) > 1
        )
        SELECT * FROM user_pairs
    LOOP
        v_total_pairs := v_total_pairs + 1;

        -- First chat in array has most messages (target)
        v_target_chat_id := v_pair.chat_ids[1];
        v_duplicate_ids := v_pair.chat_ids[2:array_length(v_pair.chat_ids, 1)];

        -- Move messages from duplicates to target
        UPDATE messages
        SET chat_id = v_target_chat_id
        WHERE chat_id = ANY(v_duplicate_ids);

        GET DIAGNOSTICS v_messages_moved = ROW_COUNT;

        -- Update target chat timestamp
        UPDATE chats
        SET updated_at = (SELECT MAX(created_at) FROM messages WHERE chat_id = v_target_chat_id)
        WHERE id = v_target_chat_id;

        -- Delete participants from duplicate chats
        DELETE FROM chat_participants
        WHERE chat_id = ANY(v_duplicate_ids);

        -- Delete duplicate chats
        DELETE FROM chats
        WHERE id = ANY(v_duplicate_ids);

        RAISE NOTICE 'Users % ↔ %: Merged % chats (%→%), moved % messages',
            v_pair.user1, v_pair.user2,
            array_length(v_pair.chat_ids, 1),
            v_duplicate_ids, v_target_chat_id,
            v_messages_moved;
    END LOOP;

    RAISE NOTICE 'Total user pairs with duplicates: %', v_total_pairs;
    RAISE NOTICE '';
END $$;

-- ========================================
-- STEP 5: FINAL VERIFICATION
-- ========================================
DO $$
DECLARE
    v_total_direct_chats INTEGER;
    v_chats_with_2_participants INTEGER;
    v_broken_chats INTEGER;
    v_total_messages INTEGER;
    v_messages_lost INTEGER;
BEGIN
    RAISE NOTICE '=== FINAL STATE ===';

    SELECT COUNT(*) INTO v_total_direct_chats
    FROM chats WHERE type = 'direct';

    SELECT COUNT(*) INTO v_chats_with_2_participants
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) = 2;

    SELECT COUNT(*) INTO v_broken_chats
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2;

    SELECT COUNT(*) INTO v_total_messages
    FROM messages m
    JOIN chats c ON m.chat_id = c.id
    WHERE c.type = 'direct';

    -- Check for orphaned messages (should be 0)
    SELECT COUNT(*) INTO v_messages_lost
    FROM messages m
    WHERE NOT EXISTS (SELECT 1 FROM chats WHERE id = m.chat_id);

    RAISE NOTICE 'Total direct chats: %', v_total_direct_chats;
    RAISE NOTICE 'Chats with 2 participants: %', v_chats_with_2_participants;
    RAISE NOTICE 'Broken chats (not 2 participants): %', v_broken_chats;
    RAISE NOTICE 'Total messages preserved: %', v_total_messages;
    RAISE NOTICE 'Messages lost (orphaned): %', v_messages_lost;

    IF v_messages_lost > 0 THEN
        RAISE EXCEPTION 'CRITICAL: % messages were orphaned! Rolling back.', v_messages_lost;
    END IF;

    IF v_broken_chats > 0 THEN
        RAISE WARNING 'Warning: % chats still have wrong participant count', v_broken_chats;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE 'All messages have been preserved.';
END $$;

COMMIT;
