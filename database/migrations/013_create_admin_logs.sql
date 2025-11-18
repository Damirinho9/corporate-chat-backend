-- Migration: Create admin_logs table for audit trail
-- Description: Creates table to log all administrative actions for security and audit purposes

-- Create admin_logs table
CREATE TABLE IF NOT EXISTS admin_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);

-- Add comment for documentation
COMMENT ON TABLE admin_logs IS 'Logs all admin actions for audit trail and security monitoring';
COMMENT ON COLUMN admin_logs.user_id IS 'ID of the admin/ROP who performed the action';
COMMENT ON COLUMN admin_logs.action IS 'Action type (e.g., create_user, delete_message, etc.)';
COMMENT ON COLUMN admin_logs.details IS 'Additional details about the action in JSON format';
COMMENT ON COLUMN admin_logs.created_at IS 'Timestamp when the action was performed';
