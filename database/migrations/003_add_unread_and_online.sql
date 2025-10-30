-- Миграция для счетчика непрочитанных и статуса онлайн

-- 1. Добавляем поле last_read_message_id для отслеживания непрочитанных
ALTER TABLE chat_participants ADD COLUMN last_read_message_id INTEGER DEFAULT 0;

-- 2. Добавляем поле last_seen для статуса онлайн
ALTER TABLE users ADD COLUMN last_seen DATETIME DEFAULT NULL;

-- 3. Обновляем last_seen для всех активных пользователей
UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE is_active = 1;
