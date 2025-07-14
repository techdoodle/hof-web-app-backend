-- Migration: Create football_teams table
-- Description: Stores football team data fetched from API-Football
-- Created: 2024

CREATE TABLE IF NOT EXISTS football_teams (
    id SERIAL PRIMARY KEY,
    api_team_id INTEGER NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    team_code VARCHAR(10),
    country VARCHAR(100) NOT NULL,
    founded INTEGER,
    national BOOLEAN DEFAULT FALSE,
    logo_url TEXT,
    league_id INTEGER,
    league_name VARCHAR(255),
    league_country VARCHAR(100),
    season INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique combination of api_team_id and league_id for each season
    UNIQUE(api_team_id, league_id, season)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_football_teams_country ON football_teams(country);
CREATE INDEX IF NOT EXISTS idx_football_teams_league_id ON football_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_football_teams_season ON football_teams(season);
CREATE INDEX IF NOT EXISTS idx_football_teams_api_team_id ON football_teams(api_team_id);
CREATE INDEX IF NOT EXISTS idx_football_teams_created_at ON football_teams(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_football_teams_updated_at 
    BEFORE UPDATE ON football_teams 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE football_teams IS 'Stores football team data fetched from API-Football service';
COMMENT ON COLUMN football_teams.api_team_id IS 'Team ID from API-Football service';
COMMENT ON COLUMN football_teams.team_code IS 'Team code (e.g., BIL for Athletic Club)';
COMMENT ON COLUMN football_teams.logo_url IS 'URL to team logo image';
COMMENT ON COLUMN football_teams.founded IS 'Year the team was founded';
COMMENT ON COLUMN football_teams.national IS 'Whether this is a national team'; 