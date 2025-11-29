// API route for running the scraper via GitHub Actions
// Protected by CRON_SECRET to prevent unauthorized access

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, storeMatchData, flushAggregatedStats, getStatsBufferCount } from '@/lib/db'
import { getMatchById, getMatchIdsByPuuid, getSummonerByRiotId } from '@/lib/riot/api'
import { waitForRateLimit } from '@/lib/riot/rate-limiter'
import { extractPatch } from '@/lib/game'
import type { RegionalCluster, PlatformCode } from '@/lib/game'

// Accept only current patch
const ACCEPTED_PATCHES = ['25.23']

// Seed summoners for each region (used when no state exists)
const DEFAULT_SEEDS: Array<{ cluster: RegionalCluster; platform: PlatformCode; name: string; tag: string }> = [
  { cluster: 'europe', platform: 'euw1', name: 'TwTv Yikesu0', tag: 'Yikes' },
  { cluster: 'americas', platform: 'na1', name: 'Usni', tag: 'Boba' },
  { cluster: 'asia', platform: 'kr', name: 'Eren', tag: '미카사' },
  { cluster: 'sea', platform: 'sg2', name: 'Miss Lys', tag: 'Lys' },
]

// In-memory state for this execution
const crawlState = {
  stacks: new Map<RegionalCluster, string[]>(),
  visited: new Map<RegionalCluster, Set<string>>(),
  dry: new Map<RegionalCluster, Set<string>>(),
  matchesStored: 0,
  startTime: 0,
}

// Initialize state maps
function initState() {
  const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
  regions.forEach(r => {
    crawlState.stacks.set(r, [])
    crawlState.visited.set(r, new Set())
    crawlState.dry.set(r, new Set())
  })
  crawlState.matchesStored = 0
  crawlState.startTime = Date.now()
}

// Load state from database
async function loadState(): Promise<boolean> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('scraper_state')
    .select('state')
    .eq('id', 'github-actions')
    .single()
  
  if (error || !data) {
    console.log('[SCRAPER] No saved state found, starting fresh')
    return false
  }
  
  try {
    const state = data.state as any
    const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
    
    for (const region of regions) {
      if (state.stacks?.[region]) {
        crawlState.stacks.set(region, state.stacks[region])
      }
      if (state.visited?.[region]) {
        state.visited[region].forEach((p: string) => crawlState.visited.get(region)!.add(p))
      }
      if (state.dry?.[region]) {
        state.dry[region].forEach((p: string) => crawlState.dry.get(region)!.add(p))
      }
    }
    
    const totalStack = Array.from(crawlState.stacks.values()).reduce((sum, s) => sum + s.length, 0)
    const totalVisited = Array.from(crawlState.visited.values()).reduce((sum, s) => sum + s.size, 0)
    console.log(`[SCRAPER] Loaded state: ${totalStack} in stacks, ${totalVisited} visited`)
    return totalStack > 0 || totalVisited > 0
  } catch (e) {
    console.error('[SCRAPER] Error parsing saved state:', e)
    return false
  }
}

// Save state to database
async function saveState() {
  const supabase = createAdminClient()
  
  const state = {
    stacks: Object.fromEntries(crawlState.stacks),
    visited: Object.fromEntries(
      Array.from(crawlState.visited.entries()).map(([k, v]) => [k, Array.from(v).slice(-5000)])
    ),
    dry: Object.fromEntries(
      Array.from(crawlState.dry.entries()).map(([k, v]) => [k, Array.from(v).slice(-5000)])
    ),
    lastRun: new Date().toISOString(),
    matchesStored: crawlState.matchesStored,
  }
  
  const { error } = await supabase
    .from('scraper_state')
    .upsert({ id: 'github-actions', state, updated_at: new Date().toISOString() })
  
  if (error) {
    console.error('[SCRAPER] Error saving state:', error)
  } else {
    console.log('[SCRAPER] State saved to database')
  }
}

// Seed initial PUUIDs from default summoners
async function seedFromDefaults(): Promise<number> {
  let seeded = 0
  
  for (const { cluster, platform, name, tag } of DEFAULT_SEEDS) {
    try {
      console.log(`[SCRAPER] Looking up ${name}#${tag} on ${platform}...`)
      const summonerData = await getSummonerByRiotId(name, tag, platform)
      
      if (summonerData) {
        crawlState.stacks.get(cluster)!.push(summonerData.summoner.puuid)
        console.log(`[SCRAPER] Added ${name}#${tag} to ${cluster} stack`)
        seeded++
      }
    } catch (e: any) {
      console.error(`[SCRAPER] Error looking up ${name}#${tag}:`, e?.message || e)
    }
  }
  
  return seeded
}

// Crawl a single summoner
async function crawlSummoner(puuid: string, region: RegionalCluster): Promise<{ stored: number; discovered: string[] }> {
  const stack = crawlState.stacks.get(region)!
  const visited = crawlState.visited.get(region)!
  const dry = crawlState.dry.get(region)!
  
  const discovered: string[] = []
  let stored = 0
  
  try {
    // Fetch recent ARAM matches
    const twoWeeksAgo = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000)
    
    await waitForRateLimit(region, 'batch')
    const matchIds = await getMatchIdsByPuuid(puuid, region, 450, 50, 0, 'batch', twoWeeksAgo)
    
    if (!matchIds || matchIds.length === 0) {
      dry.add(puuid)
      return { stored: 0, discovered: [] }
    }
    
    console.log(`[${region}] Found ${matchIds.length} matches for ${puuid.substring(0, 8)}...`)
    
    // Check which matches are new
    const supabase = createAdminClient()
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('match_id')
      .in('match_id', matchIds)
    
    const existingIds = new Set(existingMatches?.map(m => m.match_id) || [])
    const newMatchIds = matchIds.filter((id: string) => !existingIds.has(id))
    
    if (newMatchIds.length === 0) {
      dry.add(puuid)
      return { stored: 0, discovered: [] }
    }
    
    console.log(`[${region}] ${newMatchIds.length} new matches to process`)
    
    // Process new matches (limit to 10 per summoner to spread across players)
    for (const matchId of newMatchIds.slice(0, 10)) {
      try {
        await waitForRateLimit(region, 'batch')
        const matchData = await getMatchById(matchId, region, 'batch')
        
        if (!matchData) continue
        
        const matchPatch = extractPatch(matchData.info.gameVersion)
        if (!ACCEPTED_PATCHES.includes(matchPatch)) continue
        
        // Discover new PUUIDs
        if (matchData.info?.participants && stack.length < 100) {
          for (const p of matchData.info.participants) {
            if (p.puuid && p.puuid !== puuid && !visited.has(p.puuid) && !dry.has(p.puuid)) {
              discovered.push(p.puuid)
            }
          }
        }
        
        // Store match (stats buffered in memory with Welford's algorithm)
        const result = await storeMatchData(matchData, region, false)
        if (result.success) {
          stored++
          crawlState.matchesStored++
        }
      } catch (e: any) {
        if (e?.status === 429) {
          console.log(`[${region}] Rate limited, stopping`)
          break
        }
      }
    }
    
    return { stored, discovered: [...new Set(discovered)] }
  } catch (e: any) {
    console.error(`[${region}] Error crawling ${puuid.substring(0, 8)}:`, e?.message || e)
    return { stored: 0, discovered: [] }
  }
}

// Main scraper loop for a region
async function crawlRegion(region: RegionalCluster, durationMs: number): Promise<number> {
  const stack = crawlState.stacks.get(region)!
  const visited = crawlState.visited.get(region)!
  const dry = crawlState.dry.get(region)!
  
  let regionMatches = 0
  const endTime = Date.now() + durationMs
  
  while (Date.now() < endTime && stack.length > 0) {
    const puuid = stack.pop()!
    
    if (visited.has(puuid) || dry.has(puuid)) continue
    
    console.log(`[${region}] Crawling ${puuid.substring(0, 8)}... (stack: ${stack.length})`)
    
    const { stored, discovered } = await crawlSummoner(puuid, region)
    visited.add(puuid)
    
    regionMatches += stored
    
    // Add discovered PUUIDs to stack
    for (const p of discovered.slice(0, 20)) {
      if (!visited.has(p) && !dry.has(p)) {
        stack.push(p)
      }
    }
    
    // Flush stats periodically
    if (getStatsBufferCount() >= 30) {
      await flushAggregatedStats()
    }
  }
  
  return regionMatches
}

export async function POST(request: NextRequest) {
  // Verify secret
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET
  
  if (!expectedSecret) {
    console.error('[SCRAPER] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  
  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.error('[SCRAPER] Invalid authorization')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Parse duration from request
  const body = await request.json().catch(() => ({}))
  const durationMinutes = Math.min(body.duration_minutes || 50, 55) // max 55 min
  const durationMs = durationMinutes * 60 * 1000
  
  console.log(`[SCRAPER] Starting scraper for ${durationMinutes} minutes`)
  console.log(`[SCRAPER] Accepted patches: ${ACCEPTED_PATCHES.join(', ')}`)
  
  // Initialize and load state
  initState()
  const hasState = await loadState()
  
  if (!hasState) {
    const seeded = await seedFromDefaults()
    if (seeded === 0) {
      return NextResponse.json({ error: 'Failed to seed initial summoners' }, { status: 500 })
    }
  }
  
  // Crawl all regions in sequence (to manage rate limits better)
  const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
  const regionDuration = durationMs / regions.length
  
  const results: Record<string, number> = {}
  
  for (const region of regions) {
    if (Date.now() - crawlState.startTime >= durationMs - 60000) break // stop 1 min before timeout
    
    results[region] = await crawlRegion(region, regionDuration)
    console.log(`[${region}] Completed: ${results[region]} matches stored`)
  }
  
  // Final flush
  await flushAggregatedStats()
  
  // Save state
  await saveState()
  
  const totalTime = Math.round((Date.now() - crawlState.startTime) / 1000)
  
  console.log(`[SCRAPER] Completed in ${totalTime}s. Total matches: ${crawlState.matchesStored}`)
  
  return NextResponse.json({
    success: true,
    duration_seconds: totalTime,
    matches_stored: crawlState.matchesStored,
    results_by_region: results,
    stats_buffer: getStatsBufferCount(),
  })
}

// Also support GET for health check
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'scraper' })
}
