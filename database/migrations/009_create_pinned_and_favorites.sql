-- Migration: Create pinned messages and favorites tables
-- Created: 2025-11-07

-- Table for pinned messages
CREATE TABLE IF NOT EXISTS pinned_messages (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    pinned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id)
);

CREATE INDEX idx_pinned_messages_chat ON pinned_messages(chat_id);
CREATE INDEX idx_pinned_messages_message ON pinned_messages(message_id);

-- Table for favorite messages
CREATE TABLE IF NOT EXISTS favorite_messages (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE INDEX idx_favorite_messages_user ON favorite_messages(user_id);
CREATE INDEX idx_favorite_messages_message ON favorite_messages(message_id);

-- Add default permissions for new message actions
INSERT INTO role_general_permissions (role, permission, can_perform, updated_at) VALUES
    -- Copy message (everyone can copy)
    ('admin', 'copy_message', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'copy_message', TRUE, CURRENT_TIMESTAMP),
    ('rop', 'copy_message', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'copy_message', TRUE, CURRENT_TIMESTAMP),
    ('employee', 'copy_message', TRUE, CURRENT_TIMESTAMP),

    -- Forward message (everyone can forward)
    ('admin', 'forward_message', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'forward_message', TRUE, CURRENT_TIMESTAMP),
    ('rop', 'forward_message', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'forward_message', TRUE, CURRENT_TIMESTAMP),
    ('employee', 'forward_message', TRUE, CURRENT_TIMESTAMP),

    -- Reply to message (everyone can reply)
    ('admin', 'reply_to_message', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'reply_to_message', TRUE, CURRENT_TIMESTAMP),
    ('rop', 'reply_to_message', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'reply_to_message', TRUE, CURRENT_TIMESTAMP),
    ('employee', 'reply_to_message', TRUE, CURRENT_TIMESTAMP),

    -- React to message (everyone can react)
    ('admin', 'react_to_message', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'react_to_message', TRUE, CURRENT_TIMESTAMP),
    ('rop', 'react_to_message', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'react_to_message', TRUE, CURRENT_TIMESTAMP),
    ('employee', 'react_to_message', TRUE, CURRENT_TIMESTAMP),

    -- Pin message (admin and rop only)
    ('admin', 'pin_message', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'pin_message', FALSE, CURRENT_TIMESTAMP),
    ('rop', 'pin_message', FALSE, CURRENT_TIMESTAMP),
    ('operator', 'pin_message', FALSE, CURRENT_TIMESTAMP),
    ('employee', 'pin_message', FALSE, CURRENT_TIMESTAMP),

    -- Pin in department (ROP only)
    ('admin', 'pin_department_message', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'pin_department_message', FALSE, CURRENT_TIMESTAMP),
    ('rop', 'pin_department_message', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'pin_department_message', FALSE, CURRENT_TIMESTAMP),
    ('employee', 'pin_department_message', FALSE, CURRENT_TIMESTAMP),

    -- Add to favorites (everyone can favorite)
    ('admin', 'add_to_favorites', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'add_to_favorites', TRUE, CURRENT_TIMESTAMP),
    ('rop', 'add_to_favorites', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'add_to_favorites', TRUE, CURRENT_TIMESTAMP),
    ('employee', 'add_to_favorites', TRUE, CURRENT_TIMESTAMP),

    -- Write to user (depends on messaging permissions, but allow by default)
    ('admin', 'write_to_user', TRUE, CURRENT_TIMESTAMP),
    ('assistant', 'write_to_user', TRUE, CURRENT_TIMESTAMP),
    ('rop', 'write_to_user', TRUE, CURRENT_TIMESTAMP),
    ('operator', 'write_to_user', TRUE, CURRENT_TIMESTAMP),
    ('employee', 'write_to_user', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (role, permission) DO NOTHING;
