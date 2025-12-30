-- Migration: Fix direct chat validation trigger to allow UPSERT updates
-- Date: 2025-12-29
-- Problem: Trigger blocks markAsRead UPSERT (ON CONFLICT DO UPDATE)
-- Solution: Use BEFORE trigger and exclude current participant from count

BEGIN;

-- Drop old trigger
DROP TRIGGER IF EXISTS enforce_direct_chat_participants ON chat_participants;

-- ============================================
-- FIXED FUNCTION: Validate direct chat participants
-- ============================================
CREATE OR REPLACE FUNCTION validate_direct_chat_participants()
RETURNS TRIGGER AS $$
DECLARE
    v_chat_type TEXT;
    v_participant_count INTEGER;
    v_participant_exists BOOLEAN;
BEGIN
    -- Get chat type
    SELECT type INTO v_chat_type
    FROM chats
    WHERE id = COALESCE(NEW.chat_id, OLD.chat_id);

    -- Only validate for direct chats
    IF v_chat_type != 'direct' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        SELECT COUNT(*) INTO v_participant_count
        FROM chat_participants
        WHERE chat_id = OLD.chat_id;

        -- Check if removing would leave < 2 participants
        -- Current count includes the one being deleted, so check if count <= 2
        IF v_participant_count <= 2 THEN
            RAISE EXCEPTION 'Cannot remove participant: direct chats must have exactly 2 participants (would have %)', v_participant_count - 1
                USING ERRCODE = '23514',
                      HINT = 'Delete the entire chat instead of removing participants';
        END IF;

        RETURN OLD;
    END IF;

    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        -- Check if participant already exists (UPSERT will UPDATE instead of INSERT)
        SELECT EXISTS(
            SELECT 1 FROM chat_participants
            WHERE chat_id = NEW.chat_id
            AND user_id = NEW.user_id
        ) INTO v_participant_exists;

        -- If participant exists, this is UPSERT doing UPDATE - allow it
        IF v_participant_exists THEN
            RETURN NEW;
        END IF;

        -- This is a real INSERT, count existing participants
        SELECT COUNT(*) INTO v_participant_count
        FROM chat_participants
        WHERE chat_id = NEW.chat_id;

        -- Prevent adding 3rd participant
        IF v_participant_count >= 2 THEN
            RAISE EXCEPTION 'Cannot add participant: direct chats must have exactly 2 participants (would have %)', v_participant_count + 1
                USING ERRCODE = '23514',
                      HINT = 'Use group chats for more than 2 participants';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RECREATE TRIGGER with BEFORE (was AFTER)
-- ============================================
CREATE TRIGGER enforce_direct_chat_participants
    BEFORE INSERT OR DELETE ON chat_participants
    FOR EACH ROW
    EXECUTE FUNCTION validate_direct_chat_participants();

RAISE NOTICE '✅ Trigger fixed: UPSERT updates now allowed for markAsRead';

COMMIT;
