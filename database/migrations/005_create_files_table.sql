-- ================================================
-- МИГРАЦИЯ: Создание таблицы для хранения файлов
-- ================================================

CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    path TEXT NOT NULL,
    thumbnail_path TEXT,
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    file_type VARCHAR(50),
    width INTEGER,
    height INTEGER,
    scan_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

-- Добавляем колонку file_id в таблицу messages если её нет
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_id INTEGER REFERENCES files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_file_id ON messages(file_id);

-- Комментарии
COMMENT ON TABLE files IS 'Хранилище загруженных файлов';
COMMENT ON COLUMN files.scan_status IS 'Статус проверки на вирусы: pending, clean, infected';
COMMENT ON COLUMN files.file_type IS 'Тип файла: image, document, video, audio, other';
