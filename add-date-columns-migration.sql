-- Migration: Add start_date and end_date columns to upcoming_features table
-- Safe migration - will not affect existing data
-- Run this on Render database

-- Add start_date column (nullable, so existing features won't break)
ALTER TABLE upcoming_features ADD COLUMN start_date DATE;

-- Add end_date column (nullable, so existing features won't break)
ALTER TABLE upcoming_features ADD COLUMN end_date DATE;

-- Verify the columns were added
-- Uncomment the line below to check the schema after migration
-- PRAGMA table_info(upcoming_features);
