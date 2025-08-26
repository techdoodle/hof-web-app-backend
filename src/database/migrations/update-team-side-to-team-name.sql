-- Migration: Update team_side to team_name in match_participants table
-- Description: Renames team_side column to team_name and updates type to allow longer team names
-- Created: 2024

-- Rename the column from team_side to team_name
ALTER TABLE match_participants 
RENAME COLUMN team_side TO team_name;

-- Update the column type to allow longer team names (varchar(100))
ALTER TABLE match_participants 
ALTER COLUMN team_name TYPE VARCHAR(100);

-- Update any NULL values to a default value (for existing records)
UPDATE match_participants 
SET team_name = 'Team A' 
WHERE team_name IS NULL;

-- Make the column NOT NULL after updating existing records
ALTER TABLE match_participants 
ALTER COLUMN team_name SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN match_participants.team_name IS 'Name of the team the player belongs to (e.g., Team A, Team B, Red Team, etc.)';
