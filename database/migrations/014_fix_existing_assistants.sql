-- ================================================
-- МИГРАЦИЯ: Исправление существующих ассистентов
-- Устанавливает department='Ассистенты' для всех ассистентов
-- и добавляет их в чат отдела "Ассистенты"
-- ================================================

-- Step 1: Update existing assistants to set department='Ассистенты'
UPDATE users
SET department = 'Ассистенты'
WHERE role = 'assistant' AND (department IS NULL OR department != 'Ассистенты');

-- Step 2: Create "Ассистенты" department chat if it doesn't exist
INSERT INTO chats (name, type, department, created_by, created_at)
SELECT
    'Ассистенты',
    'department',
    'Ассистенты',
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1), -- created by first admin
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM chats
    WHERE type = 'department'
    AND (department = 'Ассистенты' OR name = 'Ассистенты')
);

-- Step 3: Add all assistants to "Ассистенты" department chat
INSERT INTO chat_participants (chat_id, user_id, joined_at)
SELECT
    c.id,
    u.id,
    CURRENT_TIMESTAMP
FROM users u
CROSS JOIN chats c
WHERE u.role = 'assistant'
  AND c.type = 'department'
  AND (c.department = 'Ассистенты' OR c.name = 'Ассистенты')
  AND NOT EXISTS (
      SELECT 1 FROM chat_participants cp
      WHERE cp.chat_id = c.id AND cp.user_id = u.id
  );

-- Step 4: Remove assistants from "Все ассистенты" chat if it exists (old group chat)
DELETE FROM chat_participants
WHERE user_id IN (SELECT id FROM users WHERE role = 'assistant')
  AND chat_id IN (
      SELECT id FROM chats
      WHERE name = 'Все ассистенты'
      AND type != 'department'
  );

-- Verify the migration
DO $$
DECLARE
    assistant_count INTEGER;
    dept_chat_count INTEGER;
    participant_count INTEGER;
BEGIN
    -- Count assistants with department set
    SELECT COUNT(*) INTO assistant_count
    FROM users
    WHERE role = 'assistant' AND department = 'Ассистенты';

    -- Count Ассистенты department chats
    SELECT COUNT(*) INTO dept_chat_count
    FROM chats
    WHERE type = 'department' AND (department = 'Ассистенты' OR name = 'Ассистенты');

    -- Count assistants in the department chat
    SELECT COUNT(*) INTO participant_count
    FROM chat_participants cp
    JOIN chats c ON cp.chat_id = c.id
    JOIN users u ON cp.user_id = u.id
    WHERE u.role = 'assistant'
      AND c.type = 'department'
      AND (c.department = 'Ассистенты' OR c.name = 'Ассистенты');

    RAISE NOTICE '✅ Migration completed:';
    RAISE NOTICE '   - Assistants with department set: %', assistant_count;
    RAISE NOTICE '   - Ассистенты department chats: %', dept_chat_count;
    RAISE NOTICE '   - Assistants in department chat: %', participant_count;
END $$;
