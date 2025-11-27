// Environment variables are loaded by load-env.ts (see package.json scripts)
import { writeFileSync, readFileSync, existsSync } from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { getMatchById, getMatchIdsByPuuid, getSummonerByRiotId } from '../src/lib/riot-api'
import { waitForRateLimit } from '../src/lib/rate-limiter'
import { type RegionalCluster, type PlatformCode } from '../src/lib/regions'
import { storeMatchData, flushStatsBatch, getStatsBufferCount } from '../src/lib/match-storage'
import { extractPatch } from '../src/lib/patch-utils'
import * as readline from 'readline'

console.log('[CRAWLER] All modules loaded successfully\n')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('[CRAWLER] Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Accept only patch 25.23
const ACCEPTED_PATCHES = ['25.23']

async function getCurrentPatch(): Promise<string[]> {
  return ACCEPTED_PATCHES
}

// Stats buffer config - buffer lives in match-storage.ts, we just trigger flushes
const STATS_BUFFER_FLUSH_SIZE = 30 // flush every 30 participants (3 matches) - smaller batches to avoid DB timeout
let lastStatsFlush = Date.now()
const STATS_FLUSH_INTERVAL = 20000 // or every 20 seconds

// Check if stats buffer should be flushed (using match-storage's buffer)
async function maybeFlushStats(): Promise<void> {
  const bufferCount = getStatsBufferCount()
  const now = Date.now()
  if (bufferCount >= STATS_BUFFER_FLUSH_SIZE || (now - lastStatsFlush > STATS_FLUSH_INTERVAL && bufferCount > 0)) {
    await flushStatsBatch()
    lastStatsFlush = Date.now()
  }
}

// DFS state per region: stack of PUUIDs to crawl
const crawlStackByRegion = new Map<RegionalCluster, string[]>([
  ['europe', []],
  ['americas', []],
  ['asia', []],
  ['sea', []]
])

// Track visited PUUIDs to avoid cycles
const visitedPuuidsByRegion = new Map<RegionalCluster, Set<string>>([
  ['europe', new Set()],
  ['americas', new Set()],
  ['asia', new Set()],
  ['sea', new Set()]
])

// Track "dry" PUUIDs (players with no recent ARAM matches) - avoid re-visiting them
const dryPuuidsByRegion = new Map<RegionalCluster, Set<string>>([
  ['europe', new Set()],
  ['americas', new Set()],
  ['asia', new Set()],
  ['sea', new Set()]
])

// Track backtrack history for random backtracking
const backtrackHistoryByRegion = new Map<RegionalCluster, string[]>([
  ['europe', []],
  ['americas', []],
  ['asia', []],
  ['sea', []]
])

// Cache: known match IDs (avoid redundant DB queries)
const knownMatchIds = new Set<string>()

// Seed pool: all PUUIDs discovered from matches (for re-seeding when stuck)
const seedPoolByRegion = new Map<RegionalCluster, Set<string>>([
  ['europe', new Set()],
  ['americas', new Set()],
  ['asia', new Set()],
  ['sea', new Set()]
])

// map platforms to regional clusters
const PLATFORM_TO_REGION: Record<string, RegionalCluster> = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea'
}

// reverse mapping: regional cluster to platform prefixes for match ID filtering
const REGION_TO_PREFIXES: Record<RegionalCluster, string[]> = {
  americas: ['NA1', 'BR1', 'LA1', 'LA2'],
  europe: ['EUW1', 'EUN1', 'TR1', 'RU'],
  asia: ['KR', 'JP1'],
  sea: ['OC1', 'SG2', 'TW2', 'VN2', 'PH2', 'TH2']
}

// Get random seeds from the seed pool (PUUIDs we've seen from matches)
function getRandomSeedsFromPool(region: RegionalCluster): string[] {
  const seedPool = seedPoolByRegion.get(region)!
  const visited = visitedPuuidsByRegion.get(region)!
  const dryPuuids = dryPuuidsByRegion.get(region)!
  
  // Filter to unvisited, non-dry PUUIDs
  const available = Array.from(seedPool).filter(p => !visited.has(p) && !dryPuuids.has(p))
  
  if (available.length === 0) {
    console.log(`[${region}] Seed pool exhausted (${seedPool.size} total, all visited/dry)`)
    return []
  }
  
  // Shuffle and return up to 20 seeds
  const shuffled = available.sort(() => Math.random() - 0.5)
  const seeds = shuffled.slice(0, Math.min(20, shuffled.length))
  
  console.log(`[${region}] Got ${seeds.length} seeds from pool (${available.length} available, ${seedPool.size} total)`)
  return seeds
}

// Fetch PUUIDs from existing matches in DB for a region
// Gets match IDs from DB, then fetches ONE match from Riot API to get participants
// This is a last resort - uses 1 API call to get 9 new PUUIDs
async function fetchSeedsFromDB(region: RegionalCluster): Promise<string[]> {
  const acceptedPatches = await getCurrentPatch()
  const prefixes = REGION_TO_PREFIXES[region]
  const visited = visitedPuuidsByRegion.get(region)!
  const dryPuuids = dryPuuidsByRegion.get(region)!
  
  console.log(`[${region}] Fetching seeds from existing matches in DB (1 API call)...`)
  
  try {
    // get a random match from this region's prefixes
    const shuffledPrefixes = prefixes.sort(() => Math.random() - 0.5)
    
    for (const prefix of shuffledPrefixes) {
      // query for recent matches, pick a random one
      const { data: matches, error } = await supabase
        .from('matches')
        .select('match_id')
        .like('match_id', `${prefix}_%`)
        .in('patch', acceptedPatches)
        .order('game_creation', { ascending: false })
        .limit(20)
      
      if (error || !matches || matches.length === 0) continue
      
      // pick a random match
      const randomMatch = matches[Math.floor(Math.random() * matches.length)]
      
      // fetch just this one match from Riot API
      await waitForRateLimit(region, 'batch')
      const matchData = await getMatchById(randomMatch.match_id, region)
      
      if (matchData?.info?.participants) {
        const puuids = matchData.info.participants
          .map(p => p.puuid)
          .filter(p => p && !visited.has(p) && !dryPuuids.has(p))
        
        if (puuids.length > 0) {
          console.log(`[${region}] Found ${puuids.length} seeds from DB match`)
          return puuids
        }
      }
    }
    
    console.log(`[${region}] No unvisited PUUIDs found from DB matches`)
    return []
  } catch (error) {
    console.error(`[${region}] Error fetching seeds from DB:`, error)
    return []
  }
}

// DFS crawler: process a summoner and return discovered summoners
async function crawlSummoner(puuid: string, region: RegionalCluster): Promise<{ stored: number; discovered: string[]; isDry: boolean }> {
  try {
    const acceptedPatches = await getCurrentPatch()
    const discovered: string[] = []
    const dryPuuids = dryPuuidsByRegion.get(region)!
    
    // Fetch matches from last 14 days for maximum data collection
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const startTime = Math.floor(twoWeeksAgo.getTime() / 1000)
    
    await waitForRateLimit(region, 'batch')
    const matchIds = await getMatchIdsByPuuid(puuid, region, 450, 100, 0, 'batch', startTime)
    
    // Skip if no recent ARAM matches - mark as dry
    if (!matchIds || matchIds.length === 0) {
      return { stored: 0, discovered: [], isDry: true }
    }
    
    console.log(`  Found ${matchIds.length} matches for PUUID ${puuid.substring(0, 8)}`)
    
    // Filter out matches we already know about (in-memory cache)
    const potentiallyNewMatchIds = matchIds.filter((id: string) => !knownMatchIds.has(id))
    
    // Only query DB for matches not in cache
    let newMatchIds: string[] = []
    if (potentiallyNewMatchIds.length === 0) {
      // All matches are in cache - this player is "exhausted" (all matches already scraped)
      // Don't waste API calls discovering from their matches
      console.log(`  All ${matchIds.length} matches already known (cache hit) - player exhausted`)
      return { stored: 0, discovered: [], isDry: true }
    } else {
      console.log(`  ${potentiallyNewMatchIds.length} potentially new, checking DB...`)
      
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('match_id')
        .in('match_id', potentiallyNewMatchIds)
      
      const existingIds = new Set(existingMatches?.map(m => m.match_id) || [])
      // Add all checked matches to cache (existing and new)
      potentiallyNewMatchIds.forEach(id => knownMatchIds.add(id))
      
      newMatchIds = potentiallyNewMatchIds.filter((id: string) => !existingIds.has(id))
    }
    
    console.log(`  ${newMatchIds.length} new matches, ${matchIds.length - newMatchIds.length} already in DB`)
    
    // If no new matches after DB check, player is exhausted
    if (newMatchIds.length === 0 && matchIds.length > 0) {
      console.log(`  Player exhausted - all matches already in DB`)
      return { stored: 0, discovered: [], isDry: true }
    }
    
    // For new matches: fetch them to discover PUUIDs, but only store if they're from current patch
    let stored = 0
    let skippedOldPatch = 0
    
    // Process matches in parallel batches
    // With 50% throttle (50 req/2min), use smaller batches to avoid rate limit waits
    // Each match = 1 API call (match data), so batch of 5 = 5 calls
    const THROTTLE = parseInt(process.env.SCRAPER_THROTTLE || '100', 10)
    const BATCH_SIZE = THROTTLE <= 50 ? 3 : 10
    for (let i = 0; i < newMatchIds.length; i += BATCH_SIZE) {
      const batch = newMatchIds.slice(i, i + BATCH_SIZE)
      
      const results = await Promise.all(
        batch.map(async (matchId) => {
          try {
            await waitForRateLimit(region, 'batch')
            const matchData = await getMatchById(matchId, region, 'batch')
            return { matchId, matchData, error: null }
          } catch (error: any) {
            return { matchId, matchData: null, error }
          }
        })
      )
      
      for (const { matchId, matchData, error } of results) {
        if (error) {
          if (error?.status === 429) {
            console.log(`  Rate limited by Riot API, skipping remaining matches`)
            return { stored, discovered, isDry: false }
          }
          console.error(`  Error fetching match ${matchId}:`, error?.message || error)
          continue
        }
        
        if (!matchData) continue
        
        const matchPatch = extractPatch(matchData.info.gameVersion)
        
        // Filter: only process matches from accepted patches
        if (!acceptedPatches.includes(matchPatch)) {
          skippedOldPatch++
          continue
        }
        
        // Extract PUUIDs from valid patch matches
        if (matchData.info?.participants) {
          const currentStack = crawlStackByRegion.get(region)
          const shouldAddToStack = !currentStack || currentStack.length < 50
          const seedPool = seedPoolByRegion.get(region)!
          
          matchData.info.participants.forEach(p => {
            if (p.puuid && p.puuid !== puuid) {
              // Always add to seed pool for future re-seeding
              seedPool.add(p.puuid)
              
              // Only add to discovered (for immediate stack) if stack is low
              if (shouldAddToStack && !visitedPuuidsByRegion.get(region)?.has(p.puuid) && !dryPuuids.has(p.puuid)) {
                discovered.push(p.puuid)
              }
            }
          })
          
          // Limit seed pool size to prevent memory bloat
          if (seedPool.size > 50000) {
            const toDelete = Array.from(seedPool).slice(0, 10000)
            toDelete.forEach(p => seedPool.delete(p))
          }
          
          // Store match with batchStats=true (stats buffered in match-storage)
          const result = await storeMatchData(matchData, region, false, true)
          if (result.success) {
            stored++
            // Add to cache after successful storage
            knownMatchIds.add(matchId)
          }
        }
      }
      
      // Check if we should flush stats buffer
      await maybeFlushStats()
    }
    
    if (stored > 0 || skippedOldPatch > 0) {
      console.log(`  Completed: ${stored} matches stored${skippedOldPatch > 0 ? `, ${skippedOldPatch} skipped (old patch)` : ''}`)
    }
    
    // Return unique discovered PUUIDs
    return { stored, discovered: [...new Set(discovered)], isDry: false }
  } catch (error: any) {
    if (error?.status === 429) {
      console.log(`  Rate limited fetching match list`)
    } else {
      console.error(`Error crawling puuid ${puuid.substring(0, 8)}...:`, error?.message || error)
    }
    return { stored: 0, discovered: [], isDry: false }
  }
}

// State file path
const STATE_FILE = path.join(__dirname, 'scraper-state.json')

// Load or initialize state
function loadState(): { stacks: Record<string, string[]>, visited: Record<string, string[]>, backtrackHistory: Record<string, string[]>, dry: Record<string, string[]>, seedPool: Record<string, string[]> } {
  if (existsSync(STATE_FILE) && !process.argv.includes('--reset')) {
    try {
      const data = readFileSync(STATE_FILE, 'utf-8')
      const state = JSON.parse(data)
      console.log('[CRAWLER] Loaded state from scraper-state.json')
      return { ...state, dry: state.dry || {}, seedPool: state.seedPool || {} }
    } catch (error) {
      console.log('[CRAWLER] Failed to load state, starting fresh')
    }
  }
  console.log('[CRAWLER] Starting with fresh state')
  return { stacks: {}, visited: {}, backtrackHistory: {}, dry: {}, seedPool: {} }
}

// Save state
function saveState() {
  const state = {
    stacks: {
      europe: crawlStackByRegion.get('europe')!,
      americas: crawlStackByRegion.get('americas')!,
      asia: crawlStackByRegion.get('asia')!,
      sea: crawlStackByRegion.get('sea')!
    },
    visited: {
      europe: Array.from(visitedPuuidsByRegion.get('europe')!),
      americas: Array.from(visitedPuuidsByRegion.get('americas')!),
      asia: Array.from(visitedPuuidsByRegion.get('asia')!),
      sea: Array.from(visitedPuuidsByRegion.get('sea')!)
    },
    backtrackHistory: {
      europe: backtrackHistoryByRegion.get('europe')!,
      americas: backtrackHistoryByRegion.get('americas')!,
      asia: backtrackHistoryByRegion.get('asia')!,
      sea: backtrackHistoryByRegion.get('sea')!
    },
    dry: {
      europe: Array.from(dryPuuidsByRegion.get('europe')!).slice(-5000),
      americas: Array.from(dryPuuidsByRegion.get('americas')!).slice(-5000),
      asia: Array.from(dryPuuidsByRegion.get('asia')!).slice(-5000),
      sea: Array.from(dryPuuidsByRegion.get('sea')!).slice(-5000)
    },
    seedPool: {
      europe: Array.from(seedPoolByRegion.get('europe')!).slice(-10000),
      americas: Array.from(seedPoolByRegion.get('americas')!).slice(-10000),
      asia: Array.from(seedPoolByRegion.get('asia')!).slice(-10000),
      sea: Array.from(seedPoolByRegion.get('sea')!).slice(-10000)
    }
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// Cache file paths
const MATCH_CACHE_FILE = path.join(__dirname, 'match-cache.json')

// Initialize match ID cache from file (much faster than DB)
function loadMatchCache() {
  if (existsSync(MATCH_CACHE_FILE)) {
    try {
      const data = readFileSync(MATCH_CACHE_FILE, 'utf-8')
      const cache = JSON.parse(data)
      cache.forEach((id: string) => knownMatchIds.add(id))
      console.log(`[CRAWLER] Loaded ${knownMatchIds.size} known match IDs from cache file`)
    } catch (error) {
      console.error('[CRAWLER] Error loading match cache file:', error)
    }
  } else {
    console.log('[CRAWLER] No match cache file found, starting fresh')
  }
}

// Save match cache to file
function saveMatchCache() {
  try {
    const cache = Array.from(knownMatchIds)
    writeFileSync(MATCH_CACHE_FILE, JSON.stringify(cache))
  } catch (error) {
    console.error('[CRAWLER] Error saving match cache:', error)
  }
}

async function main() {
  console.log('[CRAWLER] Starting continuous scraper (current patch only)...')
  console.log('[CRAWLER] Press Ctrl+C to stop\n')
  

  // idk why sometimes env.local just dont worky
  console.log('[CRAWLER] Environment check:')
  console.log('[CRAWLER] - RIOT_API_KEY:', process.env.RIOT_API_KEY ? 'loaded' : 'MISSING')
  console.log('[CRAWLER] - SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'loaded' : 'MISSING')
  console.log('[CRAWLER] - SUPABASE_KEY:', process.env.SUPABASE_SECRET_KEY ? 'loaded' : 'MISSING')
  console.log()
  
  const acceptedPatches = await getCurrentPatch()
  console.log(`[CRAWLER] Accepting patches: ${acceptedPatches.join(', ')}\n`)
  
  // Load match cache from file
  loadMatchCache()
  
  // Load saved state first to check if we have existing crawl data
  const savedState = loadState()
  
  // Restore stacks, visited sets, dry sets, seed pools, and backtrack history from saved state
  for (const region of ['europe', 'americas', 'asia', 'sea'] as RegionalCluster[]) {
    if (savedState.stacks[region]) {
      crawlStackByRegion.set(region, savedState.stacks[region])
    }
    if (savedState.visited[region]) {
      savedState.visited[region].forEach((p: string) => visitedPuuidsByRegion.get(region)!.add(p))
    }
    if (savedState.backtrackHistory[region]) {
      backtrackHistoryByRegion.set(region, savedState.backtrackHistory[region])
    }
    if (savedState.dry && savedState.dry[region]) {
      savedState.dry[region].forEach((p: string) => dryPuuidsByRegion.get(region)!.add(p))
    }
    if (savedState.seedPool && savedState.seedPool[region]) {
      savedState.seedPool[region].forEach((p: string) => seedPoolByRegion.get(region)!.add(p))
    }
  }
  
  // Check if we have existing state to resume from
  const existingStackSize = Array.from(crawlStackByRegion.values()).reduce((sum, stack) => sum + stack.length, 0)
  const existingVisited = Array.from(visitedPuuidsByRegion.values()).reduce((sum, set) => sum + set.size, 0)
  const existingSeedPool = Array.from(seedPoolByRegion.values()).reduce((sum, set) => sum + set.size, 0)
  const hasExistingState = existingStackSize > 0 || existingVisited > 0 || existingSeedPool > 0
  
  const seedPuuidsByRegion = new Map<RegionalCluster, Set<string>>([
    ['europe', new Set()],
    ['americas', new Set()],
    ['asia', new Set()],
    ['sea', new Set()]
  ])
  
  // Only ask for seed summoners if starting fresh (no existing state)
  if (!hasExistingState) {
    const clusterPlatforms: Array<{ cluster: RegionalCluster; platform: PlatformCode; default?: string }> = [
      { cluster: 'europe', platform: 'euw1', default: 'TwTv Yikesu0#Yikes' },
      { cluster: 'americas', platform: 'na1', default: 'Usni#Boba' },
      { cluster: 'asia', platform: 'kr', default: 'Eren#미카사' },
      { cluster: 'sea', platform: 'sg2', default: 'Miss Lys#Lys'},
    ]
    
    // Check if running in CI/non-interactive mode
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || !process.stdin.isTTY
    
    const summonerInputs: Array<{ cluster: RegionalCluster; platform: PlatformCode; gameName: string; tagLine: string }> = []
    
    if (isCI) {
      // Non-interactive mode: use all defaults automatically
      console.log('[CRAWLER] No existing state found, using default seed summoners (CI mode)...\n')
      
      for (const { cluster, platform, default: defaultSummoner } of clusterPlatforms) {
        if (defaultSummoner) {
          const parts = defaultSummoner.split('#')
          if (parts.length === 2) {
            summonerInputs.push({
              cluster,
              platform,
              gameName: parts[0],
              tagLine: parts[1]
            })
            console.log(`[CRAWLER] Using default for ${cluster}: ${defaultSummoner}`)
          }
        }
      }
    } else {
      // Interactive mode: prompt for summoner names
      console.log('[CRAWLER] No existing state found, need seed summoners.')
      console.log('[CRAWLER] Please provide a seed summoner for each cluster (or press Enter to use default/skip):\n')
      
      for (const { cluster, platform, default: defaultSummoner } of clusterPlatforms) {
        const promptText = defaultSummoner 
          ? `Enter summoner for ${cluster.toUpperCase()} (${platform.toUpperCase()}) [default: ${defaultSummoner}]: `
          : `Enter summoner for ${cluster.toUpperCase()} (${platform.toUpperCase()}) or press Enter to skip: `
        
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        })
        
        const answer = await new Promise<string>((resolve) => {
          rl.question(promptText, (ans) => {
            rl.close()
            resolve(ans)
          })
        })
        
        let summonerInput = answer.trim()
        
        // use default if available and no input provided
        if (!summonerInput && defaultSummoner) {
          summonerInput = defaultSummoner
          console.log(`Using default: ${defaultSummoner}`)
        }
        
        if (summonerInput) {
          const parts = summonerInput.split('#')
          if (parts.length !== 2) {
            console.log('[CRAWLER] Invalid format. Please use GameName#TAG\n')
            continue
          }
          
          summonerInputs.push({
            cluster,
            platform,
            gameName: parts[0],
            tagLine: parts[1]
          })
        } else {
          console.log(`Skipped ${cluster}\n`)
        }
      }
    }
    
    // sequential region scrape 
    if (summonerInputs.length > 0) {
      console.log('\n[CRAWLER] Looking up summoners...\n')
      
      for (const { cluster, platform, gameName, tagLine } of summonerInputs) {
        try {
          console.log(`[CRAWLER] Looking up ${gameName}#${tagLine} on ${platform}...`)
          const summonerData = await getSummonerByRiotId(gameName, tagLine, platform)
          
          if (summonerData) {
            seedPuuidsByRegion.get(cluster)?.add(summonerData.summoner.puuid)
            console.log(`[CRAWLER] Added ${gameName}#${tagLine} to ${cluster} pool`)
          } else {
            console.log(`[CRAWLER] ${gameName}#${tagLine} not found on ${platform}`)
          }
        } catch (error: any) {
          console.error(`[CRAWLER] Error looking up ${gameName}#${tagLine}:`, error?.message || error)
        }
      }
      
      console.log()
    }
    
    // check for 1 puuid when starting fresh
    const totalSeeds = Array.from(seedPuuidsByRegion.values()).reduce((sum, set) => sum + set.size, 0)
    if (totalSeeds === 0) {
      console.log('[CRAWLER] No seed summoners provided. Exiting.')
      process.exit(0)
    }
    
    console.log(`\n[CRAWLER] Starting scraper with ${totalSeeds} seed summoner(s)`)
    console.log('[CRAWLER] Clusters configured:')
    for (const [region, puuids] of seedPuuidsByRegion) {
      if (puuids.size > 0) {
        console.log(`  ${region}: ${puuids.size} seed(s)`)
      }
    }
    console.log()
    
    // Push seed puuids onto stacks
    for (const [region, seeds] of seedPuuidsByRegion) {
      const stack = crawlStackByRegion.get(region)!
      seeds.forEach(p => stack.push(p))
      if (seeds.size > 0) {
        console.log(`[${region}] Initialized stack with ${seeds.size} seed(s)`)
      }
    }
  } else {
    // Resuming from existing state
    const totalDryRestored = Array.from(dryPuuidsByRegion.values()).reduce((sum, set) => sum + set.size, 0)
    console.log(`[CRAWLER] Resuming from saved state: ${existingStackSize} in stacks, ${existingVisited} visited, ${totalDryRestored} dry, ${existingSeedPool} in seed pool`)
    for (const region of ['europe', 'americas', 'asia', 'sea'] as RegionalCluster[]) {
      const stackSize = crawlStackByRegion.get(region)!.length
      const visited = visitedPuuidsByRegion.get(region)!.size
      const dry = dryPuuidsByRegion.get(region)!.size
      const seedPool = seedPoolByRegion.get(region)!.size
      if (stackSize > 0 || visited > 0 || dry > 0 || seedPool > 0) {
        console.log(`  ${region}: stack=${stackSize}, visited=${visited}, dry=${dry}, seedPool=${seedPool}`)
      }
    }
    console.log()
  }
  
  // Show final state summary
  const totalStackSize = Array.from(crawlStackByRegion.values()).reduce((sum, stack) => sum + stack.length, 0)
  const totalVisited = Array.from(visitedPuuidsByRegion.values()).reduce((sum, set) => sum + set.size, 0)
  const totalDryRestored = Array.from(dryPuuidsByRegion.values()).reduce((sum, set) => sum + set.size, 0)
  if (totalStackSize === 0) {
    console.log('[CRAWLER] Warning: No PUUIDs in stacks. Will attempt to seed from pool or DB.')
  }
  
  const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
  
  let totalMatchesScraped = 0
  const startTime = Date.now()
  
  // Track per-region stats
  const regionStats = new Map<RegionalCluster, { matches: number; lastUpdate: number }>()
  regions.forEach(r => regionStats.set(r, { matches: 0, lastUpdate: Date.now() }))
  
  // DFS crawler for each region (runs in parallel)
  const regionCrawlers = regions.map(async (region) => {
    const stack = crawlStackByRegion.get(region)!
    const visited = visitedPuuidsByRegion.get(region)!
    const dryPuuids = dryPuuidsByRegion.get(region)!
    const backtrackHistory = backtrackHistoryByRegion.get(region)!
    const stats = regionStats.get(region)!
    
    let lastBacktrackPuuid: string | null = null
    let consecutiveEmptyDiscoveries = 0
    let consecutiveDryPuuids = 0
    let consecutiveBacktracks = 0
    
    while (true) {
      try {
        // If stack is empty, try to backtrack
        if (stack.length === 0) {
          if (backtrackHistory.length === 0) {
            // Try to get new seeds from the seed pool
            console.log(`[${region}] Stack and backtrack history empty, checking seed pool...`)
            const poolSeeds = getRandomSeedsFromPool(region)
            
            if (poolSeeds.length > 0) {
              // Push seeds onto stack
              poolSeeds.forEach(p => stack.push(p))
              console.log(`[${region}] Added ${poolSeeds.length} seeds from pool to stack`)
              consecutiveBacktracks = 0
              continue
            }
            
            // Try fetching from DB (existing matches)
            const dbSeeds = await fetchSeedsFromDB(region)
            if (dbSeeds.length > 0) {
              dbSeeds.forEach(p => stack.push(p))
              // Also add to seed pool for future use
              dbSeeds.forEach(p => seedPoolByRegion.get(region)!.add(p))
              console.log(`[${region}] Added ${dbSeeds.length} seeds from DB to stack`)
              consecutiveBacktracks = 0
              continue
            }
            
            // No seeds from pool or DB, clear dry entries and retry
            console.log(`[${region}] No seeds available, clearing dry entries and waiting 15s...`)
            
            // Clear dry entries to allow re-checking old players
            if (dryPuuids.size > 0) {
              const toDelete = Array.from(dryPuuids).slice(0, Math.floor(dryPuuids.size * 0.5))
              toDelete.forEach(p => dryPuuids.delete(p))
              console.log(`[${region}] Cleared ${toDelete.length} dry entries`)
            }
            
            await sleep(15000)
            consecutiveBacktracks = 0
            continue
          }
          
          consecutiveBacktracks++
          
          // If we've been backtracking too much, the region is saturated
          if (consecutiveBacktracks >= 20) {
            console.log(`[${region}] Region appears saturated (${consecutiveBacktracks} backtracks), trying seed pool...`)
            
            // Try to get new seeds from seed pool first
            const poolSeeds = getRandomSeedsFromPool(region)
            if (poolSeeds.length > 0) {
              poolSeeds.forEach(p => stack.push(p))
              console.log(`[${region}] Added ${poolSeeds.length} seeds from pool to stack`)
              consecutiveBacktracks = 0
              continue
            }
            
            // Try DB seeds
            const dbSeeds = await fetchSeedsFromDB(region)
            if (dbSeeds.length > 0) {
              dbSeeds.forEach(p => stack.push(p))
              dbSeeds.forEach(p => seedPoolByRegion.get(region)!.add(p))
              console.log(`[${region}] Added ${dbSeeds.length} seeds from DB to stack`)
              consecutiveBacktracks = 0
              continue
            }
            
            // No pool or DB seeds, short sleep and clear dry entries
            await sleep(15000)
            if (dryPuuids.size > 100) {
              const toDelete = Array.from(dryPuuids).slice(0, Math.floor(dryPuuids.size * 0.5))
              toDelete.forEach(p => dryPuuids.delete(p))
              console.log(`[${region}] Cleared ${toDelete.length} dry entries to allow re-checking`)
            }
            consecutiveBacktracks = 0
            continue
          }
          
          // Random backtracking: pick a random previous summoner
          // Filter out any that are in dryPuuids
          const validBacktracks = backtrackHistory.filter(p => !dryPuuids.has(p))
          
          if (validBacktracks.length === 0) {
            console.log(`[${region}] All backtrack history is exhausted, trying seed pool...`)
            backtrackHistory.length = 0
            
            // try to get new seeds from seed pool
            const poolSeeds = getRandomSeedsFromPool(region)
            if (poolSeeds.length > 0) {
              poolSeeds.forEach(p => stack.push(p))
              console.log(`[${region}] Added ${poolSeeds.length} seeds from pool to stack`)
              consecutiveBacktracks = 0
              continue
            }
            
            // try DB seeds
            const dbSeeds = await fetchSeedsFromDB(region)
            if (dbSeeds.length > 0) {
              dbSeeds.forEach(p => stack.push(p))
              dbSeeds.forEach(p => seedPoolByRegion.get(region)!.add(p))
              console.log(`[${region}] Added ${dbSeeds.length} seeds from DB to stack`)
              consecutiveBacktracks = 0
              continue
            }
            
            await sleep(10000)
            consecutiveBacktracks = 0
            continue
          }
          
          let backtrackPuuid: string
          let attempts = 0
          do {
            const randomIndex = Math.floor(Math.random() * validBacktracks.length)
            backtrackPuuid = validBacktracks[randomIndex]
            attempts++
          } while (backtrackPuuid === lastBacktrackPuuid && attempts < 5 && validBacktracks.length > 1)
          
          console.log(`[${region}] Backtracking to ${backtrackPuuid.substring(0, 8)}... (${validBacktracks.length} valid in history)`)
          
          // Push the backtrack point onto the stack
          stack.push(backtrackPuuid)
          // Remove from visited so we re-crawl it to extract more PUUIDs
          visited.delete(backtrackPuuid)
          lastBacktrackPuuid = backtrackPuuid
        }
        
        // Pop next summoner from stack (LIFO = depth-first)
        const currentPuuid = stack.pop()!
        
        // Skip if already visited or known dry
        if (visited.has(currentPuuid) || dryPuuids.has(currentPuuid)) {
          continue
        }
        
        // Reset backtrack counter on successful pop
        consecutiveBacktracks = 0
        
        console.log(`[${region}] Crawling ${currentPuuid.substring(0, 8)}... (stack: ${stack.length}, visited: ${visited.size}, dry: ${dryPuuids.size})`)
        
        // Crawl the summoner
        const { stored, discovered, isDry } = await crawlSummoner(currentPuuid, region)
        
        // Mark as visited
        visited.add(currentPuuid)
        
        // If dry (no recent ARAM matches or all matches exhausted), add to dry set
        if (isDry) {
          dryPuuids.add(currentPuuid)
          consecutiveDryPuuids++
          
          // Limit dry set size to prevent memory bloat (keep most recent 10k)
          if (dryPuuids.size > 10000) {
            const toDelete = Array.from(dryPuuids).slice(0, 1000)
            toDelete.forEach(p => dryPuuids.delete(p))
          }
          
          // If too many consecutive dry/exhausted PUUIDs, region may be saturated
          // Sleep to give other regions more API bandwidth
          if (consecutiveDryPuuids >= 10) {
            const sleepTime = Math.min(consecutiveDryPuuids * 1000, 30000) // Up to 30s
            console.log(`[${region}] ${consecutiveDryPuuids} consecutive dry PUUIDs - region saturated, sleeping ${sleepTime/1000}s...`)
            await sleep(sleepTime)
            
            // Also clear backtrack history to force finding new players
            if (consecutiveDryPuuids >= 20 && backtrackHistory.length > 50) {
              backtrackHistory.length = 0
              console.log(`[${region}] Cleared backtrack history to force new exploration`)
              consecutiveDryPuuids = 0
            }
          }
          continue
        }
        
        consecutiveDryPuuids = 0
        
        // Add to backtrack history (for potential future backtracking) - only productive players
        backtrackHistory.push(currentPuuid)
        // Limit backtrack history size to prevent memory bloat
        if (backtrackHistory.length > 500) {
          backtrackHistory.shift()
        }
        
        // Update stats
        if (stored > 0) {
          totalMatchesScraped += stored
          stats.matches += stored
          stats.lastUpdate = Date.now()
          console.log(`[${region}] +${stored} matches | Region total: ${stats.matches} | Global total: ${totalMatchesScraped}`)
        }
        
        // Push discovered summoners onto the stack
        if (discovered.length > 0) {
          console.log(`  → Discovered ${discovered.length} new summoners, pushing onto stack`)
          consecutiveEmptyDiscoveries = 0
          // Push in reverse order so the first discovered is processed first (typical DFS)
          for (let i = discovered.length - 1; i >= 0; i--) {
            if (!visited.has(discovered[i]) && !dryPuuids.has(discovered[i])) {
              stack.push(discovered[i])
            }
          }
        } else {
          consecutiveEmptyDiscoveries++
          console.log(`  → No new summoners discovered (${consecutiveEmptyDiscoveries} consecutive)`)
          
          // If we've had too many empty discoveries, clear part of backtrack history
          // to force exploration of different branches
          if (consecutiveEmptyDiscoveries >= 10 && backtrackHistory.length > 100) {
            const toRemove = Math.floor(backtrackHistory.length * 0.3)
            backtrackHistory.splice(0, toRemove)
            console.log(`[${region}] Pruned ${toRemove} old entries from backtrack history to force new exploration`)
            consecutiveEmptyDiscoveries = 0
          }
        }
        
      } catch (error: any) {
        console.error(`[${region}] Crawler error:`, error?.message || error)
      }

      // No sleep - rate limiter handles pacing
    }
  })
  
  // Periodic summary logger and state saver
  const statsLogger = async () => {
    while (true) {
      await sleep(15000) // Report every 15 seconds
      const runtime = Date.now() - startTime
      const avgRate = totalMatchesScraped / (runtime / 1000 / 60)
      const acceptedPatches = await getCurrentPatch()
      
      console.log(`\n━━━ Summary (${formatDuration(runtime)}) ━━━`)
      console.log(`Patches: ${acceptedPatches.join(', ')} | Total: ${totalMatchesScraped} matches | Rate: ${avgRate.toFixed(1)}/min`)
      console.log(`Stats buffer: ${getStatsBufferCount()} pending`)
      
      let totalInStacks = 0
      let totalVisited = 0
      let totalDry = 0
      for (const region of regions) {
        const stackSize = crawlStackByRegion.get(region)!.length
        const visited = visitedPuuidsByRegion.get(region)!.size
        const dry = dryPuuidsByRegion.get(region)!.size
        const stats = regionStats.get(region)!
        totalInStacks += stackSize
        totalVisited += visited
        totalDry += dry
        
        if (stackSize > 0 || visited > 0) {
          const regionRate = stats.matches / (runtime / 1000 / 60)
          const hitRate = visited > 0 ? ((visited - dry) / visited * 100).toFixed(0) : '0'
          console.log(`[${region.toUpperCase()}] Stack: ${stackSize} | Visited: ${visited} | Dry: ${dry} (${hitRate}% productive) | Matches: ${stats.matches} (${regionRate.toFixed(1)}/min)`)
        }
      }
      console.log(`Active: ${totalInStacks} in stacks | ${totalVisited} visited | ${totalDry} dry`)
      console.log()
      
      // Flush stats buffer if needed
      await maybeFlushStats()
      
      // Save state and match cache every summary
      saveState()
      saveMatchCache()
    }
  }
  
  // Run all crawlers and stats logger in parallel
  await Promise.all([...regionCrawlers, statsLogger()])
}

// helper to format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

// helper to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('\n\n[CRAWLER] Shutting down gracefully...')
  console.log('[CRAWLER] Flushing stats buffer...')
  await flushStatsBatch()
  console.log('[CRAWLER] Saving state and caches...')
  saveState()
  saveMatchCache()
  console.log('[CRAWLER] State saved to scraper-state.json')
  console.log('[CRAWLER] Match cache saved to match-cache.json')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\n[CRAWLER] Shutting down gracefully...')
  console.log('[CRAWLER] Flushing stats buffer...')
  await flushStatsBatch()
  console.log('[CRAWLER] Saving state and caches...')
  saveState()
  saveMatchCache()
  console.log('[CRAWLER] State saved to scraper-state.json')
  console.log('[CRAWLER] Match cache saved to match-cache.json')
  process.exit(0)
})

// start the scraper
main().catch((error) => {
  console.error('[CRAWLER] Fatal error:', error)
  process.exit(1)
})
