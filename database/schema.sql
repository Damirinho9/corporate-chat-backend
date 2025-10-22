-- Corporate Chat Database Schema

-- Drop tables if exists (for clean setup)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS chat_participants CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS chat_type CASCADE;

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'head', 'employee');
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
        (role = 'admin' AND department IS NULL) OR
        (role IN ('head', 'employee') AND department IS NOT NULL)
    )
);

-- Chats table
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    type chat_type NOT NULL,
    department VARCHAR(50),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- For encrypted messages (future)
    is_encrypted BOOLEAN DEFAULT false
);

-- Indexes for performance optimization
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_chats_type ON chats(type);
CREATE INDEX idx_chats_department ON chats(department);

CREATE INDEX idx_chat_participants_chat ON chat_participants(chat_id);
CREATE INDEX idx_chat_participants_user ON chat_participants(user_id);
CREATE INDEX idx_chat_participants_composite ON chat_participants(chat_id, user_id);

CREATE INDEX idx_messages_chat ON messages(chat_id);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_composite ON messages(chat_id, created_at DESC);

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

-- Insert demo users (passwords will be hashed by application)
-- Password for all: 'pass123' (will be hashed)
INSERT INTO users (username, password_hash, name, role, department) VALUES
    ('admin', '$2b$12$placeholder_will_be_replaced_by_app', 'Главный администратор', 'admin', NULL),
    ('head_it', '$2b$12$placeholder_will_be_replaced_by_app', 'Руководитель IT', 'head', 'IT'),
    ('head_hr', '$2b$12$placeholder_will_be_replaced_by_app', 'Руководитель HR', 'head', 'HR'),
    ('dev1', '$2b$12$placeholder_will_be_replaced_by_app', 'Разработчик Иван', 'employee', 'IT'),
    ('dev2', '$2b$12$placeholder_will_be_replaced_by_app', 'Разработчик Мария', 'employee', 'IT'),
    ('hr1', '$2b$12$placeholder_will_be_replaced_by_app', 'HR-менеджер Анна', 'employee', 'HR');

-- Insert chats
INSERT INTO chats (name, type, department, created_by) VALUES
    ('Руководство', 'group', NULL, 1),
    ('Руководители', 'group', NULL, 1),
    ('IT отдел', 'department', 'IT', 2),
    ('HR отдел', 'department', 'HR', 3);

-- Add participants to chats
-- Management chat (only admins)
INSERT INTO chat_participants (chat_id, user_id) VALUES (1, 1);

-- All heads chat (admins + heads)
INSERT INTO chat_participants (chat_id, user_id) VALUES 
    (2, 1), (2, 2), (2, 3);

-- IT department chat
INSERT INTO chat_participants (chat_id, user_id) VALUES 
    (3, 2), (3, 4), (3, 5);

-- HR department chat
INSERT INTO chat_participants (chat_id, user_id) VALUES 
    (4, 3), (4, 6);

-- Create direct message chats based on permissions
-- Admins can message everyone, heads can message each other and their employees

-- Function to check if direct message is allowed
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
    
    -- Admins can message everyone
    IF sender_role = 'admin' OR receiver_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Heads can message each other
    IF sender_role = 'head' AND receiver_role = 'head' THEN
        RETURN TRUE;
    END IF;
    
    -- Heads can message their department employees
    IF sender_role = 'head' AND receiver_role = 'employee' 
       AND sender_dept = receiver_dept THEN
        RETURN TRUE;
    END IF;
    
    IF receiver_role = 'head' AND sender_role = 'employee' 
       AND receiver_dept = sender_dept THEN
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
WHERE u.is_active = true;

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores all user information including credentials and roles';
COMMENT ON TABLE chats IS 'Stores chat rooms and channels';
COMMENT ON TABLE chat_participants IS 'Many-to-many relationship between users and chats';
COMMENT ON TABLE messages IS 'Stores all messages with support for editing and deletion';
COMMENT ON FUNCTION can_send_direct_message IS 'Checks if a user can send direct messages to another user based on hierarchy';
