-- ================================================
-- МИГРАЦИЯ: Добавление metadata для системных сообщений
-- Добавляет поле metadata (JSONB) для хранения доп. информации
-- Используется для системных сообщений о звонках, опросах и т.д.
-- ================================================

-- Добавить поле metadata в таблицу messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Создать индекс для быстрого поиска по типу сообщения
CREATE INDEX IF NOT EXISTS idx_messages_metadata_type ON messages ((metadata->>'type'));

-- Примеры использования:
-- Системное сообщение о звонке:
-- metadata: {"type": "call", "call_id": 123, "call_type": "video", "duration": 300, "status": "ended"}
-- Опрос:
-- metadata: {"type": "poll", "question": "...", "options": [...], "votes": {...}}
-- Системное уведомление:
-- metadata: {"type": "system", "event": "user_joined", "user_id": 5}
