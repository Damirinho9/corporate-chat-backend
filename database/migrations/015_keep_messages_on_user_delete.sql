-- ================================================
-- МИГРАЦИЯ: Сохранение сообщений при удалении пользователя
-- Проблема: При удалении пользователя удаляются все его сообщения (CASCADE)
-- Решение: Изменить constraint на SET NULL, чтобы сообщения оставались
-- ================================================

-- Step 1: Make user_id nullable
ALTER TABLE messages ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Drop existing foreign key constraint
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_user_id_fkey;

-- Step 3: Add new foreign key constraint with ON DELETE SET NULL
ALTER TABLE messages
ADD CONSTRAINT messages_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE SET NULL;

-- Step 4: Also fix reactions table (should keep reactions but nullify user_id)
ALTER TABLE reactions
DROP CONSTRAINT IF EXISTS reactions_user_id_fkey;

ALTER TABLE reactions
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE reactions
ADD CONSTRAINT reactions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE SET NULL;

-- Step 5: Also fix mentions table (should keep mentions but nullify user_id)
ALTER TABLE mentions
DROP CONSTRAINT IF EXISTS mentions_user_id_fkey;

ALTER TABLE mentions
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE mentions
ADD CONSTRAINT mentions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE SET NULL;

-- Verify the migration
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed:';
    RAISE NOTICE '   - messages.user_id: nullable, ON DELETE SET NULL';
    RAISE NOTICE '   - reactions.user_id: nullable, ON DELETE SET NULL';
    RAISE NOTICE '   - mentions.user_id: nullable, ON DELETE SET NULL';
    RAISE NOTICE '   - Messages will be preserved when user is deleted';
END $$;
