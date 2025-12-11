import { NextResponse } from 'next/server'
import {
  createAdminClient,
  statsAggregator,
  flushAggregatedStats,
  isFinishedItem,
  extractSkillOrderAbbreviation,
  extractRunes,
  processParticipants,
  calculateTeamKills,
  prepareStatsCache,
} from '@/lib/db'
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
import { calculatePigScoreWithBreakdownCached, prefetchChampionStats, recalculateProfileStatsForPlayers } from '@/lib/scoring'
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
// CONFIGURATION
// ============================================================================

const CHUNK_SIZE = 10 // matches per chunk (parallel fetch + batch process = ~25-35s total)
const processingLocks = new Map<string, Promise<Response>>()

// ============================================================================
// JOB MANAGEMENT
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
    .select('*')
    .eq('puuid', puuid)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
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

async function fetchMatchIds(region: string, puuid: string, count?: number, requestType: RequestType = 'batch') {
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
// PIG SCORE CALCULATION FOR MISSING MATCHES
// ============================================================================

async function calculateMissingPigScores(supabase: any, puuid: string) {
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000

  const { data: recentMatches, error } = await supabase
    .from('summoner_matches')
    .select('match_id, puuid, match_data, patch, champion_name, game_creation, matches!inner(game_duration)')
    .eq('puuid', puuid)
    .gte('game_creation', oneYearAgo)
    .order('game_creation', { ascending: false })
    .limit(30)

  if (error || !recentMatches) return 0

  const needsPigScore = recentMatches.filter((m: any) =>
    m.match_data?.pigScore === null || m.match_data?.pigScore === undefined
  ).filter((m: any) => !m.match_data?.isRemake)

  if (needsPigScore.length === 0) return 0

  const championNames = [...new Set<string>(needsPigScore.map((m: any) => m.champion_name))]
  const statsCache = await prefetchChampionStats(championNames)

  let calculated = 0
  for (let i = 0; i < needsPigScore.length; i += 5) {
    await Promise.all(needsPigScore.slice(i, i + 5).map(async (match: any) => {
      try {
        const breakdown = await calculatePigScoreWithBreakdownCached({
          championName: match.champion_name,
          damage_dealt_to_champions: match.match_data.stats?.damage || 0,
          total_damage_dealt: match.match_data.stats?.totalDamageDealt || 0,
          total_heals_on_teammates: match.match_data.stats?.totalHealsOnTeammates || 0,
          total_damage_shielded_on_teammates: match.match_data.stats?.totalDamageShieldedOnTeammates || 0,
          time_ccing_others: match.match_data.stats?.timeCCingOthers || 0,
          game_duration: match.matches?.game_duration || 0,
          deaths: match.match_data.deaths || 0,
          item0: match.match_data.items?.[0] || 0,
          item1: match.match_data.items?.[1] || 0,
          item2: match.match_data.items?.[2] || 0,
          item3: match.match_data.items?.[3] || 0,
          item4: match.match_data.items?.[4] || 0,
          item5: match.match_data.items?.[5] || 0,
          perk0: match.match_data.runes?.primary?.perks?.[0] || 0,
          patch: match.patch,
          spell1: match.match_data.spells?.[0] || 0,
          spell2: match.match_data.spells?.[1] || 0,
          skillOrder: extractSkillOrderAbbreviation(match.match_data.abilityOrder || ''),
          buildOrder: match.match_data.buildOrder,
          firstBuy: match.match_data.firstBuy,
        }, statsCache)

        if (breakdown) {
          await supabase
            .from('summoner_matches')
            .update({ match_data: { ...match.match_data, pigScore: breakdown.finalScore, pigScoreBreakdown: breakdown } })
            .eq('match_id', match.match_id)
            .eq('puuid', match.puuid)
          calculated++
        }
      } catch {}
    }))
  }
  return calculated
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

    const lockKey = `${region}:${gameName}:${tagLine}`.toLowerCase()
    const existingLock = processingLocks.get(lockKey)
    if (existingLock) {
      // Wait for the existing lock to complete and return a fresh response
      try {
        await existingLock
      } catch {
        // Ignore errors from the locked request
      }
      // Return a new response indicating processing is ongoing
      return NextResponse.json({ 
        message: 'Profile update already in progress',
        isProcessing: true 
      })
    }

    const processPromise = processProfileUpdate(region, gameName, tagLine, platform)
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

async function processProfileUpdate(region: string, gameName: string, tagLine: string, platform: string): Promise<Response> {
  let jobId: string | null = null
  const supabase = createAdminClient()

  try {
    await cleanupStaleJobs(supabase)

    const accountData = await getAccountByRiotId(gameName, tagLine, region as any)
    if (!accountData) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    // check for existing active job
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
        const pigScoresCalculated = await calculateMissingPigScores(supabase, accountData.puuid)
        return NextResponse.json({ success: true, newMatches: 0, pigScoresCalculated, message: 'Profile is up to date' })
      }
    }

    // fetch full history
    const matchIds = await fetchMatchIds(region, accountData.puuid, undefined, 'batch')
    const newMatchIds = [...new Set(matchIds.filter(id => !existingMatchIds.has(id)))]

    if (newMatchIds.length === 0) {
      const pigScoresCalculated = await calculateMissingPigScores(supabase, accountData.puuid)
      return NextResponse.json({ success: true, newMatches: 0, pigScoresCalculated, message: 'Profile is up to date' })
    }

    jobId = await createJob(supabase, accountData.puuid, newMatchIds, region)

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

  if (pendingMatchIds.length === 0) {
    await finalizeJob(supabase, job.id, puuid)
    return NextResponse.json({ message: 'Update completed', jobId: job.id, newMatches: job.total_matches, completed: true })
  }

  const chunkToProcess = pendingMatchIds.slice(0, CHUNK_SIZE)
  const remainingMatchIds = pendingMatchIds.slice(CHUNK_SIZE)

  // pre-check existing records
  const [existingMatchesResult, existingUserRecordsResult] = await Promise.all([
    supabase.from('matches').select('match_id, game_creation, game_duration, patch').in('match_id', chunkToProcess),
    supabase.from('summoner_matches').select('match_id').eq('puuid', puuid).in('match_id', chunkToProcess),
  ])

  const existingMatchesMap = new Map(existingMatchesResult.data?.map((m: any) => [m.match_id, m]) || [])
  const userHasRecord = new Set(existingUserRecordsResult.data?.map((r: any) => r.match_id) || [])

  // Prefetch all champion stats for the entire chunk ONCE to avoid repeated DB calls
  let globalStatsCache: Map<string, any[]> = new Map()
  
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
        return { matchId, skip: true }
      }

      try {
        const match = await getMatchById(matchId, region as any, 'batch')
        const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
        const gameCreation = (existingMatch as any)?.game_creation || match.info.gameCreation
        const isOlderThan1Year = gameCreation < oneYearAgo
        const isRemake = match.info.participants.some((p: any) => p.gameEndedInEarlySurrender)

        // fetch timeline for recent matches (within 1 year)
        let timeline = null
        if (!isOlderThan1Year) {
          try { timeline = await getMatchTimeline(matchId, region as any, 'batch') } catch {}
        }

        return { matchId, match, existingMatch, gameCreation, isOlderThan1Year, isRemake, timeline, skip: false }
      } catch (err) {
        console.error(`Failed to fetch match ${matchId}:`, err)
        return { matchId, skip: true, error: err }
      }
    })

    const matchResults = await Promise.all(matchFetchPromises)

    // Populate global stats cache ONCE with all champions from all matches
    const allChampions = new Set<string>()
    for (const result of matchResults) {
      if (!result.skip && result.match && !result.isOlderThan1Year && !result.isRemake) {
        result.match.info.participants.forEach((p: any) => allChampions.add(p.championName))
      }
    }
    if (allChampions.size > 0) {
      globalStatsCache = await prefetchChampionStats([...allChampions])
    }

    // SEQUENTIAL: Process results and write to DB (must be sequential for DB consistency)
    for (const result of matchResults) {
      if (result.skip) {
        if (!result.error) fetchedInChunk++
        continue
      }

      try {
        const { matchId, match, existingMatch, gameCreation, isOlderThan1Year, isRemake, timeline } = result
        if (!match) continue // Skip if match fetch failed
        
        const patch = (existingMatch as any)?.patch || (match.info.gameVersion ? extractPatch(match.info.gameVersion) : getPatchFromDate(gameCreation!))
        const gameDuration = (existingMatch as any)?.game_duration || match.info.gameDuration

        // store match if new
        if (!existingMatch) {
          await supabase.from('matches').upsert({
            match_id: match.metadata.matchId,
            game_creation: gameCreation,
            game_duration: gameDuration,
            patch,
          })
        }

        const statsCache = isOlderThan1Year || isRemake ? new Map() : globalStatsCache
        const teamKills = calculateTeamKills(match.info.participants)

        const records = await processParticipants({
          match,
          matchId: existingMatch ? matchId : match.metadata.matchId,
          patch,
          gameCreation,
          gameDuration,
          timeline,
          isOlderThan1Year,
          isRemake,
          statsCache,
          team100Kills: teamKills.team100,
          team200Kills: teamKills.team200,
        })

        // Batch ALL participant records for stats calculation and upsert
        allRecordsToInsert.push(...records)

        // Check patch acceptance with cache
        let patchAccepted = acceptedPatchesCache.has(patch)
        if (!patchAccepted && !rejectedPatchesCache.has(patch)) {
          patchAccepted = await isPatchAccepted(patch)
          if (patchAccepted) {
            acceptedPatchesCache.add(patch)
          } else {
            rejectedPatchesCache.add(patch)
          }
        }

        // update champion stats for tracked user (new matches only)
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

            statsAggregator.add({
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
            })
          }
        }

        fetchedInChunk++
      } catch (err) {
        console.error(`Failed to process match ${result.matchId}:`, err)
      }
    }

    // Batch upsert all summoner_matches records in smaller chunks to avoid timeout
    // Use upsert to overwrite existing records (needed for recalculating PIG scores)
    if (allRecordsToInsert.length > 0) {
      const UPSERT_BATCH_SIZE = 50 // Upsert 50 records at a time (5 matches worth)
      for (let i = 0; i < allRecordsToInsert.length; i += UPSERT_BATCH_SIZE) {
        const batch = allRecordsToInsert.slice(i, i + UPSERT_BATCH_SIZE)
        const { error: batchUpsertError } = await supabase.from('summoner_matches').upsert(batch)
        if (batchUpsertError) {
          console.error(`[UpdateProfile] Batch upsert error (${i}-${i + batch.length}):`, batchUpsertError)
        }
      }
    }

    await updateJobProgress(supabase, job.id, job.fetched_matches + fetchedInChunk, remainingMatchIds)

    return NextResponse.json({
      message: remainingMatchIds.length > 0 ? 'Processing...' : 'Completing...',
      jobId: job.id,
      newMatches: job.total_matches,
      progress: job.fetched_matches + fetchedInChunk,
      remaining: remainingMatchIds.length,
      hasMore: remainingMatchIds.length > 0,
    })
  } catch (error: any) {
    console.error('[UpdateProfile] Chunk error:', error)
    await failJob(supabase, job.id, error.message || 'unknown error')
    return NextResponse.json({ error: error.message || 'Failed to process matches' }, { status: 500 })
  }
}

async function finalizeJob(supabase: any, jobId: string, puuid: string) {
  await supabase.from('summoners').update({ last_updated: new Date().toISOString() }).eq('puuid', puuid)
  await calculateMissingPigScores(supabase, puuid)
  await recalculateProfileStatsForPlayers([puuid])
  const result = await flushAggregatedStats()
  if (!result.success && result.error) console.error('[UpdateProfile] Failed to flush stats:', result.error)
  await completeJob(supabase, jobId)
}
