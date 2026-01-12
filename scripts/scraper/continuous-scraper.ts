// environment variables are loaded by load-env.ts (see package.json scripts)
import { writeFileSync, readFileSync, existsSync } from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { getMatchById, getMatchIdsByPuuid, getSummonerByRiotId } from '../../src/lib/riot/api'
import { waitForRateLimit, flushRateLimits } from '../../src/lib/riot/rate-limiter'
import { type RegionalCluster, type PlatformCode, extractPatch } from '../../src/lib/game'
import { storeMatchDataBatch, flushStatsBatch, getStatsBufferCount } from '../../src/lib/db'
import * as readline from 'readline'

console.log('[CRAWLER] All modules loaded successfully\n')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('[CRAWLER] Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ══════════════════════════════════════════════════════════════════════════════
// configuration
// ══════════════════════════════════════════════════════════════════════════════

const ACCEPTED_PATCHES = ['26.1']

// stats buffer - flush when buffer is large OR after time interval
// larger buffer = fewer db writes, but more memory usage
const STATS_BUFFER_FLUSH_SIZE = 50000 // flush every 50k participants (~5000 matches)
const STATS_FLUSH_INTERVAL = 7200000 // or every 2 hours as fallback
const STATS_FLUSH_COOLDOWN = 600000 // minimum 10 minutes between flushes

// cleanup config - run sparingly to save cpu
const CLEANUP_INTERVAL = 12 * 60 * 60 * 1000 // every 12 hours

// match batch processing
const THROTTLE = parseInt(process.env.SCRAPER_THROTTLE || '100', 10)
const MATCH_BATCH_SIZE = THROTTLE <= 50 ? 2 : 3

// db query batching
const DB_CHECK_BATCH_SIZE = 500 // check matches in larger batches

// memory limits
const MAX_KNOWN_MATCHES = 100000
const MAX_SEED_POOL = 30000
const MAX_DRY_PUUIDS = 8000
const MAX_VISITED = 50000
const MAX_BACKTRACK_HISTORY = 300
const MAX_STACK_SIZE = 200

// region config
const REGIONS: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']

const REGION_TO_PREFIXES: Record<RegionalCluster, string[]> = {
  americas: ['NA1', 'BR1', 'LA1', 'LA2'],
  europe: ['EUW1', 'EUN1', 'TR1', 'RU'],
  asia: ['KR', 'JP1'],
  sea: ['OC1', 'SG2', 'TW2', 'VN2', 'PH2', 'TH2'],
}

const DEFAULT_SEEDS: Array<{ cluster: RegionalCluster; platform: PlatformCode; summoner: string }> = [
  { cluster: 'europe', platform: 'euw1', summoner: 'TwTv Yikesu0#Yikes' },
  { cluster: 'americas', platform: 'na1', summoner: 'Usni#Boba' },
  { cluster: 'asia', platform: 'kr', summoner: 'DK Sharvel#KR1' },
  { cluster: 'sea', platform: 'sg2', summoner: 'Miss Lys#Lys' },
]

// ══════════════════════════════════════════════════════════════════════════════
// state management
// ══════════════════════════════════════════════════════════════════════════════

// per-region crawl state
interface RegionState {
  stack: string[]
  visited: Set<string>
  dry: Set<string>
  backtrack: string[]
  seedPool: Set<string>
}

const regionState = new Map<RegionalCluster, RegionState>()
const regionStats = new Map<RegionalCluster, { matches: number; lastUpdate: number }>()

// global state
const knownMatchIds = new Set<string>()
let totalMatchesScraped = 0
let startTime = Date.now()
let lastStatsFlush = Date.now()
let lastCleanup = Date.now()
let flushInProgress = false

// initialize region state
for (const region of REGIONS) {
  regionState.set(region, {
    stack: [],
    visited: new Set(),
    dry: new Set(),
    backtrack: [],
    seedPool: new Set(),
  })
  regionStats.set(region, { matches: 0, lastUpdate: Date.now() })
}

// ══════════════════════════════════════════════════════════════════════════════
// utility functions
// ══════════════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function trimSet<T>(set: Set<T>, maxSize: number): void {
  if (set.size <= maxSize) return
  const arr = Array.from(set)
  const toDelete = arr.slice(0, set.size - maxSize)
  toDelete.forEach(item => set.delete(item))
}

function trimArray<T>(arr: T[], maxSize: number): void {
  if (arr.length <= maxSize) return
  arr.splice(0, arr.length - maxSize)
}

// ══════════════════════════════════════════════════════════════════════════════
// stats flush and cleanup
// ══════════════════════════════════════════════════════════════════════════════

function maybeFlushStats(): void {
  if (flushInProgress) return

  const bufferCount = getStatsBufferCount()
  const now = Date.now()
  const timeSinceLastFlush = now - lastStatsFlush

  if (timeSinceLastFlush < STATS_FLUSH_COOLDOWN) return

  if (bufferCount >= STATS_BUFFER_FLUSH_SIZE || (timeSinceLastFlush > STATS_FLUSH_INTERVAL && bufferCount > 0)) {
    flushInProgress = true
    lastStatsFlush = now

    // non-blocking flush
    flushStatsBatch()
      .catch(err => console.error('[FLUSH] Background flush error:', err))
      .finally(() => { flushInProgress = false })
  }
}

async function maybeRunCleanup(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return

  console.log('[CRAWLER] Running scheduled database cleanup...')
  try {
    const { data, error } = await supabase.rpc('cleanup_champion_stats_noise')
    if (error) {
      console.error('[CRAWLER] Cleanup failed:', error)
    } else {
      console.log('[CRAWLER] Cleanup complete:', data)
    }
  } catch (err) {
    console.error('[CRAWLER] Cleanup error:', err)
  }
  lastCleanup = Date.now()
}

// ══════════════════════════════════════════════════════════════════════════════
// seeding functions
// ══════════════════════════════════════════════════════════════════════════════

function getRandomSeedsFromPool(region: RegionalCluster, count: number = 15): string[] {
  const state = regionState.get(region)!
  const available = Array.from(state.seedPool).filter(p => !state.visited.has(p) && !state.dry.has(p))

  if (available.length === 0) return []

  // shuffle and return
  const shuffled = available.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

async function fetchSeedsFromDB(region: RegionalCluster): Promise<string[]> {
  const prefixes = REGION_TO_PREFIXES[region]
  const state = regionState.get(region)!

  console.log(`[${region}] Fetching seeds from existing matches in DB...`)

  try {
    // get random matches from this region
    const shuffledPrefixes = prefixes.sort(() => Math.random() - 0.5)

    for (const prefix of shuffledPrefixes) {
      const { data: matches, error } = await supabase
        .from('matches')
        .select('match_id')
        .like('match_id', `${prefix}_%`)
        .in('patch', ACCEPTED_PATCHES)
        .order('game_creation', { ascending: false })
        .limit(50)

      if (error || !matches || matches.length === 0) continue

      // try up to 2 matches (save api calls)
      const shuffledMatches = matches.sort(() => Math.random() - 0.5).slice(0, 2)
      const allPuuids: string[] = []

      for (const match of shuffledMatches) {
        if (allPuuids.length >= 10) break

        try {
          await waitForRateLimit(region, 'batch')
          const matchData = await getMatchById(match.match_id, region, 'batch')

          if (matchData?.info?.participants) {
            const puuids = matchData.info.participants
              .map(p => p.puuid)
              .filter(p => p && !state.visited.has(p) && !state.dry.has(p))
            allPuuids.push(...puuids)
          }
        } catch {
          continue
        }
      }

      if (allPuuids.length > 0) {
        const uniquePuuids = [...new Set(allPuuids)]
        console.log(`[${region}] Found ${uniquePuuids.length} seeds from DB`)
        return uniquePuuids
      }
    }

    return []
  } catch (error) {
    console.error(`[${region}] Error fetching seeds from DB:`, error)
    return []
  }
}

async function tryGetSeeds(region: RegionalCluster): Promise<boolean> {
  const state = regionState.get(region)!

  // try seed pool first
  const poolSeeds = getRandomSeedsFromPool(region)
  if (poolSeeds.length > 0) {
    poolSeeds.forEach(p => state.stack.push(p))
    console.log(`[${region}] Added ${poolSeeds.length} seeds from pool`)
    return true
  }

  // try db
  const dbSeeds = await fetchSeedsFromDB(region)
  if (dbSeeds.length > 0) {
    dbSeeds.forEach(p => {
      state.stack.push(p)
      state.seedPool.add(p)
    })
    console.log(`[${region}] Added ${dbSeeds.length} seeds from DB`)
    return true
  }

  return false
}

function clearStaleState(region: RegionalCluster): void {
  const state = regionState.get(region)!

  // clear 80% of dry puuids
  if (state.dry.size > 50) {
    const toDelete = Array.from(state.dry).slice(0, Math.floor(state.dry.size * 0.8))
    toDelete.forEach(p => state.dry.delete(p))
    console.log(`[${region}] Cleared ${toDelete.length} dry entries`)
  }

  // clear 50% of visited to allow re-crawling
  if (state.visited.size > 50) {
    const toDelete = Array.from(state.visited).slice(0, Math.floor(state.visited.size * 0.5))
    toDelete.forEach(p => state.visited.delete(p))
    console.log(`[${region}] Cleared ${toDelete.length} visited entries`)
  }

  // re-queue seeds
  if (state.seedPool.size > 0) {
    const seeds = Array.from(state.seedPool).slice(0, 15)
    seeds.forEach(p => state.stack.push(p))
    console.log(`[${region}] Re-queued ${seeds.length} seeds`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// crawl functions
// ══════════════════════════════════════════════════════════════════════════════

async function crawlSummoner(
  puuid: string,
  region: RegionalCluster
): Promise<{ stored: number; discovered: string[]; isDry: boolean }> {
  const state = regionState.get(region)!

  try {
    // fetch matches from last 14 days
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const matchStartTime = Math.floor(twoWeeksAgo.getTime() / 1000)

    await waitForRateLimit(region, 'batch')
    const matchIds = await getMatchIdsByPuuid(puuid, region, 450, 100, 0, 'batch', matchStartTime)

    if (!matchIds || matchIds.length === 0) {
      return { stored: 0, discovered: [], isDry: true }
    }

    console.log(`  Found ${matchIds.length} matches for PUUID ${puuid.substring(0, 8)}`)

    // filter matches we already know about (in-memory cache)
    const potentiallyNewMatchIds = matchIds.filter((id: string) => !knownMatchIds.has(id))

    if (potentiallyNewMatchIds.length === 0) {
      console.log(`  All ${matchIds.length} matches already known (cache hit)`)
      return { stored: 0, discovered: [], isDry: true }
    }

    // check db in larger batches
    const existingIds = new Set<string>()
    for (let i = 0; i < potentiallyNewMatchIds.length; i += DB_CHECK_BATCH_SIZE) {
      const batch = potentiallyNewMatchIds.slice(i, i + DB_CHECK_BATCH_SIZE)
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('match_id')
        .in('match_id', batch)

      existingMatches?.forEach(m => existingIds.add(m.match_id))
    }

    // add all checked matches to cache
    potentiallyNewMatchIds.forEach(id => knownMatchIds.add(id))

    const newMatchIds = potentiallyNewMatchIds.filter((id: string) => !existingIds.has(id))
    console.log(`  ${newMatchIds.length} new matches, ${potentiallyNewMatchIds.length - newMatchIds.length} already in DB`)

    if (newMatchIds.length === 0) {
      return { stored: 0, discovered: [], isDry: true }
    }

    // fetch and store matches
    let stored = 0
    let skippedOldPatch = 0
    const discovered: string[] = []

    for (let i = 0; i < newMatchIds.length; i += MATCH_BATCH_SIZE) {
      const batch = newMatchIds.slice(i, i + MATCH_BATCH_SIZE)

      const results = await Promise.all(
        batch.map(async matchId => {
          try {
            await waitForRateLimit(region, 'batch')
            const matchData = await getMatchById(matchId, region, 'batch')
            return { matchId, matchData, error: null }
          } catch (error: any) {
            return { matchId, matchData: null, error }
          }
        })
      )

      const validMatches: any[] = []

      for (const { matchId, matchData, error } of results) {
        if (error) {
          if (error?.status === 429) {
            console.log(`[RIOT API] Rate limited on ${region}`)
            return { stored, discovered, isDry: false }
          }
          console.error(`  Error fetching match ${matchId}:`, error?.message || error)
          continue
        }

        if (!matchData) continue

        const matchPatch = extractPatch(matchData.info.gameVersion)

        if (!ACCEPTED_PATCHES.includes(matchPatch)) {
          skippedOldPatch++
          continue
        }

        // extract puuids from valid matches
        if (matchData.info?.participants) {
          const shouldAddToStack = state.stack.length < MAX_STACK_SIZE

          matchData.info.participants.forEach(p => {
            if (p.puuid && p.puuid !== puuid) {
              state.seedPool.add(p.puuid)

              if (shouldAddToStack && !state.visited.has(p.puuid) && !state.dry.has(p.puuid)) {
                discovered.push(p.puuid)
              }
            }
          })

          // trim seed pool if too large
          trimSet(state.seedPool, MAX_SEED_POOL)

          validMatches.push(matchData)
        }
      }

      if (validMatches.length > 0) {
        const { success, storedCount } = await storeMatchDataBatch(validMatches, region, false)
        if (success) {
          stored += storedCount
          validMatches.forEach(m => knownMatchIds.add(m.metadata.matchId))
        }
        // small delay between batches
        await sleep(200)
      }

      maybeFlushStats()
    }

    if (stored > 0 || skippedOldPatch > 0) {
      console.log(`  Completed: ${stored} matches stored${skippedOldPatch > 0 ? `, ${skippedOldPatch} skipped (old patch)` : ''}`)
    }

    return { stored, discovered: [...new Set(discovered)], isDry: false }
  } catch (error: any) {
    if (error?.status === 429) {
      console.log(`[RIOT API] Rate limited on ${region}`)
    } else {
      console.error(`Error crawling puuid ${puuid.substring(0, 8)}...:`, error?.message || error)
    }
    return { stored: 0, discovered: [], isDry: false }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// state persistence
// ══════════════════════════════════════════════════════════════════════════════

const STATE_FILE = path.join(__dirname, 'scraper-state.json')
const MATCH_CACHE_FILE = path.join(__dirname, 'match-cache.json')

interface SavedState {
  stacks: Record<string, string[]>
  visited: Record<string, string[]>
  backtrack: Record<string, string[]>
  dry: Record<string, string[]>
  seedPool: Record<string, string[]>
  lastPatch?: string
}

function loadState(): SavedState | null {
  if (!existsSync(STATE_FILE) || process.argv.includes('--reset')) {
    console.log('[CRAWLER] Starting with fresh state')
    return null
  }

  try {
    const data = readFileSync(STATE_FILE, 'utf-8')
    const state = JSON.parse(data)
    console.log('[CRAWLER] Loaded state from scraper-state.json')
    return state
  } catch {
    console.log('[CRAWLER] Failed to load state, starting fresh')
    return null
  }
}

function saveState(): void {
  const state: SavedState = {
    stacks: {},
    visited: {},
    backtrack: {},
    dry: {},
    seedPool: {},
    lastPatch: ACCEPTED_PATCHES[0],
  }

  for (const region of REGIONS) {
    const rs = regionState.get(region)!
    state.stacks[region] = rs.stack
    state.visited[region] = Array.from(rs.visited).slice(-MAX_VISITED)
    state.backtrack[region] = rs.backtrack
    state.dry[region] = Array.from(rs.dry).slice(-MAX_DRY_PUUIDS)
    state.seedPool[region] = Array.from(rs.seedPool).slice(-MAX_SEED_POOL)
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function loadMatchCache(): void {
  if (!existsSync(MATCH_CACHE_FILE)) {
    console.log('[CRAWLER] No match cache file found')
    return
  }

  try {
    const data = readFileSync(MATCH_CACHE_FILE, 'utf-8')
    const cache = JSON.parse(data)
    cache.forEach((id: string) => knownMatchIds.add(id))
    console.log(`[CRAWLER] Loaded ${knownMatchIds.size} known match IDs from cache`)
  } catch (error) {
    console.error('[CRAWLER] Error loading match cache:', error)
  }
}

function saveMatchCache(): void {
  try {
    // only save most recent matches
    const cache = Array.from(knownMatchIds).slice(-MAX_KNOWN_MATCHES)
    writeFileSync(MATCH_CACHE_FILE, JSON.stringify(cache))
  } catch (error) {
    console.error('[CRAWLER] Error saving match cache:', error)
  }
}

function restoreState(savedState: SavedState): void {
  for (const region of REGIONS) {
    const state = regionState.get(region)!

    if (savedState.stacks[region]) {
      state.stack = savedState.stacks[region]
    }
    if (savedState.visited[region]) {
      savedState.visited[region].forEach(p => state.visited.add(p))
    }
    if (savedState.backtrack?.[region]) {
      state.backtrack = savedState.backtrack[region]
    }
    if (savedState.dry?.[region]) {
      savedState.dry[region].forEach(p => state.dry.add(p))
    }
    if (savedState.seedPool?.[region]) {
      savedState.seedPool[region].forEach(p => state.seedPool.add(p))
    }
  }

  // patch change detection - clear dry and visited when patch changes
  if (savedState.lastPatch && savedState.lastPatch !== ACCEPTED_PATCHES[0]) {
    console.log(`\n[CRAWLER] Patch change detected: ${savedState.lastPatch} -> ${ACCEPTED_PATCHES[0]}`)
    console.log('[CRAWLER] Clearing dry and visited sets...')

    for (const region of REGIONS) {
      const state = regionState.get(region)!
      state.dry.clear()
      state.visited.clear()
    }
  }
}


// region crawler
async function runRegionCrawler(region: RegionalCluster): Promise<void> {
  const state = regionState.get(region)!
  const stats = regionStats.get(region)!

  let consecutiveDry = 0
  let consecutiveBacktracks = 0
  let lastBacktrackPuuid: string | null = null

  while (true) {
    try {
      // handle empty stack
      if (state.stack.length === 0) {
        // try backtracking first
        const validBacktracks = state.backtrack.filter(p => !state.dry.has(p))

        if (validBacktracks.length > 0 && consecutiveBacktracks < 15) {
          // pick random backtrack point
          let backtrackPuuid: string
          let attempts = 0
          do {
            const idx = Math.floor(Math.random() * validBacktracks.length)
            backtrackPuuid = validBacktracks[idx]
            attempts++
          } while (backtrackPuuid === lastBacktrackPuuid && attempts < 5 && validBacktracks.length > 1)

          console.log(`[${region}] Backtracking to ${backtrackPuuid.substring(0, 8)}...`)
          state.stack.push(backtrackPuuid)
          state.visited.delete(backtrackPuuid)
          lastBacktrackPuuid = backtrackPuuid
          consecutiveBacktracks++
          continue
        }

        // backtrack exhausted, try seeding
        consecutiveBacktracks = 0

        if (await tryGetSeeds(region)) {
          continue
        }

        // if no seeds, clear state and wait
        console.log(`[${region}] No seeds available, clearing stale state and waiting...`)
        clearStaleState(region)
        await sleep(15000)
        continue
      }

      consecutiveBacktracks = 0

      // pop next puuid
      const puuid = state.stack.pop()!

      // skip if already visited or dry
      if (state.visited.has(puuid) || state.dry.has(puuid)) {
        continue
      }

      console.log(`[${region}] Crawling ${puuid.substring(0, 8)}... (stack: ${state.stack.length}, visited: ${state.visited.size}, dry: ${state.dry.size})`)

      const { stored, discovered, isDry } = await crawlSummoner(puuid, region)

      state.visited.add(puuid)

      if (isDry) {
        state.dry.add(puuid)
        consecutiveDry++

        // trim dry set
        trimSet(state.dry, MAX_DRY_PUUIDS)

        // clear backtrack if too many consecutive dry
        if (consecutiveDry >= 15 && state.backtrack.length > 30) {
          state.backtrack.length = 0
          console.log(`[${region}] Cleared backtrack history due to consecutive dry`)
          consecutiveDry = 0
        }
        continue
      }

      consecutiveDry = 0

      // add to backtrack history
      state.backtrack.push(puuid)
      trimArray(state.backtrack, MAX_BACKTRACK_HISTORY)

      // update stats
      if (stored > 0) {
        totalMatchesScraped += stored
        stats.matches += stored
        stats.lastUpdate = Date.now()
        console.log(`[${region}] +${stored} matches | Region: ${stats.matches} | Total: ${totalMatchesScraped}`)
      }

      // push discovered puuids
      if (discovered.length > 0) {
        console.log(`  -> Discovered ${discovered.length} new summoners`)
        for (let i = discovered.length - 1; i >= 0; i--) {
          if (!state.visited.has(discovered[i]) && !state.dry.has(discovered[i])) {
            state.stack.push(discovered[i])
          }
        }

        // prune stack if too large
        if (state.stack.length > MAX_STACK_SIZE * 1.5) {
          const pruneCount = Math.floor(state.stack.length * 0.4)
          state.stack.splice(0, pruneCount)
          console.log(`  -> Pruned ${pruneCount} from stack`)
        }
      }

      // trim visited set
      trimSet(state.visited, MAX_VISITED)

      // trim known matches cache
      trimSet(knownMatchIds, MAX_KNOWN_MATCHES)

    } catch (error: any) {
      console.error(`[${region}] Crawler error:`, error?.message || error)
    }
  }
}


// stats logger
async function runStatsLogger(): Promise<void> {
  while (true) {
    await sleep(300000) // every 5 minutes

    const runtime = Date.now() - startTime
    const avgRate = totalMatchesScraped / (runtime / 1000 / 60)

    console.log(`\n=== Summary (${formatDuration(runtime)}) ===`)
    console.log(`Patches: ${ACCEPTED_PATCHES.join(', ')} | Total: ${totalMatchesScraped} | Rate: ${avgRate.toFixed(1)}/min`)
    console.log(`Stats buffer: ${getStatsBufferCount()} pending | Match cache: ${knownMatchIds.size}`)

    let totalInStacks = 0
    let totalVisited = 0
    let totalDry = 0

    for (const region of REGIONS) {
      const state = regionState.get(region)!
      const stats = regionStats.get(region)!

      totalInStacks += state.stack.length
      totalVisited += state.visited.size
      totalDry += state.dry.size

      if (state.stack.length > 0 || state.visited.size > 0) {
        const regionRate = stats.matches / (runtime / 1000 / 60)
        const hitRate = state.visited.size > 0 ? (((state.visited.size - state.dry.size) / state.visited.size) * 100).toFixed(0) : '0'
        console.log(`[${region.toUpperCase()}] Stack: ${state.stack.length} | Visited: ${state.visited.size} | Dry: ${state.dry.size} (${hitRate}% productive) | Matches: ${stats.matches} (${regionRate.toFixed(1)}/min)`)
      }
    }

    console.log(`Totals: ${totalInStacks} in stacks | ${totalVisited} visited | ${totalDry} dry`)
    console.log()

    maybeFlushStats()
    await maybeRunCleanup()
    saveState()
  }
}


// main
async function main(): Promise<void> {
  console.log('[CRAWLER] Starting continuous scraper...')
  console.log('[CRAWLER] Press Ctrl+C to stop\n')

  console.log('[CRAWLER] Environment check:')
  console.log('[CRAWLER] - RIOT_API_KEY:', process.env.RIOT_API_KEY ? 'loaded' : 'MISSING')
  console.log('[CRAWLER] - SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'loaded' : 'MISSING')
  console.log('[CRAWLER] - SUPABASE_KEY:', process.env.SUPABASE_SECRET_KEY ? 'loaded' : 'MISSING')
  console.log()

  console.log(`[CRAWLER] Accepting patches: ${ACCEPTED_PATCHES.join(', ')}\n`)

  loadMatchCache()

  const savedState = loadState()

  if (savedState) {
    restoreState(savedState)

    // show restored state
    let totalStack = 0
    let totalVisited = 0
    let totalDry = 0
    let totalSeedPool = 0

    for (const region of REGIONS) {
      const state = regionState.get(region)!
      totalStack += state.stack.length
      totalVisited += state.visited.size
      totalDry += state.dry.size
      totalSeedPool += state.seedPool.size
    }

    console.log(`[CRAWLER] Resuming: ${totalStack} in stacks, ${totalVisited} visited, ${totalDry} dry, ${totalSeedPool} in seed pool`)

    for (const region of REGIONS) {
      const state = regionState.get(region)!
      if (state.stack.length > 0 || state.visited.size > 0) {
        console.log(`  ${region}: stack=${state.stack.length}, visited=${state.visited.size}, dry=${state.dry.size}, seedPool=${state.seedPool.size}`)
      }
    }
    console.log()
  } else {
    // need to seed
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || !process.stdin.isTTY

    if (isCI) {
      console.log('[CRAWLER] Using default seed summoners (CI mode)...\n')
    } else {
      console.log('[CRAWLER] No existing state. Enter seed summoners (or press Enter for defaults):\n')
    }

    for (const { cluster, platform, summoner: defaultSummoner } of DEFAULT_SEEDS) {
      let summonerInput = defaultSummoner

      if (!isCI) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const answer = await new Promise<string>(resolve => {
          rl.question(`${cluster.toUpperCase()} (${platform}) [${defaultSummoner}]: `, ans => {
            rl.close()
            resolve(ans.trim())
          })
        })
        if (answer) summonerInput = answer
      }

      const parts = summonerInput.split('#')
      if (parts.length !== 2) {
        console.log(`[CRAWLER] Invalid format for ${cluster}, using default`)
        continue
      }

      try {
        console.log(`[CRAWLER] Looking up ${summonerInput} on ${platform}...`)
        const data = await getSummonerByRiotId(parts[0], parts[1], platform)
        if (data) {
          regionState.get(cluster)!.stack.push(data.summoner.puuid)
          console.log(`[CRAWLER] Added ${summonerInput} to ${cluster}`)
        } else {
          console.log(`[CRAWLER] ${summonerInput} not found`)
        }
      } catch (error: any) {
        console.error(`[CRAWLER] Error looking up ${summonerInput}:`, error?.message || error)
      }
    }

    console.log()
  }

  // check we have something to crawl
  const totalStack = Array.from(regionState.values()).reduce((sum, s) => sum + s.stack.length, 0)
  if (totalStack === 0) {
    console.log('[CRAWLER] No seeds available. Exiting.')
    process.exit(0)
  }

  startTime = Date.now()

  // run crawlers in parallel
  await Promise.all([
    ...REGIONS.map(region => runRegionCrawler(region)),
    runStatsLogger(),
  ])
}

// ══════════════════════════════════════════════════════════════════════════════
// shutdown handlers
// ══════════════════════════════════════════════════════════════════════════════

async function shutdown(): Promise<void> {
  console.log('\n\n[CRAWLER] Shutting down gracefully...')
  console.log('[CRAWLER] Flushing stats buffer...')
  await flushStatsBatch()
  console.log('[CRAWLER] Flushing rate limits...')
  await flushRateLimits()
  console.log('[CRAWLER] Saving state...')
  saveState()
  saveMatchCache()
  console.log('[CRAWLER] Done.')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch(error => {
  console.error('[CRAWLER] Fatal error:', error)
  process.exit(1)
})
