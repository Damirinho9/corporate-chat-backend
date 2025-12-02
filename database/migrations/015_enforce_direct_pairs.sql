-- Ensure direct chats have exactly two distinct participants and merge duplicates per pair

-- Reclassify any direct chat that does not have exactly two distinct participants
UPDATE chats c
SET type = 'group'
WHERE c.type = 'direct'
  AND (
    SELECT COUNT(DISTINCT cp.user_id) FROM chat_participants cp WHERE cp.chat_id = c.id
  ) <> 2;

-- Merge duplicate direct chats for the same unordered pair of users
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    WITH direct_pairs AS (
      SELECT
        c.id,
        LEAST(MIN(cp.user_id), MAX(cp.user_id)) AS user_a,
        GREATEST(MIN(cp.user_id), MAX(cp.user_id)) AS user_b,
        c.updated_at
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.type = 'direct'
      GROUP BY c.id, c.updated_at
      HAVING COUNT(DISTINCT cp.user_id) = 2
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
    UPDATE messages SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;
    UPDATE message_deletion_history SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;
    UPDATE pinned_messages SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;
    UPDATE calls SET chat_id = rec.canonical_id WHERE chat_id = rec.dup_id;

    INSERT INTO chat_participants (chat_id, user_id, joined_at, last_read_at)
    SELECT rec.canonical_id, user_id, joined_at, last_read_at
    FROM chat_participants
    WHERE chat_id = rec.dup_id
    ON CONFLICT (chat_id, user_id) DO UPDATE
      SET joined_at = LEAST(chat_participants.joined_at, EXCLUDED.joined_at),
          last_read_at = GREATEST(chat_participants.last_read_at, EXCLUDED.last_read_at);

    UPDATE chats
    SET updated_at = GREATEST(
      chats.updated_at,
      (SELECT updated_at FROM chats WHERE id = rec.dup_id)
    )
    WHERE chats.id = rec.canonical_id;

    DELETE FROM chats WHERE id = rec.dup_id;
  END LOOP;
END $$;
