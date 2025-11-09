-- Performance indexes for nearby-matches API optimization
-- Run these queries directly in your PostgreSQL database

-- Index on matches.start_time for filtering upcoming matches
CREATE INDEX IF NOT EXISTS IDX_matches_start_time ON matches(start_time);

-- Index on matches.venue for faster JOINs with venues table
CREATE INDEX IF NOT EXISTS IDX_matches_venue ON matches(venue);

-- Composite index on matches for venue + start_time (common query pattern)
-- This optimizes queries that filter by venue and start_time together
CREATE INDEX IF NOT EXISTS IDX_matches_venue_start_time ON matches(venue, start_time);

-- Note: The index on venues(latitude, longitude) should already exist from migration 1734567890005
-- If it doesn't exist, create it with:
-- CREATE INDEX IF NOT EXISTS idx_venues_lat_long ON venues (latitude, longitude);

-- Optional: If you want to drop these indexes later, use:
-- DROP INDEX IF EXISTS IDX_matches_start_time;
-- DROP INDEX IF EXISTS IDX_matches_venue;
-- DROP INDEX IF EXISTS IDX_matches_venue_start_time;

