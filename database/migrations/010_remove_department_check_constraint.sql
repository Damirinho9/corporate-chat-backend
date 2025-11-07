-- Migration: Remove check_department constraint that prevents adding users to new departments
-- Created: 2025-11-07

-- The check_department constraint was preventing users from being added to departments
-- that didn't exist at the time the constraint was created.
-- This migration removes the constraint to allow dynamic department management.

ALTER TABLE users DROP CONSTRAINT IF EXISTS check_department;

-- Note: Department validation is now handled at the application level
-- and through the departments table with proper foreign key relationships
-- via the sync_department_name trigger functions.
