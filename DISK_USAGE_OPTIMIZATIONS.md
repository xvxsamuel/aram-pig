# Database Disk Usage Optimizations

## Critical Finding: Timeline Data Dependencies

**⚠️ IMPORTANT:** Timeline data is REQUIRED for core features and cannot be fully removed without data loss.

### What Depends on Timeline Data:
1. **PIG Score Calculation** - Uses `abilityOrder`, `buildOrder`, `firstBuy` extracted from timeline
2. **Build Tab Display** - Shows item timeline with purchase/sell events and gold progression
3. **Skills Tab** - Shows ability leveling sequence
4. **Core Build Detection** - Requires `buildOrder` for correct 3-item core identification
5. **Starter Items Tracking** - Needs `firstBuy` for starter item scoring

### Timeline Data Impact:
- **With timeline**: Full PIG scoring, accurate build paths, skill orders
- **Without timeline**: No PIG score, missing build/skill details, fallback to final item slots only

## Revised Optimization Strategy

Since timeline data is essential for PIG scoring (the core feature), we'll focus on other optimizations:

## Immediate Actions (Low Risk)

### 1. Increase Stats Buffer Size
**Current:** Flush every 30 participants (3 matches)  
**Recommended:** Flush every 100-200 participants (10-20 matches)

```typescript
// scripts/continuous-scraper.ts
const STATS_BUFFER_FLUSH_SIZE = 100 // was 30
const STATS_FLUSH_INTERVAL = 60000 // was 20000 (60s instead of 20s)
```

**Why:** Fewer DB writes = less disk I/O, better batch efficiency

### 2. Add Match Data Cleanup Job
Create a migration to delete old matches beyond retention period:

```sql
-- supabase/migrations/add_match_cleanup.sql
CREATE OR REPLACE FUNCTION cleanup_old_matches()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_matches INTEGER := 0;
    v_deleted_summoner_matches INTEGER := 0;
BEGIN
    -- Delete matches older than 90 days
    WITH deleted AS (
        DELETE FROM summoner_matches
        WHERE game_creation < EXTRACT(EPOCH FROM (NOW() - INTERVAL '90 days')) * 1000
        RETURNING match_id
    )
    SELECT COUNT(*) INTO v_deleted_summoner_matches FROM deleted;
    
    -- Delete orphaned matches (no references in summoner_matches)
    WITH deleted AS (
        DELETE FROM matches
        WHERE match_id NOT IN (SELECT DISTINCT match_id FROM summoner_matches)
        RETURNING match_id
    )
    SELECT COUNT(*) INTO v_deleted_matches FROM deleted;
    
    RAISE NOTICE 'Cleaned up % matches and % summoner_matches', v_deleted_matches, v_deleted_summoner_matches;
    RETURN v_deleted_matches;
END;
$$;
```

Schedule this to run weekly via a cron job or GitHub Action.

### 3. Compress Timeline Storage for Old Matches

For matches older than 90 days, remove verbose timeline data while keeping essential build info:

```typescript
// src/lib/db/match-storage.ts - modify storeMatchData
const OLD_MATCH_THRESHOLD = 90 * 24 * 60 * 60 * 1000 // 90 days
const isOldMatch = gameCreationMs < Date.now() - OLD_MATCH_THRESHOLD

// For old matches, only store timeline if not already present
const shouldStoreTimeline = !isOldMatch || timeline === null
```

**Alternative approach:** Store timeline but compress for old matches:

```sql
-- After 90 days, remove item_timeline from match_data (keep abilityOrder, buildOrder, firstBuy)
UPDATE summoner_matches
SET match_data = match_data - 'itemPurchases'
WHERE game_creation < EXTRACT(EPOCH FROM (NOW() - INTERVAL '90 days')) * 1000
AND match_data ? 'itemPurchases';
```

**Why this works:** 
- `abilityOrder`, `buildOrder`, `firstBuy` are strings (~100 bytes each)
- `itemPurchases` array can be 5-10KB per player
- PIG score already calculated and stored, doesn't need raw timeline
- Build tab can show simplified view without full item timeline for old matches

**Savings:** ~40-60% reduction in old match data size

## Medium Priority (More Impactful)

### 4. Compress Old Match Data

Add a compression job for matches older than 30 days:

```sql
-- Remove verbose fields from old match data (keeps PIG score)
UPDATE summoner_matches
SET match_data = jsonb_strip_nulls(
    match_data - 'itemPurchases'
)
WHERE game_creation < EXTRACT(EPOCH FROM (NOW() - INTERVAL '30 days')) * 1000
AND match_data ? 'itemPurchases';
```

**Note:** Keep `pigScoreBreakdown` for Performance tab display. Only remove `itemPurchases` (item timeline events).

**Savings:** ~20-30% reduction in old match data size

### 5. Add Database Indexes
Missing indexes cause table scans and disk bloat:

```sql
-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_summoner_matches_game_creation 
ON summoner_matches(game_creation);

CREATE INDEX IF NOT EXISTS idx_summoner_matches_patch 
ON summoner_matches(patch);

CREATE INDEX IF NOT EXISTS idx_matches_patch 
ON matches(patch);

CREATE INDEX IF NOT EXISTS idx_champion_stats_patch 
ON champion_stats(patch);

CREATE INDEX IF NOT EXISTS idx_champion_stats_games 
ON champion_stats(games) WHERE games > 0;

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_champion_stats_data_gin 
ON champion_stats USING gin(data);
```

### 6. Partition Large Tables
For massive scale, partition by time:

```sql
-- Convert summoner_matches to partitioned table (requires migration)
CREATE TABLE summoner_matches_partitioned (
    LIKE summoner_matches INCLUDING ALL
) PARTITION BY RANGE (game_creation);

-- Create monthly partitions
CREATE TABLE summoner_matches_2024_12 PARTITION OF summoner_matches_partitioned
FOR VALUES FROM (1701388800000) TO (1704067200000);
```

## Long-term Strategy

### 7. Separate Hot/Cold Data
- **Hot data** (recent matches): Keep full detail in main tables
- **Cold data** (old matches): Move to archive tables with compressed format

```sql
CREATE TABLE summoner_matches_archive (
    puuid varchar,
    match_id varchar,
    game_creation bigint,
    compressed_data bytea, -- gzip compressed JSON
    PRIMARY KEY (puuid, match_id)
);
```

### 8. Use PostgreSQL TOAST Compression
Enable TOAST compression on JSONB columns:

```sql
ALTER TABLE summoner_matches 
ALTER COLUMN match_data SET STORAGE EXTENDED;

ALTER TABLE champion_stats 
ALTER COLUMN data SET STORAGE EXTENDED;

VACUUM FULL summoner_matches;
VACUUM FULL champion_stats;
```

### 9. Implement Write-Ahead Log (WAL) Archiving
Configure PostgreSQL to archive old WAL files:

```sql
-- postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /archive/%f'
```

## Monitoring & Metrics

Add query to track disk usage growth:

```sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Expected Impact

| Optimization | Disk Savings | Implementation Effort |
|--------------|--------------|----------------------|
| Increase buffer size | 5-10% | 5 minutes |
| Add match cleanup | 20-40% | 30 minutes |
| Compress old timeline data | 30-50% | 1 hour |
| Compress old match data | 20-30% | 1 hour |
| Add indexes | 10-15% (bloat reduction) | 20 minutes |
| Partition tables | 40-60% (long-term) | 4-8 hours |

## Recommended Implementation Order

1. ✅ **Week 1:** Increase buffer size (quick win)
2. ✅ **Week 2:** Add match cleanup job + indexes
3. ✅ **Week 3:** Implement compression for old data (both timeline and match data)
4. ✅ **Month 2:** Evaluate partitioning if still needed

Total expected disk usage reduction: **40-60%** with first 3 steps.
