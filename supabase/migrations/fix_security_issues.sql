-- Security-hardened migration to fix mutable search_path vulnerabilities
-- This file fixes the security issues identified in the Supabase dashboard

-- ============================================================================
-- Fix 1: Update the update_updated_at_column function with SECURITY DEFINER
-- ============================================================================

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- recreate the trigger since we dropped the function with CASCADE
DROP TRIGGER IF EXISTS update_update_jobs_updated_at ON update_jobs;

CREATE TRIGGER update_update_jobs_updated_at
  BEFORE UPDATE ON update_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Fix 2: Update the cleanup_stale_jobs function with SECURITY DEFINER
-- ============================================================================

DROP FUNCTION IF EXISTS cleanup_stale_jobs();

CREATE OR REPLACE FUNCTION cleanup_stale_jobs()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE update_jobs
  SET 
    status = 'failed',
    error_message = 'Job timed out after 15 minutes',
    completed_at = NOW()
  WHERE 
    status IN ('pending', 'processing')
    AND started_at < NOW() - INTERVAL '15 minutes';
END;
$$;

-- ============================================================================
-- Security Best Practices Applied:
-- ============================================================================
-- 
-- 1. SECURITY DEFINER: Functions run with the privileges of the function owner,
--    not the caller. This prevents privilege escalation.
--
-- 2. SET search_path = public: Explicitly sets the schema search path to 'public'
--    to prevent malicious schema manipulation attacks where an attacker could
--    create tables/functions in their own schema that would be called instead.
--
-- 3. CASCADE drop: Ensures all dependent objects (triggers) are properly cleaned
--    up before recreating the function.
--
-- These changes fix the "Function has a role mutable search_path" security warnings.
-- ============================================================================
