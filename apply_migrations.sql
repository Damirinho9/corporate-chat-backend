-- Добавляем last_read_message_id для счетчика непрочитанных
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS last_read_message_id INTEGER DEFAULT 0;

-- Добавляем last_seen для статуса онлайн (проверяем есть ли уже)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='last_seen') THEN
        ALTER TABLE users ADD COLUMN last_seen TIMESTAMP DEFAULT NULL;
    END IF;
END $$;

-- Обновляем last_seen для всех активных пользователей
UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE is_active = true;
