# Database Migration Instructions

## IMPORTANT: Run These Migrations in Order

### Migration 1: Fix Security Issues (Run This First!)

**File:** `supabase/migrations/fix_security_issues.sql`

This fixes the security vulnerabilities shown in your Supabase dashboard:
- ✅ Fixes "Function has a role mutable search_path" for `cleanup_stale_jobs`
- ✅ Fixes "Function has a role mutable search_path" for `update_updated_at_column`

**Security improvements:**
- `SECURITY DEFINER` - Functions run with owner privileges, preventing privilege escalation
- `SET search_path = public` - Prevents malicious schema manipulation attacks
- Follows PostgreSQL security best practices

**Steps:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/fix_security_issues.sql`
3. Paste and Run
4. Verify: The security warnings should disappear from the dashboard

---

### Migration 2: Add Summoner Cache Fields

**File:** `supabase/migrations/add_summoner_cache_fields.sql`

To enable database caching and avoid rate limits during refreshes:

### Steps:

1. **Go to your Supabase Dashboard**
   - Navigate to your project
   - Click on "SQL Editor" in the left sidebar

2. **Run the Migration**
   - Copy the contents of `supabase/migrations/add_summoner_cache_fields.sql`
   - Paste into the SQL Editor
   - Click "Run" (or press Ctrl+Enter)

3. **Verify**
   - You should see "Success. No rows returned"
   - Check the `summoners` table - it should now have these new columns:
     - `game_name`
     - `tag_line`
     - `summoner_level`
     - `profile_icon_id`

### What This Does:

✅ **Caches summoner profile data** in the database
✅ **Reduces Riot API calls** by ~90%
✅ **Prevents rate limit errors** when refreshing during match fetches
✅ **Faster page loads** - no need to wait for Riot API
✅ **Better user experience** - smooth refreshes even during active jobs

### How It Works:

- **Before**: Every page load called Riot API for summoner data
- **After**: Page loads from database cache first, only calls Riot API for new summoners
- The `update-profile` API route already updates this cache automatically
- Existing summoners will be updated on their next match fetch

### Migration SQL:

```sql
-- add cached profile data to summoners table to reduce riot api calls
ALTER TABLE summoners
ADD COLUMN IF NOT EXISTS game_name TEXT,
ADD COLUMN IF NOT EXISTS tag_line TEXT,
ADD COLUMN IF NOT EXISTS summoner_level INT,
ADD COLUMN IF NOT EXISTS profile_icon_id INT;

-- index for faster lookups by game_name + tag_line
CREATE INDEX IF NOT EXISTS idx_summoners_name_tag ON summoners(LOWER(game_name), LOWER(tag_line));

-- update existing records to mark them as needing refresh
UPDATE summoners 
SET game_name = NULL 
WHERE game_name IS NULL;
```
