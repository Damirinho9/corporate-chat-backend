-- ================================================
-- ОБНОВЛЁННАЯ СХЕМА БД С НОВЫМИ РОЛЯМИ
-- ================================================

-- Drop tables if exists (for clean setup)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS chat_participants CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS chat_type CASCADE;

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'assistant', 'rop', 'operator', 'employee');
CREATE TYPE chat_type AS ENUM ('direct', 'group', 'department');

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    department VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    CONSTRAINT check_department CHECK (
        (role IN ('admin', 'assistant') AND department IS NULL) OR
        (role IN ('rop', 'operator', 'employee') AND department IS NOT NULL)
    )
);

-- Chats table
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    type chat_type NOT NULL,
    department VARCHAR(50),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- For direct chats, name can be null
    CONSTRAINT check_chat_name CHECK (
        (type = 'direct' AND name IS NULL) OR
        (type IN ('group', 'department') AND name IS NOT NULL)
    )
);

-- Chat participants (many-to-many relationship)
CREATE TABLE chat_participants (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,
    
    UNIQUE(chat_id, user_id)
);

-- Messages table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    file_id INTEGER,
    reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    forwarded_from_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- For encrypted messages (future)
    is_encrypted BOOLEAN DEFAULT false
);

CREATE TABLE files (
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

-- Admin logs table
CREATE TABLE admin_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_chats_type ON chats(type);
CREATE INDEX idx_chats_department ON chats(department);
CREATE INDEX idx_chats_archived ON chats(is_archived);

CREATE INDEX idx_chat_participants_chat ON chat_participants(chat_id);
CREATE INDEX idx_chat_participants_user ON chat_participants(user_id);
CREATE INDEX idx_chat_participants_composite ON chat_participants(chat_id, user_id);

CREATE INDEX idx_messages_chat ON messages(chat_id);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_composite ON messages(chat_id, created_at DESC);
CREATE INDEX idx_messages_pinned ON messages(is_pinned);
CREATE INDEX idx_messages_file_id ON messages(file_id);
CREATE INDEX idx_messages_reply ON messages(reply_to_id);
CREATE INDEX idx_messages_forwarded ON messages(forwarded_from_id);

CREATE INDEX idx_admin_logs_user ON admin_logs(user_id);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);

CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_message_id ON files(message_id);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_files_file_type ON files(file_type);
CREATE INDEX idx_files_scan_status ON files(scan_status);

CREATE TABLE reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE TABLE mentions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE INDEX idx_reactions_message ON reactions(message_id);
CREATE INDEX idx_reactions_user ON reactions(user_id);
CREATE INDEX idx_mentions_message ON mentions(message_id);
CREATE INDEX idx_mentions_user ON mentions(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ФУНКЦИЯ ПРОВЕРКИ ПРАВ НА ЛИЧНЫЕ СООБЩЕНИЯ
-- ================================================
CREATE OR REPLACE FUNCTION can_send_direct_message(
    sender_id INTEGER,
    receiver_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    sender_role user_role;
    sender_dept VARCHAR(50);
    receiver_role user_role;
    receiver_dept VARCHAR(50);
BEGIN
    SELECT role, department INTO sender_role, sender_dept
    FROM users WHERE id = sender_id;
    
    SELECT role, department INTO receiver_role, receiver_dept
    FROM users WHERE id = receiver_id;
    
    -- ===== АДМИНИСТРАТОРЫ =====
    -- Админы могут писать всем
    IF sender_role = 'admin' OR receiver_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- ===== АССИСТЕНТЫ =====
    -- Ассистенты могут писать всем
    IF sender_role = 'assistant' OR receiver_role = 'assistant' THEN
        RETURN TRUE;
    END IF;
    
    -- ===== РОПы =====
    -- РОПы могут писать всем
    IF sender_role = 'rop' OR receiver_role = 'rop' THEN
        RETURN TRUE;
    END IF;
    
    -- ===== ОПЕРАТОРЫ =====
    -- Операторы НЕ могут писать друг другу
    IF sender_role = 'operator' AND receiver_role = 'operator' THEN
        RETURN FALSE;
    END IF;
    
    -- Операторы могут писать своему РОПу
    IF sender_role = 'operator' AND receiver_role = 'rop' 
       AND sender_dept = receiver_dept THEN
        RETURN TRUE;
    END IF;
    
    -- РОП может писать своим операторам
    IF sender_role = 'rop' AND receiver_role = 'operator' 
       AND sender_dept = receiver_dept THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- View for getting user's accessible chats
CREATE OR REPLACE VIEW user_chats AS
SELECT 
    u.id as user_id,
    c.id as chat_id,
    c.name as chat_name,
    c.type as chat_type,
    c.department,
    cp.last_read_at,
    c.updated_at,
    (SELECT COUNT(*) FROM messages m 
     WHERE m.chat_id = c.id 
     AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
FROM users u
JOIN chat_participants cp ON u.id = cp.user_id
JOIN chats c ON cp.chat_id = c.id
WHERE u.is_active = true AND c.is_archived = false;

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores all user information including credentials and roles';
COMMENT ON TABLE chats IS 'Stores chat rooms and channels';
COMMENT ON TABLE chat_participants IS 'Many-to-many relationship between users and chats';
COMMENT ON TABLE messages IS 'Stores all messages with support for editing and deletion';
COMMENT ON TABLE admin_logs IS 'Logs all admin actions for audit trail';
COMMENT ON FUNCTION can_send_direct_message IS 'Checks if a user can send direct messages to another user based on hierarchy';