-- Migration: Add database-level validation for direct chats
-- Author: Claude
-- Date: 2025-12-26
-- Purpose: Prevent direct chats from having != 2 participants at database level

-- This migration adds a trigger that enforces:
-- 1. Direct chats must have exactly 2 participants
-- 2. Cannot add more than 2 participants to a direct chat
-- 3. Cannot remove participants if it would leave < 2

BEGIN;

-- ============================================
-- FUNCTION: Validate direct chat participants
-- ============================================
CREATE OR REPLACE FUNCTION validate_direct_chat_participants()
RETURNS TRIGGER AS $$
DECLARE
    v_chat_type TEXT;
    v_participant_count INTEGER;
BEGIN
    -- Get chat type
    SELECT type INTO v_chat_type
    FROM chats
    WHERE id = COALESCE(NEW.chat_id, OLD.chat_id);

    -- Only validate for direct chats
    IF v_chat_type != 'direct' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Count participants after this operation
    IF TG_OP = 'DELETE' THEN
        SELECT COUNT(*) - 1 INTO v_participant_count
        FROM chat_participants
        WHERE chat_id = OLD.chat_id;

        -- Prevent removing if it would leave < 2 participants
        IF v_participant_count < 2 THEN
            RAISE EXCEPTION 'Cannot remove participant: direct chats must have exactly 2 participants (would have %)', v_participant_count
                USING ERRCODE = '23514',
                      HINT = 'Delete the entire chat instead of removing participants';
        END IF;

        RETURN OLD;
    END IF;

    -- For INSERT/UPDATE
    SELECT COUNT(*) INTO v_participant_count
    FROM chat_participants
    WHERE chat_id = NEW.chat_id;

    -- Prevent adding if it would exceed 2 participants
    IF v_participant_count > 2 THEN
        RAISE EXCEPTION 'Cannot add participant: direct chats must have exactly 2 participants (would have %)', v_participant_count
            USING ERRCODE = '23514',
                  HINT = 'Use group chats for more than 2 participants';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Enforce direct chat validation
-- ============================================
DROP TRIGGER IF EXISTS enforce_direct_chat_participants ON chat_participants;

CREATE TRIGGER enforce_direct_chat_participants
    AFTER INSERT OR DELETE ON chat_participants
    FOR EACH ROW
    EXECUTE FUNCTION validate_direct_chat_participants();

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
    v_broken_chats INTEGER;
BEGIN
    -- Check for existing violations
    SELECT COUNT(*) INTO v_broken_chats
    FROM chats c
    WHERE c.type = 'direct'
      AND (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) != 2;

    IF v_broken_chats > 0 THEN
        RAISE WARNING '⚠️  Found % direct chats with != 2 participants', v_broken_chats;
        RAISE WARNING 'Run cleanup_all_direct_chats.sql migration first!';
    ELSE
        RAISE NOTICE '✅ All direct chats have exactly 2 participants';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Database validation installed successfully!';
    RAISE NOTICE 'Direct chats are now protected from incorrect participant counts.';
END $$;

COMMIT;
