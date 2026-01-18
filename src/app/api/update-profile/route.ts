import { NextResponse } from 'next/server'
import {
  createAdminClient,
  statsAggregator,
  isFinishedItem,
  extractRunes,
  processParticipants,
} from '@/lib/db'
import { extractSkillOrderAbbreviation, recalculateProfileStatsForPlayers } from '@/lib/scoring'
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getMatchIdsByPuuid,
  getMatchById,
  getMatchTimeline,
} from '@/lib/riot/api'
import { type RequestType } from '@/lib/riot/rate-limiter'
import type { PlatformCode } from '@/lib/game'
import type { UpdateJob } from '../../../types/update-jobs'
import {
  extractAbilityOrder,
  extractBuildOrder,
  extractFirstBuy,
  formatFirstBuy,
  extractPatch,
  getPatchFromDate,
  isPatchAccepted,
} from '@/lib/game'

// ============================================================================
// configuration
// ============================================================================

const CHUNK_SIZE = 12 // matches per chunk (~24 api calls: 12 match + 12 timeline)
const processingLocks = new Map<string, Promise<Response>>()

// Retry helper for database operations that can timeout
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error
      const isTimeout = error?.message?.includes('522') || 
                       error?.message?.includes('timeout') ||
                       error?.message?.includes('timed out')
      
      if (attempt < maxRetries && isTimeout) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // 1s, 2s, 4s max 10s
        console.log(`[RetryBackoff] ${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        break
      }
    }
  }
  
  throw lastError
}

// ============================================================================
// job management
// ============================================================================

async function cleanupStaleJobs(supabase: any) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  await supabase
    .from('update_jobs')
    .update({ status: 'failed', error_message: 'job timed out', completed_at: new Date().toISOString() })
    .in('status', ['pending', 'processing'])
    .lt('started_at', thirtyMinutesAgo)

  await supabase
    .from('update_jobs')
    .update({ status: 'failed', error_message: 'job stalled', completed_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', fiveMinutesAgo)
}

async function getActiveJob(supabase: any, puuid: string): Promise<UpdateJob | null> {
  const { data } = await supabase
    .from('update_jobs')
    .select('id, puuid, status, total_matches, fetched_matches, eta_seconds, region, started_at, created_at, updated_at, completed_at, error_message, pending_match_ids')
    .eq('puuid', puuid)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function createJob(supabase: any, puuid: string, matchIds: string[], region: string): Promise<string> {
  const { data, error } = await supabase
    .from('update_jobs')
    .insert({
      puuid,
      status: 'processing',
      total_matches: matchIds.length,
      fetched_matches: 0,
      eta_seconds: Math.ceil(matchIds.length * 3),
      pending_match_ids: matchIds,
      region,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`failed to create job: ${error.message}`)
  return data.id
}

async function updateJobProgress(supabase: any, jobId: string, fetched: number, remaining: string[]) {
  await supabase
    .from('update_jobs')
    .update({
      fetched_matches: fetched,
      eta_seconds: Math.ceil(remaining.length * 3),
      pending_match_ids: remaining,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

async function completeJob(supabase: any, jobId: string) {
  await supabase
    .from('update_jobs')
    .update({ status: 'completed', pending_match_ids: [], completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

async function failJob(supabase: any, jobId: string, error: string) {
  await supabase
    .from('update_jobs')
    .update({ status: 'failed', error_message: error, completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

// ============================================================================
// RIOT API HELPERS
// ============================================================================

async function fetchMatchIds(region: string, puuid: string, count?: number, requestType: RequestType = 'overhead') {
  const allMatchIds: string[] = []
  let start = 0
  while (true) {
    if (count && allMatchIds.length >= count) break
    const batchCount = count ? Math.min(100, count - allMatchIds.length) : 100
    const batchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchCount, start, requestType)
    if (batchIds.length === 0) break
    allMatchIds.push(...batchIds)
    if (batchIds.length < 100) break
    start += 100
  }
  return allMatchIds
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

export async function POST(request: Request) {
  try {
    const { region, gameName, tagLine, platform } = await request.json()
    if (!region || !gameName || !tagLine || !platform) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get account to find puuid
    const accountData = await getAccountByRiotId(gameName, tagLine, region as any)
    if (!accountData) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    // Check for existing active job in database (works across serverless instances)
    const existingJob = await getActiveJob(supabase, accountData.puuid)
    if (existingJob) {
      console.log(`[UpdateProfile] Found existing job ${existingJob.id} for ${accountData.puuid}, status: ${existingJob.status}, pending: ${existingJob.pending_match_ids?.length || 0}`)
      // Job already exists - check if it needs continuation
      if (existingJob.pending_match_ids && existingJob.pending_match_ids.length > 0) {
        return await continueProcessingJob(supabase, existingJob, region, accountData.puuid)
      }
      // Job is complete but not finalized yet
      await finalizeJob(supabase, existingJob.id, accountData.puuid)
      return NextResponse.json({ message: 'Update completed', jobId: existingJob.id, newMatches: existingJob.total_matches, completed: true })
    }

    // No existing job - proceed with normal flow
    const lockKey = `${region}:${gameName}:${tagLine}`.toLowerCase()
    const existingLock = processingLocks.get(lockKey)
    if (existingLock) {
      // In-memory lock for same function instance only
      return NextResponse.json({ 
        message: 'Profile update already in progress',
        isProcessing: true 
      })
    }

    const processPromise = processProfileUpdate(region, gameName, tagLine, platform, accountData)
    processingLocks.set(lockKey, processPromise)
    try {
      return await processPromise
    } finally {
      processingLocks.delete(lockKey)
    }
  } catch (error) {
    console.error('[UpdateProfile] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function processProfileUpdate(region: string, gameName: string, tagLine: string, platform: string, accountData: any): Promise<Response> {
  let jobId: string | null = null
  const supabase = createAdminClient()

  try {
    await cleanupStaleJobs(supabase)

    // accountData already fetched in POST handler
    if (!accountData) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    // check for existing active job (double-check in case of race condition)
    const existingJob = await getActiveJob(supabase, accountData.puuid)
    if (existingJob) {
      if (existingJob.pending_match_ids && existingJob.pending_match_ids.length > 0) {
        return await continueProcessingJob(supabase, existingJob, region, accountData.puuid)
      }
      await finalizeJob(supabase, existingJob.id, accountData.puuid)
      return NextResponse.json({ message: 'Update completed', jobId: existingJob.id, newMatches: existingJob.total_matches, completed: true })
    }

    // check cooldown
    const { data: existingSummoner } = await supabase.from('summoners').select('last_updated').eq('puuid', accountData.puuid).single()
    if (existingSummoner?.last_updated && new Date(existingSummoner.last_updated).getTime() > Date.now() - 5 * 60 * 1000) {
      return NextResponse.json({ message: 'Profile updated recently', recentlyUpdated: true, newMatches: 0 })
    }

    const summonerData = await getSummonerByPuuid(accountData.puuid, platform as PlatformCode)
    if (!summonerData) return NextResponse.json({ error: 'Summoner not found' }, { status: 404 })

    await supabase.from('summoners').upsert({
      puuid: accountData.puuid,
      game_name: accountData.gameName,
      tag_line: accountData.tagLine,
      summoner_level: summonerData.summonerLevel,
      profile_icon_id: summonerData.profileIconId,
      region: platform,
    })

    const { data: existingMatches } = await supabase.from('summoner_matches').select('match_id').eq('puuid', accountData.puuid)
    const existingMatchIds = new Set(existingMatches?.map((m: any) => m.match_id) || [])

    // quick check for new matches
    const { data: lastJob } = await supabase.from('update_jobs').select('status').eq('puuid', accountData.puuid).order('created_at', { ascending: false }).limit(1).single()
    const skipQuickCheck = lastJob?.status === 'failed' || existingMatchIds.size === 0

    if (!skipQuickCheck) {
      const quickIds = await fetchMatchIds(region, accountData.puuid, 100, 'overhead')
      if (quickIds.filter(id => !existingMatchIds.has(id)).length === 0) {
        // no new matches - client should trigger pig score calculation separately
        return NextResponse.json({ success: true, newMatches: 0, message: 'Profile is up to date', puuid: accountData.puuid, region })
      }
    }

    // fetch full history
    const matchIds = await fetchMatchIds(region, accountData.puuid, undefined, 'batch')
    const newMatchIds = [...new Set(matchIds.filter(id => !existingMatchIds.has(id)))]

    if (newMatchIds.length === 0) {
      // no new matches - client should trigger pig score calculation separately
      return NextResponse.json({ success: true, newMatches: 0, message: 'Profile is up to date', puuid: accountData.puuid, region })
    }

    jobId = await createJob(supabase, accountData.puuid, newMatchIds, region)

    // Double-check no other job was created in the meantime (race condition)
    const raceCheckJob = await getActiveJob(supabase, accountData.puuid)
    if (raceCheckJob && raceCheckJob.id !== jobId) {
      // Another job was created, fail this one and use the existing
      await failJob(supabase, jobId, 'duplicate job detected')
      return await continueProcessingJob(supabase, raceCheckJob, region, accountData.puuid)
    }

    const job: UpdateJob = {
      id: jobId,
      puuid: accountData.puuid,
      status: 'processing',
      total_matches: newMatchIds.length,
      fetched_matches: 0,
      eta_seconds: Math.ceil(newMatchIds.length * 3),
      pending_match_ids: newMatchIds,
      region,
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    }

    return await continueProcessingJob(supabase, job, region, accountData.puuid)
  } catch (error: any) {
    console.error('[UpdateProfile] Error:', error)
    if (jobId) await failJob(supabase, jobId, error.message || 'unknown error')
    return NextResponse.json({ error: error.message || 'Failed to update profile' }, { status: 500 })
  }
}

// ============================================================================
// CHUNK PROCESSING
// ============================================================================

async function continueProcessingJob(supabase: any, job: UpdateJob, region: string, puuid: string): Promise<Response> {
  const pendingMatchIds = job.pending_match_ids || []

  console.log(`[UpdateProfile] Continue job ${job.id}: ${pendingMatchIds.length} pending matches`)

  if (pendingMatchIds.length === 0) {
    await finalizeJob(supabase, job.id, puuid)
    return NextResponse.json({ message: 'Update completed', jobId: job.id, newMatches: job.total_matches, completed: true })
  }

  // Track failed matches with error codes
  const failedMatches: Array<{ matchId: string; error: string }> = []

  const chunkToProcess = pendingMatchIds.slice(0, CHUNK_SIZE)
  const remainingMatchIds = pendingMatchIds.slice(CHUNK_SIZE)

  console.log(`[UpdateProfile] Processing chunk of ${chunkToProcess.length} matches (${remainingMatchIds.length} remaining)`)

  // pre-check existing records
  const [existingMatchesResult, existingUserRecordsResult] = await Promise.all([
    supabase.from('matches').select('match_id, game_creation, game_duration, patch').in('match_id', chunkToProcess),
    supabase.from('summoner_matches').select('match_id').eq('puuid', puuid).in('match_id', chunkToProcess),
  ])

  const existingMatchesMap = new Map(existingMatchesResult.data?.map((m: any) => [m.match_id, m]) || [])
  const userHasRecord = new Set(existingUserRecordsResult.data?.map((r: any) => r.match_id) || [])

  // Cache accepted patches to avoid repeated DB queries
  const acceptedPatchesCache = new Set<string>()
  const rejectedPatchesCache = new Set<string>()

  let fetchedInChunk = 0
  const allRecordsToInsert: any[] = []

  try {
    // PARALLEL: Fetch all match data from Riot API at once
    const matchFetchPromises = chunkToProcess.map(async (matchId) => {
      const existingMatch = existingMatchesMap.get(matchId)
      if (existingMatch && userHasRecord.has(matchId)) {
        // Skip fetch - already have this match for this user
        return { matchId, skip: true }
      }

      try {
        const match = await getMatchById(matchId, region as any, 'overhead')
        const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
        const gameCreation = (existingMatch as any)?.game_creation || match.info.gameCreation
        const isOlderThan1Year = gameCreation < oneYearAgo
        const isRemake = match.info.participants.some((p: any) => p.gameEndedInEarlySurrender)

        // fetch timeline for recent matches (within 1 year) only
        let timeline = null
        if (!isOlderThan1Year && !isRemake) {
          try { timeline = await getMatchTimeline(matchId, region as any, 'overhead') } catch {}
        }

        return { matchId, match, existingMatch, gameCreation, isOlderThan1Year, isRemake, timeline, skip: false, error: null }
      } catch (err: any) {
        console.error(`Failed to fetch match ${matchId}:`, err)
        const errorMsg = err?.message || err?.toString() || 'Unknown error'
        return { matchId, skip: true, error: errorMsg }
      }
    })

    const matchResults = await Promise.all(matchFetchPromises)

    // Collect failed matches
    for (const result of matchResults) {
      if (result.skip && result.error) {
        failedMatches.push({ matchId: result.matchId, error: result.error })
      }
    }

    // Batch all new match inserts together with smaller batches and retry logic
    const newMatchInserts = matchResults
      .filter((r): r is typeof r & { match: NonNullable<typeof r.match> } => !r.skip && !!r.match && !r.existingMatch)
      .map(r => ({
        match_id: r.match.metadata.matchId,
        game_creation: r.gameCreation,
        game_duration: r.match.info.gameDuration,
        patch: r.match.info.gameVersion ? extractPatch(r.match.info.gameVersion) : getPatchFromDate(r.gameCreation!),
        timeline_data: r.timeline || null, // Store timeline if we fetched it
      }))
    
    if (newMatchInserts.length > 0) {
      // Use smaller batches (50 instead of all at once) to prevent timeouts
      const MATCH_INSERT_BATCH_SIZE = 50
      for (let i = 0; i < newMatchInserts.length; i += MATCH_INSERT_BATCH_SIZE) {
        const batch = newMatchInserts.slice(i, i + MATCH_INSERT_BATCH_SIZE)
        try {
          await retryWithBackoff(
            () => supabase.from('matches').upsert(batch),
            `Match insert batch ${i / MATCH_INSERT_BATCH_SIZE + 1}`
          )
        } catch (error: any) {
          console.error(`[UpdateProfile] Batch match insert failed after retries (${i}-${i + batch.length}):`, error.message)
          // Final fallback: try one by one
          for (const insert of batch) {
            try {
              await supabase.from('matches').upsert(insert)
            } catch (individualError) {
              console.error(`[UpdateProfile] Individual match insert failed for ${insert.match_id}`, individualError)
            }
          }
        }
      }
    }

    // Process results and collect participant records IN PARALLEL
    const matchProcessingPromises = matchResults.map(async (result) => {
      if (result.skip) {
        if (!result.error) fetchedInChunk++
        return { statsUpdate: null, records: [], success: !result.error }
      }

      try {
        const { matchId, match, existingMatch, gameCreation, isOlderThan1Year, isRemake, timeline } = result
        if (!match) return { statsUpdate: null, records: [], success: false }
        
        const patch = (existingMatch as any)?.patch || (match.info.gameVersion ? extractPatch(match.info.gameVersion) : getPatchFromDate(gameCreation!))
        const gameDuration = (existingMatch as any)?.game_duration || match.info.gameDuration

        const records = await processParticipants({
          match,
          matchId: existingMatch ? matchId : match.metadata.matchId,
          patch,
          gameCreation,
          gameDuration,
          timeline,
          isOlderThan1Year,
          isRemake,
        })

        // Check patch acceptance with cache (this is fast, no need to parallelize)
        let patchAccepted = acceptedPatchesCache.has(patch)
        if (!patchAccepted && !rejectedPatchesCache.has(patch)) {
          patchAccepted = await isPatchAccepted(patch)
          if (patchAccepted) {
            acceptedPatchesCache.add(patch)
          } else {
            rejectedPatchesCache.add(patch)
          }
        }

        // prepare stats update for tracked user (new matches only)
        let statsUpdate = null
        if (!existingMatch && patchAccepted && !isRemake) {
          const trackedIdx = match.info.participants.findIndex((p: any) => p.puuid === puuid)
          if (trackedIdx !== -1) {
            const p = match.info.participants[trackedIdx]
            const participantId = trackedIdx + 1

            let abilityOrderStr = null
            let buildOrderForStats: number[] = []
            let firstBuyForStats = ''

            if (!isOlderThan1Year && timeline) {
              abilityOrderStr = extractAbilityOrder(timeline, participantId)
              const buildOrder = extractBuildOrder(timeline, participantId)
              const firstBuy = extractFirstBuy(timeline, participantId)
              buildOrderForStats = buildOrder.filter((id: number) => isFinishedItem(id)).slice(0, 6)
              firstBuyForStats = firstBuy.length > 0 ? (formatFirstBuy(firstBuy) || '') : ''
            }

            const runes = extractRunes(p)

            statsUpdate = {
              champion_name: p.championName,
              patch,
              win: p.win,
              items: buildOrderForStats.length > 0 ? buildOrderForStats : [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id: number) => id > 0 && isFinishedItem(id)),
              first_buy: firstBuyForStats || null,
              keystone_id: runes.primary.perks[0] || 0,
              rune1: runes.primary.perks[1] || 0,
              rune2: runes.primary.perks[2] || 0,
              rune3: runes.primary.perks[3] || 0,
              rune4: runes.secondary.perks[0] || 0,
              rune5: runes.secondary.perks[1] || 0,
              rune_tree_primary: runes.primary.style,
              rune_tree_secondary: runes.secondary.style,
              stat_perk0: runes.statPerks[0],
              stat_perk1: runes.statPerks[1],
              stat_perk2: runes.statPerks[2],
              spell1_id: p.summoner1Id || 0,
              spell2_id: p.summoner2Id || 0,
              skill_order: abilityOrderStr ? extractSkillOrderAbbreviation(abilityOrderStr) : null,
              damage_to_champions: p.totalDamageDealtToChampions || 0,
              total_damage: p.totalDamageDealt || 0,
              healing: p.totalHealsOnTeammates || 0,
              shielding: p.totalDamageShieldedOnTeammates || 0,
              cc_time: p.timeCCingOthers || 0,
              game_duration: gameDuration,
              deaths: p.deaths || 0,
            }
          }
        }

        return { statsUpdate, records, success: true }
      } catch (err) {
        console.error(`Failed to process match ${result.matchId}:`, err)
        return { statsUpdate: null, records: [], success: false }
      }
    })

    const processedMatches = await Promise.all(matchProcessingPromises)

    // Collect all records and stats updates
    for (const processed of processedMatches) {
      if (processed.success) fetchedInChunk++
      if (processed.records.length > 0) allRecordsToInsert.push(...processed.records)
      if (processed.statsUpdate) statsAggregator.add(processed.statsUpdate)
    }

    // Batch upsert all summoner_matches records in chunks with retry logic
    // Use upsert to overwrite existing records (needed for recalculating PIG scores)
    if (allRecordsToInsert.length > 0) {
      const UPSERT_BATCH_SIZE = 50 // Reduced from 100 to prevent timeouts
      for (let i = 0; i < allRecordsToInsert.length; i += UPSERT_BATCH_SIZE) {
        const batch = allRecordsToInsert.slice(i, i + UPSERT_BATCH_SIZE)
        try {
          await retryWithBackoff(
            async () => {
              const { error } = await supabase.from('summoner_matches').upsert(batch)
              if (error) throw error
            },
            `Summoner matches upsert batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`
          )
        } catch (batchUpsertError: any) {
          console.error(`[UpdateProfile] Batch upsert error after retries (${i}-${i + batch.length}):`, batchUpsertError.message)
          // Final fallback: retry each record individually
          for (const record of batch) {
            try {
              await supabase.from('summoner_matches').upsert(record)
            } catch (retryError: any) {
              console.error(`[UpdateProfile] Individual retry failed for ${record.match_id}:`, retryError.message)
            }
          }
        }
      }
    }

    // Add stats to aggregator but DO NOT flush yet
    // The scraper or a scheduled job will handle flushing to prevent write contention
    // statsAggregator is in-memory and per-instance, so this data might be lost if the Vercel function dies
    // However, for global stats, losing a few user updates is acceptable vs crashing the DB
    // Ideally, we'd write to a 'pending_stats' table, but for now we just skip the flush
    
    // Keep failed matches in the pending queue for retry in next chunk
    const failedMatchIds = failedMatches.map(f => f.matchId)
    const updatedPendingIds = [...failedMatchIds, ...remainingMatchIds]
    
    await updateJobProgress(supabase, job.id, job.fetched_matches + fetchedInChunk, updatedPendingIds)

    // If we've failed the same matches multiple times, eventually give up
    // note: retry logic is handled by leaving failed matches in pending queue
    const shouldFail = failedMatches.length > 0 && remainingMatchIds.length === 0 && pendingMatchIds.every(id => failedMatches.some(f => f.matchId === id))
    
    if (shouldFail) {
      const errorSummary = failedMatches.slice(0, 5).map(f => `${f.matchId.split('_')[1]}: ${f.error}`).join('; ')
      await failJob(supabase, job.id, `Failed to fetch ${failedMatches.length} matches after retries`)
      return NextResponse.json({
        error: `Failed to fetch ${failedMatches.length} matches`,
        jobId: job.id,
        failedMatches,
        errorCode: `Error codes: ${errorSummary}${failedMatches.length > 5 ? '...' : ''}`,
      }, { status: 500 })
    }

    return NextResponse.json({
      message: updatedPendingIds.length > 0 ? 'Processing...' : 'Completing...',
      jobId: job.id,
      puuid: job.puuid,
      region: job.region,
      newMatches: job.total_matches,
      progress: job.fetched_matches + fetchedInChunk,
      remaining: updatedPendingIds.length,
      hasMore: updatedPendingIds.length > 0,
      failedInChunk: failedMatches.length,
    })
  } catch (error: any) {
    console.error('[UpdateProfile] Chunk error:', error)
    await failJob(supabase, job.id, error.message || 'unknown error')
    return NextResponse.json({ error: error.message || 'Failed to process matches' }, { status: 500 })
  }
}

async function finalizeJob(supabase: any, jobId: string, puuid: string) {
  // run independent operations in parallel for faster finalization
  // pig score calculation is now handled separately via /api/calculate-pig-scores
  const [, statsResult] = await Promise.allSettled([
    supabase.from('summoners').update({ last_updated: new Date().toISOString() }).eq('puuid', puuid),
    recalculateProfileStatsForPlayers([puuid]),
  ])
  
  if (statsResult.status === 'rejected') {
    console.error('[UpdateProfile] Failed to finalize stats:', statsResult.reason)
  }
  
  await completeJob(supabase, jobId)
}
