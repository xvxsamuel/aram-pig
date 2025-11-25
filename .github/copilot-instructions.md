# copilot instructions

## architecture
- **next 15 app router**: server components in `src/app/` fetch from supabase; client components under `src/components/` (marked with `'use client'`)
- **supabase backend**: anon client for browser (`supabase` export), admin client for server only (`createAdminClient()` in `src/lib/supabase.ts`)
- **data ingestion**: `scripts/continuous-scraper.ts` runs via `tsx --import ./scripts/load-env.ts` to validate env before execution
- **static data**: `src/data/*.json` (items, runes, spells) refreshed via `npm run fetch-items`

## key files
- `src/lib/match-storage.ts`: sole entry point for persisting matches—computes ability orders, build orders, starter items
- `src/lib/rate-limiter.ts`: wraps riot api calls; always call `waitForRateLimit(region, 'batch')` before api requests
- `src/lib/patch-utils.ts`: centralized patch utilities—fetches latest patches from ddragon, `extractPatch()` for version mapping, `isPatchAccepted()` to check if patch is in latest 3
- `scripts/continuous-scraper.ts`: `ACCEPTED_PATCHES` array gates which patches to store—update when new patches release

## commands
```
npm run dev          # start next dev server
npm run scraper      # run continuous match scraper
npm run fetch-items  # refresh static riot data
npm run lint         # eslint check
```

## github actions workflows
- **scraper.yml**: runs every 4 hours to collect match data; can be triggered manually with `reset_state` and `duration_minutes` inputs
- **fetch-items.yml**: runs weekly (Monday 6am UTC) to update static riot data; creates PR if changes detected
- **cleanup-stats.yml**: runs daily at 3am UTC to delete champion_stats for patches older than latest 3

required secrets for workflows:
- `RIOT_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `CRON_SECRET` (for cleanup-stats)
- `NEXT_PUBLIC_SITE_URL` (for cleanup-stats)

## data flow
1. scraper fetches matches from riot api (respecting rate limits)
2. `storeMatchData()` persists to `matches`/`summoner_matches` tables
3. database triggers call `increment_champion_stats`/`increment_item_stats` rpcs
4. frontend pages query aggregated stats from supabase views

## conventions
- **env vars**: required in `.env.local`: `RIOT_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`
- **console output**: capitalize messages, no emoji or decorative symbols
- **comments**: lowercase, minimal
- **admin client**: never use in browser code—`createAdminClient()` throws if called client-side
- **database changes**: reference `supabase/current_db_schema.sql` for table structure, `supabase/functions/` for rpc functions, `supabase/triggers/` for triggers

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
