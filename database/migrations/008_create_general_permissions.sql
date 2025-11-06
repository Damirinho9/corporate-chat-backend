-- Migration 008: Create general permissions system
-- This table stores general permissions for each role (not just messaging permissions)

CREATE TABLE IF NOT EXISTS role_general_permissions (
    id SERIAL PRIMARY KEY,
    role VARCHAR(20) NOT NULL,
    permission VARCHAR(50) NOT NULL,
    can_perform BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role, permission)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_role_general_permissions_lookup
ON role_general_permissions(role, permission);

-- Insert default permissions
-- Permission categories:
-- Users: create_user, edit_user, delete_user, reset_password, view_all_users
-- Departments: create_department, edit_department, delete_department, manage_department_members
-- Chats: create_chat, edit_chat, delete_chat, manage_chat_participants
-- Messages: edit_messages, delete_messages, view_all_messages
-- Files: upload_files, delete_any_file, view_all_files
-- Logs: view_logs, view_admin_logs
-- Permissions: manage_permissions
-- System: access_admin_panel, manage_settings

INSERT INTO role_general_permissions (role, permission, can_perform) VALUES
-- Admin permissions (full access)
('admin', 'create_user', TRUE),
('admin', 'edit_user', TRUE),
('admin', 'delete_user', TRUE),
('admin', 'reset_password', TRUE),
('admin', 'view_all_users', TRUE),
('admin', 'create_department', TRUE),
('admin', 'edit_department', TRUE),
('admin', 'delete_department', TRUE),
('admin', 'manage_department_members', TRUE),
('admin', 'create_chat', TRUE),
('admin', 'edit_chat', TRUE),
('admin', 'delete_chat', TRUE),
('admin', 'manage_chat_participants', TRUE),
('admin', 'edit_messages', TRUE),
('admin', 'delete_messages', TRUE),
('admin', 'view_all_messages', TRUE),
('admin', 'upload_files', TRUE),
('admin', 'delete_any_file', TRUE),
('admin', 'view_all_files', TRUE),
('admin', 'view_logs', TRUE),
('admin', 'view_admin_logs', TRUE),
('admin', 'manage_permissions', TRUE),
('admin', 'access_admin_panel', TRUE),
('admin', 'manage_settings', TRUE),

-- Assistant permissions (high access, but not full)
('assistant', 'create_user', TRUE),
('assistant', 'edit_user', TRUE),
('assistant', 'delete_user', FALSE),
('assistant', 'reset_password', TRUE),
('assistant', 'view_all_users', TRUE),
('assistant', 'create_department', TRUE),
('assistant', 'edit_department', TRUE),
('assistant', 'delete_department', FALSE),
('assistant', 'manage_department_members', TRUE),
('assistant', 'create_chat', TRUE),
('assistant', 'edit_chat', TRUE),
('assistant', 'delete_chat', FALSE),
('assistant', 'manage_chat_participants', TRUE),
('assistant', 'edit_messages', FALSE),
('assistant', 'delete_messages', FALSE),
('assistant', 'view_all_messages', TRUE),
('assistant', 'upload_files', TRUE),
('assistant', 'delete_any_file', FALSE),
('assistant', 'view_all_files', TRUE),
('assistant', 'view_logs', TRUE),
('assistant', 'view_admin_logs', FALSE),
('assistant', 'manage_permissions', FALSE),
('assistant', 'access_admin_panel', TRUE),
('assistant', 'manage_settings', FALSE),

-- ROP permissions (department management)
('rop', 'create_user', FALSE),
('rop', 'edit_user', FALSE),
('rop', 'delete_user', FALSE),
('rop', 'reset_password', FALSE),
('rop', 'view_all_users', FALSE),
('rop', 'create_department', FALSE),
('rop', 'edit_department', FALSE),
('rop', 'delete_department', FALSE),
('rop', 'manage_department_members', TRUE),
('rop', 'create_chat', TRUE),
('rop', 'edit_chat', TRUE),
('rop', 'delete_chat', FALSE),
('rop', 'manage_chat_participants', TRUE),
('rop', 'edit_messages', FALSE),
('rop', 'delete_messages', FALSE),
('rop', 'view_all_messages', FALSE),
('rop', 'upload_files', TRUE),
('rop', 'delete_any_file', FALSE),
('rop', 'view_all_files', FALSE),
('rop', 'view_logs', FALSE),
('rop', 'view_admin_logs', FALSE),
('rop', 'manage_permissions', FALSE),
('rop', 'access_admin_panel', FALSE),
('rop', 'manage_settings', FALSE),

-- Operator permissions (limited)
('operator', 'create_user', FALSE),
('operator', 'edit_user', FALSE),
('operator', 'delete_user', FALSE),
('operator', 'reset_password', FALSE),
('operator', 'view_all_users', FALSE),
('operator', 'create_department', FALSE),
('operator', 'edit_department', FALSE),
('operator', 'delete_department', FALSE),
('operator', 'manage_department_members', FALSE),
('operator', 'create_chat', FALSE),
('operator', 'edit_chat', FALSE),
('operator', 'delete_chat', FALSE),
('operator', 'manage_chat_participants', FALSE),
('operator', 'edit_messages', FALSE),
('operator', 'delete_messages', FALSE),
('operator', 'view_all_messages', FALSE),
('operator', 'upload_files', TRUE),
('operator', 'delete_any_file', FALSE),
('operator', 'view_all_files', FALSE),
('operator', 'view_logs', FALSE),
('operator', 'view_admin_logs', FALSE),
('operator', 'manage_permissions', FALSE),
('operator', 'access_admin_panel', FALSE),
('operator', 'manage_settings', FALSE),

-- Employee permissions (minimal)
('employee', 'create_user', FALSE),
('employee', 'edit_user', FALSE),
('employee', 'delete_user', FALSE),
('employee', 'reset_password', FALSE),
('employee', 'view_all_users', FALSE),
('employee', 'create_department', FALSE),
('employee', 'edit_department', FALSE),
('employee', 'delete_department', FALSE),
('employee', 'manage_department_members', FALSE),
('employee', 'create_chat', FALSE),
('employee', 'edit_chat', FALSE),
('employee', 'delete_chat', FALSE),
('employee', 'manage_chat_participants', FALSE),
('employee', 'edit_messages', FALSE),
('employee', 'delete_messages', FALSE),
('employee', 'view_all_messages', FALSE),
('employee', 'upload_files', TRUE),
('employee', 'delete_any_file', FALSE),
('employee', 'view_all_files', FALSE),
('employee', 'view_logs', FALSE),
('employee', 'view_admin_logs', FALSE),
('employee', 'manage_permissions', FALSE),
('employee', 'access_admin_panel', FALSE),
('employee', 'manage_settings', FALSE)
ON CONFLICT (role, permission) DO NOTHING;

COMMENT ON TABLE role_general_permissions IS 'Controls general permissions for each role across the system';
COMMENT ON COLUMN role_general_permissions.permission IS 'Permission name (e.g., create_user, edit_chat, view_logs)';
