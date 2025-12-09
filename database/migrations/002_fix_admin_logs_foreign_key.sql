-- Migration: Fix admin_logs foreign key constraint
-- Problem: admin_logs.user_id REFERENCES users(id) without ON DELETE action
-- Solution: Add ON DELETE SET NULL to allow user deletion

-- Step 1: Drop existing foreign key constraint
ALTER TABLE admin_logs
DROP CONSTRAINT IF EXISTS admin_logs_user_id_fkey;

-- Step 2: Add new foreign key constraint with ON DELETE SET NULL
-- When user is deleted, user_id in admin_logs becomes NULL (preserves audit trail)
ALTER TABLE admin_logs
ADD CONSTRAINT admin_logs_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE SET NULL;

-- Note: Logs are preserved even after user deletion, but user_id becomes NULL
