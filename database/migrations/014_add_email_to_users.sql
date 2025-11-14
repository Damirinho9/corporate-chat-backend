-- Migration: Add email field to users table
-- Description: Adds email field for user authentication and communication

-- Add email column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add comment for documentation
COMMENT ON COLUMN users.email IS 'User email address (used for login and notifications)';
