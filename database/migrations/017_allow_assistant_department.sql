-- Migration: Allow assistants to have departments
-- This updates the check_department constraint to allow assistants to be assigned to departments

-- Drop the old constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_department;

-- Add new constraint: only admin must have NULL department
ALTER TABLE users ADD CONSTRAINT check_department CHECK (
  (role = 'admin' AND department IS NULL) OR
  (role IN ('assistant', 'rop', 'operator', 'employee') AND department IS NOT NULL)
);

-- Update existing assistants without department
UPDATE users SET department = 'Ассистенты' WHERE role = 'assistant' AND department IS NULL;
