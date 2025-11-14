-- Migration: Create registration_requests table
-- Description: Stores user registration requests pending admin approval

-- Create registration_requests table
CREATE TABLE IF NOT EXISTS registration_requests (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    generated_password VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('assistant', 'rop', 'operator', 'employee')),
    department VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approval_token VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_registration_requests_email ON registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_registration_requests_token ON registration_requests(approval_token);
CREATE INDEX IF NOT EXISTS idx_registration_requests_created ON registration_requests(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE registration_requests IS 'Stores user registration requests pending admin approval';
COMMENT ON COLUMN registration_requests.email IS 'User email (will be used as login)';
COMMENT ON COLUMN registration_requests.full_name IS 'User full name';
COMMENT ON COLUMN registration_requests.username IS 'Generated username from full name';
COMMENT ON COLUMN registration_requests.generated_password IS 'Auto-generated password to send to user';
COMMENT ON COLUMN registration_requests.status IS 'Request status: pending, approved, rejected';
COMMENT ON COLUMN registration_requests.approval_token IS 'Unique token for admin approval link';
