# Run Database Migration

You need to create the `update_jobs` table in your Supabase database.

## Option 1: Via Supabase Dashboard (Easiest)

1. Go to your Supabase project: https://supabase.com/dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire contents of `supabase/migrations/create_update_jobs.sql`
5. Paste it into the SQL editor
6. Click "Run" (or press Ctrl+Enter)

## Option 2: Via Supabase CLI (if installed)

```powershell
# Make sure you're in the project directory
cd "c:\Users\keve\Desktop\uni\visual design and frontend development\sprint 1\aram-pig"

# Run the migration
supabase db push
```

## What This Creates

The migration creates:
- `update_jobs` table to track update progress
- Indexes for fast queries
- Row Level Security policies
- Automatic timestamp updates
- Stale job cleanup function

After running this, the update button will work with database-backed progress tracking!
