-- Adds tables and columns required for rich message attachments.

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
    file_type VARCHAR(50) DEFAULT 'other',
    scan_status VARCHAR(20) DEFAULT 'pending',
    scan_result TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE files ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(500);
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by INTEGER;
ALTER TABLE files ADD COLUMN IF NOT EXISTS message_id INTEGER;
ALTER TABLE files ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT 'other';
ALTER TABLE files ALTER COLUMN file_type SET DEFAULT 'other';
ALTER TABLE files ADD COLUMN IF NOT EXISTS scan_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE files ALTER COLUMN scan_status SET DEFAULT 'pending';
ALTER TABLE files ADD COLUMN IF NOT EXISTS scan_result TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE files ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE files ADD COLUMN IF NOT EXISTS duration INTEGER;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_id INTEGER;
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_scan_status ON files(scan_status);
CREATE INDEX IF NOT EXISTS idx_messages_file_id ON messages(file_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_messages_forwarded ON messages(forwarded_from_id);

CREATE TABLE IF NOT EXISTS reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE TABLE IF NOT EXISTS mentions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_message ON mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'files'::regclass AND conname = 'files_message_id_fkey'
    ) THEN
        ALTER TABLE files
            ADD CONSTRAINT files_message_id_fkey
            FOREIGN KEY (message_id)
            REFERENCES messages(id)
            ON DELETE CASCADE;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'files'::regclass AND conname = 'files_uploaded_by_fkey'
    ) THEN
        ALTER TABLE files
            ADD CONSTRAINT files_uploaded_by_fkey
            FOREIGN KEY (uploaded_by)
            REFERENCES users(id)
            ON DELETE CASCADE;
    END IF;
END$$;

ALTER TABLE files ALTER COLUMN uploaded_by SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'messages'::regclass AND conname = 'messages_file_id_fkey'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT messages_file_id_fkey
            FOREIGN KEY (file_id)
            REFERENCES files(id)
            ON DELETE SET NULL;
    END IF;
END$$;
