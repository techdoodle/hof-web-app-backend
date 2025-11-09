-- Performance indexes for booking-info API optimization
-- Run these queries directly in your PostgreSQL database

-- Index on bookings.match_id for faster JOINs with booking_slots
CREATE INDEX IF NOT EXISTS IDX_bookings_match_id ON bookings(match_id);

-- Composite index on booking_slots for the query pattern: booking_id + status
-- This optimizes the JOIN and WHERE clause in booking-info queries
CREATE INDEX IF NOT EXISTS IDX_booking_slots_booking_id_status ON booking_slots(booking_id, status);

-- Composite index on waitlist_entries for match_id + status filtering
-- This optimizes waitlist slot count queries
CREATE INDEX IF NOT EXISTS IDX_waitlist_entries_match_id_status ON waitlist_entries(match_id, status);

-- Optional: If you want to drop these indexes later, use:
-- DROP INDEX IF EXISTS IDX_bookings_match_id;
-- DROP INDEX IF EXISTS IDX_booking_slots_booking_id_status;
-- DROP INDEX IF EXISTS IDX_waitlist_entries_match_id_status;

