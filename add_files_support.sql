-- ================================================
-- ИНСТРУКЦИЯ: Применить миграцию
-- psql -U postgres -d corporate_chat -f add_files_support.sql
-- ================================================

CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    path VARCHAR(500) NOT NULL,
    thumbnail_path VARCHAR(500),
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    file_type VARCHAR(50) NOT NULL,
    scan_status VARCHAR(20) DEFAULT 'pending',
    scan_result TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_file_type CHECK (file_type IN ('image', 'document', 'video', 'audio', 'other')),
    CONSTRAINT check_scan_status CHECK (scan_status IN ('pending', 'clean', 'infected', 'error'))
);

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS file_id INTEGER REFERENCES files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_scan_status ON files(scan_status);
CREATE INDEX IF NOT EXISTS idx_messages_file_id ON messages(file_id);
