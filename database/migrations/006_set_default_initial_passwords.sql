-- Set default initial_password for users who don't have one
-- This allows admins to see and reset passwords

UPDATE users
SET initial_password = 'pass123'
WHERE initial_password IS NULL;

-- Note: These are default passwords that should be changed by users
-- Admins can use the "Сбросить" (Reset) button to generate new secure passwords
