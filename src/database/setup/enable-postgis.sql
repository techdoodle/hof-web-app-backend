-- This script needs to be run once on the database with superuser privileges
-- For Railway: Run this in the database's SQL editor in the dashboard

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify PostGIS is installed
SELECT PostGIS_Version();

-- Grant usage to your application user (replace 'your_app_user' with actual username)
-- GRANT USAGE ON SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
