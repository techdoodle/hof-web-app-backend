-- Migration: Fix timestamp timezone issues
-- Description: Updates timestamp columns to handle timezone properly
-- Created: 2024

-- Set timezone for the session
SET timezone = 'Asia/Kolkata';

-- Update start_time column to include timezone
ALTER TABLE matches 
ALTER COLUMN start_time TYPE TIMESTAMP WITH TIME ZONE;

-- Update end_time column to include timezone (if it exists)
ALTER TABLE matches 
ALTER COLUMN end_time TYPE TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN matches.start_time IS 'Match start time in IST timezone';
COMMENT ON COLUMN matches.end_time IS 'Match end time in IST timezone';
