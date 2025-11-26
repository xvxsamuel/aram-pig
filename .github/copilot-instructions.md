# copilot instructions

## architecture
- **next 15 app router**: server components in `src/app/` fetch from supabase; client components under `src/components/` (marked with `'use client'`)
- **supabase backend**: anon client for browser (`supabase` export), admin client for server only (`createAdminClient()` in `src/lib/supabase.ts`)
- **data ingestion**: `scripts/continuous-scraper.ts` runs via `tsx --import ./scripts/load-env.ts` to validate env before execution
- **static data**: `src/data/*.json` (items, runes, spells) refreshed via `npm run fetch-items`

## key files
- `src/lib/match-storage.ts`: sole entry point for persisting matches—computes ability orders, build orders, starter items. Uses TypeScript aggregation for bulk stats.
- `src/lib/stats-aggregator.ts`: in-memory aggregation of champion stats by champion+patch. Reduces DB calls from N participants to ~80-100 unique champion+patch combos.
- `src/lib/rate-limiter.ts`: wraps riot api calls; always call `waitForRateLimit(region, 'batch')` before api requests
- `src/lib/patch-utils.ts`: centralized patch utilities—fetches latest patches from ddragon, `extractPatch()` for version mapping, `isPatchAccepted()` to check if patch is in latest 3
- `scripts/continuous-scraper.ts`: `ACCEPTED_PATCHES` array gates which patches to store—update when new patches release

## stats update architecture
there are two paths for updating champion_stats:

### 1. organic user updates (update-profile API)
- triggered when user clicks "Update" button on their profile
- `src/app/api/update-profile/route.ts` calls `increment_champion_stats` RPC directly
- immediate per-participant RPC calls (no batching needed, small volume)
- does NOT use match-storage.ts (has its own match processing logic)

### 2. bulk scraping (scraper scripts) - TypeScript aggregation
- `scripts/continuous-scraper.ts` for local/manual mass scraping
- github actions scraper workflow for scheduled background scraping
- uses `src/lib/match-storage.ts` with `batchStats=true`
- **stats aggregated in TypeScript** via `StatsAggregator` class before DB calls
- 1000 participants → ~80-100 DB calls (grouped by champion+patch)
- `flushAggregatedStats()` sends pre-combined JSONB to `upsert_aggregated_champion_stats_batch` RPC
- DB does simple JSONB merge instead of heavy per-participant manipulation

### match-storage.ts API for bulk scraping
```typescript
// store match, aggregate stats for batch processing
await storeMatchData(matchData, region, false, true)  // batchStats=true

// check aggregated counts
const participantCount = getStatsBufferCount()      // total participants added
const championCount = getAggregatedChampionCount()  // unique champion+patch combos

// flush all aggregated stats to DB (call periodically and on shutdown)
await flushAggregatedStats()  // or flushStatsBatch() alias
```

### stats aggregation flow
1. `storeMatchData(batchStats=true)` extracts participant data
2. each participant added to `StatsAggregator` via `addParticipant()`
3. aggregator combines stats by champion+patch key in memory
4. on flush: `getAggregatedStats()` returns pre-combined JSONB for each champion+patch
5. `upsert_aggregated_champion_stats_batch` RPC does simple merge with existing DB data
6. DB CPU reduced significantly (JSONB merge vs per-participant manipulation)

## commands
```
npm run dev          # start next dev server
npm run scraper      # run continuous match scraper
npm run fetch-items  # refresh static riot data
npm run lint         # eslint check
```

## github actions workflows
- **scraper.yml**: runs every 12 hours to collect match data; can be triggered manually with `reset_state` and `duration_minutes` inputs; uses only 50% of rate limit by default
- **fetch-items.yml**: runs weekly (Monday 6am UTC) to update static riot data; creates PR if changes detected
- **cleanup-stats.yml**: runs daily at 3am UTC to delete champion_stats for patches older than latest 3

required secrets for workflows:
- `RIOT_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `CRON_SECRET` (for cleanup-stats)
- `NEXT_PUBLIC_SITE_URL` (for cleanup-stats)

optional secrets:
- `SCRAPER_PAUSED`: set to `true` to pause automatic scraping (for manual local scraping)

## scraper throttling
the scraper uses `SCRAPER_THROTTLE` env var (0-100) to limit rate limit usage:
- github actions uses 50% by default (50 req/2min instead of 90)
- local scraping uses 100% by default (full rate limit)
- this leaves capacity for website users to refresh profiles

to pause github actions scraper for manual scraping:
1. go to repo settings -> secrets and variables -> actions
2. add secret `SCRAPER_PAUSED` with value `true`
3. remove or set to `false` to resume

## data flow
1. scraper fetches matches from riot api (respecting rate limits)
2. `storeMatchData()` persists to `matches`/`summoner_matches` tables
3. stats aggregated in TypeScript by champion+patch (batch mode)
4. `flushAggregatedStats()` calls `upsert_aggregated_champion_stats_batch` RPC
5. DB merges pre-aggregated JSONB with existing data (simple recursive merge)
6. frontend pages query aggregated stats from supabase views

## conventions
- **env vars**: required in `.env.local`: `RIOT_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`
- **console output**: capitalize messages, NO EMOJIS OR DECORATIVE SYMBOLS EVER
- **comments**: lowercase, minimal
- **admin client**: never use in browser code—`createAdminClient()` throws if called client-side
- **database changes**: reference `supabase/current_db_schema.sql` for table structure, `supabase/functions/` for rpc functions, `supabase/triggers/` for triggers
- **styling/colors**: always use css variables from `src/app/globals.css` (e.g., `var(--color-kda-3)`); add new variables there if needed rather than hardcoding colors in components

## patch management
when a new lol patch releases:
1. update `ACCEPTED_PATCHES` in `scripts/continuous-scraper.ts`
2. update `patchSchedule` in `src/lib/patch-utils.ts` with start date
3. reset scraper state: delete `scripts/scraper-state.json` or run with `--reset`

## troubleshooting
- **missing stats**: check `ACCEPTED_PATCHES` matches current patch
- **rate limit errors**: ensure `waitForRateLimit()` called before every riot api request
- **stale ui data**: verify rpc function signatures match typescript types
- **db schema unclear**: ask before guessing—direct sql preferred over assumptions
- **stats not updating (batch mode)**: ensure `flushAggregatedStats()` is called; check `upsert_aggregated_champion_stats_batch` function exists in supabase
- **high DB CPU**: if still high, check if update-profile API volume is large; consider adding aggregation there too
