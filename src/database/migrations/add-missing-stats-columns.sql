-- Migration: Add missing stats columns to match_participant_stats table
-- Description: Adds totalTackles, totalInterceptions, teamAGoals, and teamBGoals columns
-- Created: 2024

-- Add total_tackles column
ALTER TABLE match_participant_stats 
ADD COLUMN IF NOT EXISTS total_tackles INTEGER;

-- Add total_interceptions column  
ALTER TABLE match_participant_stats 
ADD COLUMN IF NOT EXISTS total_interceptions INTEGER;

-- Add team_a_goals column
ALTER TABLE match_participant_stats 
ADD COLUMN IF NOT EXISTS team_a_goals INTEGER;

-- Add team_b_goals column
ALTER TABLE match_participant_stats 
ADD COLUMN IF NOT EXISTS team_b_goals INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN match_participant_stats.total_tackles IS 'Total number of tackles attempted by the player';
COMMENT ON COLUMN match_participant_stats.total_interceptions IS 'Total number of interceptions made by the player';
COMMENT ON COLUMN match_participant_stats.team_a_goals IS 'Goals scored by Team A in the match';
COMMENT ON COLUMN match_participant_stats.team_b_goals IS 'Goals scored by Team B in the match';
