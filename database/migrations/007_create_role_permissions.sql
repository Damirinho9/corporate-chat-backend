-- Create permissions table for role-based messaging rules
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    from_role VARCHAR(20) NOT NULL,
    to_role VARCHAR(20) NOT NULL,
    can_send_message BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_role, to_role)
);

-- Insert default permissions based on current logic
INSERT INTO role_permissions (from_role, to_role, can_send_message) VALUES
-- Admin can send to everyone
('admin', 'admin', TRUE),
('admin', 'assistant', TRUE),
('admin', 'rop', TRUE),
('admin', 'operator', TRUE),
('admin', 'employee', TRUE),

-- Assistant can send to everyone
('assistant', 'admin', TRUE),
('assistant', 'assistant', TRUE),
('assistant', 'rop', TRUE),
('assistant', 'operator', TRUE),
('assistant', 'employee', TRUE),

-- ROP can send to everyone
('rop', 'admin', TRUE),
('rop', 'assistant', TRUE),
('rop', 'rop', TRUE),
('rop', 'operator', TRUE),
('rop', 'employee', TRUE),

-- Operator restrictions
('operator', 'admin', TRUE),
('operator', 'assistant', TRUE),
('operator', 'rop', TRUE),
('operator', 'operator', FALSE),  -- Operators CANNOT message each other
('operator', 'employee', TRUE),

-- Employee permissions
('employee', 'admin', TRUE),
('employee', 'assistant', TRUE),
('employee', 'rop', TRUE),
('employee', 'operator', TRUE),
('employee', 'employee', TRUE)

ON CONFLICT (from_role, to_role) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup
ON role_permissions(from_role, to_role);

-- Add comment
COMMENT ON TABLE role_permissions IS 'Defines which roles can send direct messages to other roles';
