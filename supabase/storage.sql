-- ========== Supabase Storage Buckets ==========

-- Create submission-csvs bucket for CSV attachments
-- This will be executed via Supabase dashboard or CLI
-- The bucket policies will be set in the dashboard or via management API

-- Bucket: submission-csvs
-- Purpose: Store CSV attachments submitted with chat messages
-- Access: Team-based RLS similar to database tables

-- Note: Bucket creation and policy setup typically done via:
-- 1. Supabase Dashboard: Storage > Create bucket
-- 2. SQL (when bucket exists): Set up RLS policies
-- 3. Management API for programmatic setup

-- RLS policies for storage buckets would be set up in the dashboard
-- with similar team-based access controls as the database tables

-- Example bucket policies (to be configured in dashboard):
-- Team members can upload to their team's folder: submission-csvs/{team_id}/
-- Team members can read their team's files
-- Admins have full access to team files
-- Public read access for shared/reviewed CSVs