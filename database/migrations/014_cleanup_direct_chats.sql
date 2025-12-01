-- ================================================
-- MIGRATION: Clean up invalid direct chats and merge duplicates
-- ================================================

-- Step 1: downgrade invalid direct chats that do not have exactly two participants
UPDATE chats c
SET type = 'group'
WHERE c.type = 'direct'
  AND (
    SELECT COUNT(*) FROM chat_participants cp WHERE cp.chat_id = c.id
  ) <> 2;

-- Step 2: merge duplicate direct chats for the same pair of users
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    WITH direct_pairs AS (
      SELECT
        c.id,
        MIN(cp.user_id) AS user_a,
        MAX(cp.user_id) AS user_b,
        c.updated_at
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.type = 'direct'
      GROUP BY c.id, c.updated_at
      HAVING COUNT(*) = 2
    ),
    numbered AS (
      SELECT
        dp.*,
        ROW_NUMBER() OVER (PARTITION BY user_a, user_b ORDER BY dp.updated_at DESC, dp.id ASC) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY user_a, user_b ORDER BY dp.updated_at DESC, dp.id ASC) AS canonical_id
      FROM direct_pairs dp
    )
    SELECT id AS dup_id, canonical_id
    FROM numbered
    WHERE rn > 1
  LOOP
    -- Move messages to the canonical chat
    UPDATE messages SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;

    -- Keep deletion history and pinned records attached to the canonical chat
    UPDATE message_deletion_history SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;
    UPDATE pinned_messages SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;

    -- Reattach calls to the canonical chat
    UPDATE calls SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;

    -- Merge participants, keeping the earliest join time and latest read time
    INSERT INTO chat_participants (chat_id, user_id, joined_at, last_read_at)
    SELECT rec.canonical_id, user_id, joined_at, last_read_at
    FROM chat_participants
    WHERE chat_id = rec.dup_id
    ON CONFLICT (chat_id, user_id) DO UPDATE
      SET joined_at = LEAST(chat_participants.joined_at, EXCLUDED.joined_at),
          last_read_at = GREATEST(chat_participants.last_read_at, EXCLUDED.last_read_at);

    -- Preserve the most recent update timestamp
    UPDATE chats
    SET updated_at = GREATEST(
      chats.updated_at,
      (SELECT updated_at FROM chats WHERE id = rec.dup_id)
    )
    WHERE chats.id = rec.canonical_id;

    -- Remove the duplicate chat (dependent rows are already moved or will cascade)
    DELETE FROM chats WHERE id = rec.dup_id;
  END LOOP;
END $$;
