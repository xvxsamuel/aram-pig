-- Verification queries to confirm migrations were successful
-- Run these in Supabase SQL Editor to verify everything is working

-- ============================================================================
-- 1. Verify Security Fixes
-- ============================================================================

-- Check that cleanup_stale_jobs function exists with security settings
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  proconfig as settings
FROM pg_proc 
WHERE proname = 'cleanup_stale_jobs';
-- Expected: is_security_definer = true, settings should include search_path=public

-- Check that update_updated_at_column function exists with security settings
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  proconfig as settings
FROM pg_proc 
WHERE proname = 'update_updated_at_column';
-- Expected: is_security_definer = true, settings should include search_path=public

-- ============================================================================
-- 2. Verify Summoner Cache Fields
-- ============================================================================

-- Check that new columns exist in summoners table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'summoners'
  AND column_name IN ('game_name', 'tag_line', 'summoner_level', 'profile_icon_id')
ORDER BY column_name;
-- Expected: All 4 columns should be present

-- Check that the new index was created
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'summoners'
  AND indexname = 'idx_summoners_name_tag';
-- Expected: 1 row showing the index on LOWER(game_name), LOWER(tag_line)

-- ============================================================================
-- 3. Verify Update Jobs Table
-- ============================================================================

-- Check update_jobs table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'update_jobs'
ORDER BY ordinal_position;
-- Expected: All columns (id, puuid, status, total_matches, etc.)

-- Check that indexes exist
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'update_jobs'
ORDER BY indexname;
-- Expected: Multiple indexes (idx_update_jobs_puuid, idx_update_jobs_status, etc.)

-- ============================================================================
-- 4. Test Data Query (if you have summoners)
-- ============================================================================

-- Check if any summoners have cached data
SELECT 
  puuid,
  game_name,
  tag_line,
  summoner_level,
  profile_icon_id,
  last_updated
FROM summoners
LIMIT 5;
-- This will show if caching is working (new summoners will have these fields populated)

-- ============================================================================
-- Success Indicators:
-- ============================================================================
-- ✅ Both functions show is_security_definer = true
-- ✅ Both functions have search_path=public in settings
-- ✅ All 4 new columns exist in summoners table
-- ✅ New index idx_summoners_name_tag exists
-- ✅ No security warnings in Supabase dashboard
-- ✅ update_jobs table has all required columns and indexes
