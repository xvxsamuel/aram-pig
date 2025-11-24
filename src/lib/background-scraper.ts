// optimized background scraper with in-memory queue and smart batching
// single scraper processes all regions in round-robin fashion
import { createAdminClient } from './supabase'
import { getMatchById, getMatchIdsByPuuid } from './riot-api'
import { waitForRateLimit } from './rate-limiter'
import { PLATFORM_TO_REGIONAL, type RegionalCluster, type PlatformCode } from './regions'
import { storeMatchData } from './match-storage'

interface RegionQueue {
  puuids: Set<string>
  processed: Set<string>
  matchesScraped: number
  lastProcessed: number
}

interface ScraperState {
  isRunning: boolean
  totalMatches: number
  queues: Record<RegionalCluster, RegionQueue>
  startedAt: number
}

const state: ScraperState = {
  isRunning: false,
  totalMatches: 0,
  queues: {
    europe: { puuids: new Set(), processed: new Set(), matchesScraped: 0, lastProcessed: 0 },
    americas: { puuids: new Set(), processed: new Set(), matchesScraped: 0, lastProcessed: 0 },
    asia: { puuids: new Set(), processed: new Set(), matchesScraped: 0, lastProcessed: 0 },
    sea: { puuids: new Set(), processed: new Set(), matchesScraped: 0, lastProcessed: 0 },
  },
  startedAt: 0
}

// check for active profile update jobs
async function hasActiveJobs(): Promise<boolean> {
  const supabase = createAdminClient()
  
  const { data: jobs } = await supabase
    .from('update_jobs')
    .select('status')
    .in('status', ['pending', 'processing'])
    .limit(1)
  
  return (jobs?.length || 0) > 0
}

// seed initial puuids from summoners table
async function seedQueues(): Promise<void> {
  const supabase = createAdminClient()
  
  console.log('Scraper: Seeding initial PUUIDs from summoners table...')
  
  const { data: summoners } = await supabase
    .from('summoners')
    .select('puuid, region')
    .not('puuid', 'is', null)
    .limit(500)
  
  if (!summoners || summoners.length === 0) {
    console.log('Scraper: No summoners found in database')
    return
  }
  
  // distribute summoners to appropriate region queues
  summoners.forEach(s => {
    if (!s.puuid || !s.region) return
    
    const platformCode = s.region.toLowerCase() as PlatformCode
    const regionalCluster = PLATFORM_TO_REGIONAL[platformCode]
    
    if (regionalCluster) {
      state.queues[regionalCluster].puuids.add(s.puuid)
    }
  })
  
  // for any empty queues, seed from existing match participants
  for (const [regionalCluster, queue] of Object.entries(state.queues)) {
    if (queue.puuids.size === 0) {
      console.log(`Scraper: No summoners for ${regionalCluster}, extracting PUUIDs from existing matches...`)
      
      // get match_ids for this region by prefix
      let prefixes: string[] = []
      if (regionalCluster === 'americas') prefixes = ['NA1', 'BR1', 'LA1', 'LA2']
      else if (regionalCluster === 'europe') prefixes = ['EUW1', 'EUN1']
      else if (regionalCluster === 'asia') prefixes = ['KR', 'JP1']
      else if (regionalCluster === 'sea') prefixes = ['OC1', 'SG2', 'TW2', 'VN2']
      
      const { data: matchParticipants } = await supabase
        .from('summoner_matches')
        .select('puuid, match_id')
        .order('game_creation', { ascending: false })
        .limit(1000)
      
      if (matchParticipants) {
        matchParticipants.forEach(m => {
          if (!m.puuid) return
          const matchPrefix = m.match_id.split('_')[0]?.toUpperCase()
          if (prefixes.some(p => matchPrefix?.startsWith(p))) {
            queue.puuids.add(m.puuid)
          }
        })
        console.log(`Scraper: Extracted ${queue.puuids.size} PUUIDs from matches for ${regionalCluster}`)
      }
    }
  }
  
  // log results
  let totalSeeded = 0
  Object.entries(state.queues).forEach(([region, queue]) => {
    console.log(`Scraper: Seeded ${queue.puuids.size} PUUIDs for ${region}`)
    totalSeeded += queue.puuids.size
  })
  
  console.log(`Scraper: Total ${totalSeeded} PUUIDs seeded from summoners table`)
}

// reseed queues from database (called periodically to pick up newly searched profiles)
async function reseedQueues(): Promise<void> {
  const supabase = createAdminClient()
  
  const { data: summoners } = await supabase
    .from('summoners')
    .select('puuid, region')
    .not('puuid', 'is', null)
    .limit(500)
  
  if (!summoners) return
  
  let addedCount = 0
  summoners.forEach(s => {
    if (!s.puuid || !s.region) return
    
    const platformCode = s.region.toLowerCase() as PlatformCode
    const regionalCluster = PLATFORM_TO_REGIONAL[platformCode]
    
    if (regionalCluster) {
      const queue = state.queues[regionalCluster]
      // don't check processed set - always re-add summoners to check for new matches
      if (!queue.puuids.has(s.puuid)) {
        queue.puuids.add(s.puuid)
        // clear from processed so it gets checked again
        queue.processed.delete(s.puuid)
        addedCount++
      }
    }
  })
  
  // also extract puuids from existing match participants (for exponential growth)
  const { data: recentMatches } = await supabase
    .from('summoner_matches')
    .select('puuid, match_id')
    .order('game_creation', { ascending: false })
    .limit(500)
  
  if (recentMatches) {
    recentMatches.forEach(m => {
      if (!m.puuid) return
      
      // try to determine region from match_id format (e.g., NA1_xxx -> americas)
      const matchPrefix = m.match_id.split('_')[0]?.toLowerCase()
      let targetRegion: RegionalCluster | undefined
      
      if (matchPrefix?.includes('na') || matchPrefix?.includes('br') || matchPrefix?.includes('la')) {
        targetRegion = 'americas'
      } else if (matchPrefix?.includes('euw') || matchPrefix?.includes('eun')) {
        targetRegion = 'europe'
      } else if (matchPrefix?.includes('kr') || matchPrefix?.includes('jp')) {
        targetRegion = 'asia'
      } else if (matchPrefix?.includes('oc') || matchPrefix?.includes('sg') || matchPrefix?.includes('tw')) {
        targetRegion = 'sea'
      }
      
      if (targetRegion) {
        const queue = state.queues[targetRegion]
        if (!queue.puuids.has(m.puuid) && !queue.processed.has(m.puuid)) {
          queue.puuids.add(m.puuid)
          addedCount++
        }
      }
    })
  }
  
  if (addedCount > 0) {
    console.log(`Scraper: Reseeded ${addedCount} new PUUIDs from database`)
  }
}

// process a batch for a specific region
async function processBatch(region: RegionalCluster): Promise<number> {
  const queue = state.queues[region]
  
  // get next unprocessed puuid
  let puuid: string | undefined
  for (const p of queue.puuids) {
    if (!queue.processed.has(p)) {
      puuid = p
      break
    }
  }
  
  // if all puuids have been processed, reseed immediately and reset
  if (!puuid && queue.puuids.size > 0) {
    await reseedQueues() // pick up new matches immediately
    queue.processed.clear()
    // get first puuid after reset
    puuid = Array.from(queue.puuids)[0]
  }
  
  if (!puuid) {
    return 0
  }
  
  queue.processed.add(puuid)
  
  try {
    // fetch match list - only last 30 days
    const thirtyDaysAgo = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000)
    await waitForRateLimit(region, 'batch')
    const matchIds = await getMatchIdsByPuuid(puuid, region, 450, 20, thirtyDaysAgo, 'batch')
    
    if (!matchIds || matchIds.length === 0) {
      return 0
    }
    
    // batch check which matches already exist
    const supabase = createAdminClient()
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('match_id')
      .in('match_id', matchIds)
    
    const existingIds = new Set(existingMatches?.map(m => m.match_id) || [])
    const newMatchIds = matchIds.filter((id: string) => !existingIds.has(id))
    
    if (newMatchIds.length === 0) {
      return 0
    }
    
    let stored = 0
    const discoveredPuuids = new Set<string>()
    
    // process up to 5 new matches per batch
    for (const matchId of newMatchIds.slice(0, 5)) {
      try {
        await waitForRateLimit(region, 'batch')
        const matchData = await getMatchById(matchId, region, 'batch')
        
        if (matchData && matchData.info.queueId === 450) {
          // extract participant puuids
          matchData.info.participants.forEach((p: any) => {
            if (p.puuid) {
              discoveredPuuids.add(p.puuid)
            }
          })
          
          // store match with 'scraper' source
          const success = await storeMatchData(matchData, region)
          if (success) {
            stored++
          }
        }
      } catch (error: any) {
        // skip individual match errors silently for 429s
        if (error?.status !== 429) {
          console.error(`Scraper [${region}]: Error fetching match ${matchId}:`, error?.message || error)
        }
      }
    }
    
    // add new puuids to queue
    discoveredPuuids.forEach(p => queue.puuids.add(p))
    
    queue.matchesScraped += stored
    queue.lastProcessed = Date.now()
    
    // log new matches for this region
    if (stored > 0) {
      console.log(`Scraper [${region}]: stored ${stored} new match${stored > 1 ? 'es' : ''} (+${discoveredPuuids.size} puuids)`)
    }
    
    return stored
  } catch (error) {
    console.error(`Scraper [${region}]: error in processBatch:`, error)
    return 0
  }
}

// print progress stats
function logProgress() {
  const totalPuuids = Object.values(state.queues).reduce((sum, q) => sum + q.puuids.size, 0)
  const totalProcessed = Object.values(state.queues).reduce((sum, q) => sum + q.processed.size, 0)
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000 / 60) // minutes
  const rate = elapsed > 0 ? Math.floor(state.totalMatches / elapsed) : 0
  
  console.log(`\n━━━ SCRAPER PROGRESS ━━━`)
  console.log(`Total: ${state.totalMatches} matches | ${totalPuuids} puuids in queue | ${totalProcessed} processed`)
  console.log(`Rate: ${rate} matches/min | Running: ${elapsed}min`)
  Object.entries(state.queues).forEach(([region, queue]) => {
    console.log(`  ${region.padEnd(10)}: ${queue.matchesScraped.toString().padStart(4)} matches | ${queue.puuids.size.toString().padStart(5)} puuids`)
  })
  console.log(`━━━━━━━━━━━━━━━━━━━━━━\n`)
}

// main scraper loop
export async function startBackgroundScraper() {
  if (state.isRunning) {
    console.log('Scraper: Already running')
    return
  }
  
  state.isRunning = true
  state.startedAt = Date.now()
  console.log('Scraper: Starting...')
  
  // seed queues
  await seedQueues()
  
  // if no puuids, can't start
  const totalPuuids = Object.values(state.queues).reduce((sum, q) => sum + q.puuids.size, 0)
  if (totalPuuids === 0) {
    console.log('Scraper: No puuids available, stopping')
    state.isRunning = false
    return
  }
  
  const regions: RegionalCluster[] = ['europe', 'americas', 'asia', 'sea']
  let batchesSinceLog = 0
  let batchesSinceReseed = 0
  
  while (state.isRunning) {
    try {
      // reseed queues every 20 batches to pick up newly searched profiles
      batchesSinceReseed++
      if (batchesSinceReseed >= 20) {
        await reseedQueues()
        batchesSinceReseed = 0
      }
      
      // check for active jobs
      const hasJobs = await hasActiveJobs()
      if (hasJobs) {
        await new Promise(resolve => setTimeout(resolve, 30000))
        continue
      }
      
      // process all regions concurrently
      const results = await Promise.all(
        regions.map(region => processBatch(region))
      )
      
      const totalStored = results.reduce((sum, count) => sum + count, 0)
      
      if (totalStored > 0) {
        state.totalMatches += totalStored
        batchesSinceLog++
        
        // log summary progress every 50 batches (not every 10)
        if (batchesSinceLog >= 50) {
          logProgress()
          batchesSinceLog = 0
        }
      }
      
      // short delay between batch rounds
      await new Promise(resolve => setTimeout(resolve, 2000))
      
    } catch (error) {
      console.error('scraper: error in main loop:', error)
      await new Promise(resolve => setTimeout(resolve, 30000))
    }
  }
  
  console.log('scraper: stopped')
}

export function stopBackgroundScraper() {
  state.isRunning = false
  console.log('scraper: stopping...')
}

export function getScraperState() {
  return {
    isRunning: state.isRunning,
    totalMatches: state.totalMatches,
    totalPuuids: Object.values(state.queues).reduce((sum, q) => sum + q.puuids.size, 0),
    regions: Object.fromEntries(
      Object.entries(state.queues).map(([region, queue]) => [
        region,
        {
          matchesScraped: queue.matchesScraped,
          puuidsInQueue: queue.puuids.size,
          puuidsProcessed: queue.processed.size
        }
      ])
    )
  }
}
