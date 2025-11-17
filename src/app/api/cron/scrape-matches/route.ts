// vercel cron job for scraping matches
// runs every 5 minutes, processes all regions concurrently within 60s timeout
// only scrapes matches from last 2 weeks (current patch)
import { createAdminClient } from '@/lib/supabase'
import { getMatchById, getMatchIdsByPuuid } from '@/lib/riot-api'
import { waitForRateLimit } from '@/lib/rate-limiter'
import { type RegionalCluster } from '@/lib/regions'
import { storeMatchData } from '@/lib/match-storage'
import { extractPatch } from '@/lib/patch-utils'
import { NextResponse } from 'next/server'

// store region state in database to persist across invocations
interface RegionState {
  region: RegionalCluster
  current_puuid_index: number
  matches_scraped: number
  last_run: string
}

// track scraped PUUIDs per region (in-memory for this invocation)
const scrapedPuuids = new Map<RegionalCluster, Set<string>>([
  ['europe', new Set()],
  ['americas', new Set()],
  ['asia', new Set()],
  ['sea', new Set()]
])

// track discovered PUUIDs from matches
const discoveredPuuids = new Map<RegionalCluster, Set<string>>([
  ['europe', new Set()],
  ['americas', new Set()],
  ['asia', new Set()],
  ['sea', new Set()]
])

// get current patch from database
async function getCurrentPatch(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('matches')
    .select('patch')
    .not('patch', 'is', null)
    .order('game_creation', { ascending: false })
    .limit(1)
  
  return data && data.length > 0 ? data[0].patch : null
}

// get all region states
async function getAllRegionStates(): Promise<Map<RegionalCluster, number>> {
  const supabase = createAdminClient()
  
  const { data: states } = await supabase
    .from('scraper_state')
    .select('*')
  
  if (!states || states.length === 0) {
    // initialize state for all regions
    const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
    await supabase.from('scraper_state').insert(
      regions.map(r => ({
        region: r,
        current_puuid_index: 0,
        matches_scraped: 0,
        last_run: new Date().toISOString(),
      }))
    )
    return new Map([
      ['europe', 0],
      ['americas', 0],
      ['asia', 0],
      ['sea', 0]
    ])
  }
  
  return new Map(
    states.map(s => [s.region as RegionalCluster, s.current_puuid_index || 0])
  )
}

// update region state after processing
async function updateRegionState(
  region: RegionalCluster,
  index: number,
  matchesScraped: number
) {
  const supabase = createAdminClient()
  
  await supabase
    .from('scraper_state')
    .update({
      current_puuid_index: index,
      matches_scraped: matchesScraped,
      last_run: new Date().toISOString(),
    })
    .eq('region', region)
}

// process matches for a region
async function processRegion(
  region: RegionalCluster,
  startIndex: number,
  maxDuration: number,
  startTime: number
): Promise<{ stored: number; nextIndex: number; discovered: number }> {
  const timeRemaining = () => maxDuration - (Date.now() - startTime)
  const supabase = createAdminClient()
  
  // get puuids for this region (limit to 200 for faster processing)
  const { data: summoners } = await supabase
    .from('summoners')
    .select('puuid, region')
    .eq('region', region)
    .order('last_updated', { ascending: false })
    .limit(200)
  
  let puuids: string[] = []
  
  if (summoners && summoners.length > 0) {
    puuids = summoners.map(s => s.puuid)
  } else {
    // fallback: extract puuids from recent matches
    const { data: matches } = await supabase
      .from('summoner_matches')
      .select('puuid')
      .order('game_creation', { ascending: false })
      .limit(500)
    
    puuids = [...new Set(matches?.map(m => m.puuid) || [])]
  }
  
  // add any discovered puuids from previous iterations
  const discovered = Array.from(discoveredPuuids.get(region) || [])
  puuids = [...new Set([...puuids, ...discovered])]
  
  if (puuids.length === 0) {
    return { stored: 0, nextIndex: 0, discovered: 0 }
  }
  
  let totalStored = 0
  let currentIndex = startIndex
  let totalDiscovered = 0
  let skippedDueToTimeout = 0
  
  // process puuids until timeout
  while (timeRemaining() > 5000) { // leave 5s buffer
    // wrap around if we've processed all puuids
    if (currentIndex >= puuids.length) {
      currentIndex = 0
    }
    
    const puuid = puuids[currentIndex]
    
    // skip if already scraped in this invocation
    if (!scrapedPuuids.get(region)?.has(puuid)) {
      const result = await processPuuid(puuid, region, timeRemaining())
      totalStored += result.stored
      totalDiscovered += result.discovered
      
      // if we skipped due to timeout, stop trying
      if (result.stored === 0 && result.discovered === 0 && timeRemaining() < 10000) {
        skippedDueToTimeout++
        if (skippedDueToTimeout >= 3) {
          // tried 3 times, all hit timeout, give up
          break
        }
      }
    }
    
    currentIndex++
    
    // if we've checked all puuids, break
    if (currentIndex >= puuids.length && totalStored === 0) {
      currentIndex = 0
      break
    }
  }
  
  return { stored: totalStored, nextIndex: currentIndex, discovered: totalDiscovered }
}

// process matches for a puuid
async function processPuuid(
  puuid: string,
  region: RegionalCluster,
  timeRemaining: number
): Promise<{ stored: number; discovered: number }> {
  try {
    // if we don't have enough time left, skip immediately
    if (timeRemaining < 5000) {
      return { stored: 0, discovered: 0 }
    }
    
    // get current patch for filtering
    const currentPatch = await getCurrentPatch()
    
    // fetch match list (last 2 weeks only - covers typical patch cycle)
    const twoWeeksAgo = Math.floor((Date.now() - (14 * 24 * 60 * 60 * 1000)) / 1000)
    
    try {
      await waitForRateLimit(region, 'batch', Math.max(timeRemaining - 2000, 1000))
    } catch (e: any) {
      // timeout exceeded, skip this puuid (expected behavior)
      if (e?.message === 'TIMEOUT_EXCEEDED') {
        return { stored: 0, discovered: 0 }
      }
      throw e // re-throw unexpected errors
    }
    
    const matchIds = await getMatchIdsByPuuid(puuid, region, 450, 20, 0, 'batch', twoWeeksAgo)
    
    if (!matchIds || matchIds.length === 0) {
      return { stored: 0, discovered: 0 }
    }
    
    // check which matches already exist
    const supabase = createAdminClient()
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('match_id')
      .in('match_id', matchIds)
    
    const existingIds = new Set(existingMatches?.map(m => m.match_id) || [])
    const newMatchIds = matchIds.filter((id: string) => !existingIds.has(id))
    
    if (newMatchIds.length === 0) {
      // all matches already stored, mark as scraped
      scrapedPuuids.get(region)?.add(puuid)
      return { stored: 0, discovered: 0 }
    }
    
    let stored = 0
    let discovered = 0
    let skippedOldPatch = 0
    
    // process up to 3 new matches per puuid (stay within timeout)
    for (const matchId of newMatchIds.slice(0, 3)) {
      try {
        try {
          await waitForRateLimit(region, 'batch', Math.max(timeRemaining - 2000, 1000))
        } catch (e: any) {
          // timeout exceeded, stop processing matches (expected behavior)
          if (e?.message === 'TIMEOUT_EXCEEDED') {
            break
          }
          throw e // re-throw unexpected errors
        }
        
        const matchData = await getMatchById(matchId, region, 'batch')
        
        if (!matchData) continue
        
        // filter by current patch
        const matchPatch = extractPatch(matchData.info.gameVersion)
        if (currentPatch && matchPatch !== currentPatch) {
          skippedOldPatch++
          continue
        }
        
        const success = await storeMatchData(matchData, 'scraper')
        if (success) {
          stored++
          
          // discover new PUUIDs from this match
          if (matchData.info?.participants) {
            matchData.info.participants.forEach(p => {
              if (p.puuid && p.puuid !== puuid) {
                discoveredPuuids.get(region)?.add(p.puuid)
                discovered++
              }
            })
          }
        }
      } catch (error: any) {
        // skip individual match errors
        if (error?.status !== 429) {
          console.error(`Error fetching match ${matchId}:`, error?.message)
        }
      }
    }
    
    return { stored, discovered }
  } catch (error) {
    console.error(`Error processing puuid ${puuid}:`, error)
    return { stored: 0, discovered: 0 }
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  // verify cron secret
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  
  try {
    const startTime = Date.now()
    const maxDuration = 50000 // 50 seconds (leave 10s buffer for Vercel's 60s limit)
    
    // get all region states
    const regionStates = await getAllRegionStates()
    const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
    
    // process all regions concurrently
    const results = await Promise.all(
      regions.map(async (region) => {
        const startIndex = regionStates.get(region) || 0
        const { stored, nextIndex, discovered } = await processRegion(region, startIndex, maxDuration, startTime)
        
        // update state for next invocation
        await updateRegionState(region, nextIndex, stored)
        
        return {
          region,
          matchesStored: stored,
          puuidsDiscovered: discovered,
          nextIndex
        }
      })
    )
    
    const duration = Date.now() - startTime
    const totalStored = results.reduce((sum, r) => sum + r.matchesStored, 0)
    
    return NextResponse.json({
      success: true,
      results,
      totalMatchesStored: totalStored,
      durationMs: duration,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
