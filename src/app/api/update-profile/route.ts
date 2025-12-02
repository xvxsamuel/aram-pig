import { NextResponse } from 'next/server'
import { createAdminClient, statsAggregator, flushAggregatedStats } from '@/lib/db'
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
  formatBuildOrder,
  formatFirstBuy,
  extractItemTimeline,
  type ItemTimelineEvent,
  extractPatch,
  getPatchFromDate,
  isPatchAccepted,
} from '@/lib/game'
import { getKillDeathSummary } from '@/lib/game/kill-timeline'
import itemsData from '../../../data/items.json'

// in-memory lock to prevent concurrent processing of same profile (handles Strict Mode double-invoke)
const processingLocks = new Map<string, Promise<Response>>()

// helper to check if item is a finished item (legendary or boots)
const isFinishedItem = (itemId: number): boolean => {
  const item = (itemsData as Record<string, any>)[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
}

// helper to extract skill max order abbreviation (e.g., "qwe" for Q>W>E)
function extractSkillOrderAbbreviation(abilityOrder: string): string {
  if (!abilityOrder || abilityOrder.length === 0) return ''

  const abilities = abilityOrder.split(' ')
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []

  for (const ability of abilities) {
    if (ability in counts) {
      counts[ability as keyof typeof counts]++
      if (ability !== 'R' && counts[ability as keyof typeof counts] === 5) {
        maxOrder.push(ability.toLowerCase())
      }
    }
  }

  const result = maxOrder.join('')
  if (result.length === 1) return ''
  if (result.length === 2) {
    const abilitiesList = ['q', 'w', 'e']
    const missing = abilitiesList.find(a => !result.includes(a))
    return missing ? result + missing : result
  }
  return result
}

// chunked processing configuration
// Process 12 matches per chunk (~3s each = ~36s, well under 60s Vercel timeout)
const CHUNK_SIZE = 12

async function fetchMatchIds(region: string, puuid: string, count?: number, requestType: RequestType = 'batch') {
  const allMatchIds: string[] = []
  const maxPerRequest = 100
  let start = 0

  while (true) {
    if (count && allMatchIds.length >= count) break

    const batchCount = count ? Math.min(maxPerRequest, count - allMatchIds.length) : maxPerRequest

    const batchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchCount, start, requestType)

    if (batchIds.length === 0) break

    allMatchIds.push(...batchIds)

    if (batchIds.length < maxPerRequest) break

    start += maxPerRequest
  }

  return allMatchIds
}

async function fetchMatch(region: string, matchId: string, requestType: RequestType = 'batch') {
  return await getMatchById(matchId, region as any, requestType)
}

// cleanup stale jobs before starting new one
async function cleanupStaleJobs(supabase: any) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  // cleanup jobs older than 30 minutes
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: 'job timed out after 30 minutes',
      completed_at: new Date().toISOString(),
    })
    .in('status', ['pending', 'processing'])
    .lt('started_at', thirtyMinutesAgo)

  // cleanup processing jobs with no progress update in 5 minutes (likely orphaned)
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: 'job stalled - no progress in 5 minutes',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .lt('updated_at', fiveMinutesAgo)
}

// check for existing active job
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

// create new job with pending matches
async function createJob(
  supabase: any,
  puuid: string,
  matchIds: string[],
  region: string,
  etaSeconds: number
): Promise<string> {
  const { data, error } = await supabase
    .from('update_jobs')
    .insert({
      puuid,
      status: 'processing',
      total_matches: matchIds.length,
      fetched_matches: 0,
      eta_seconds: etaSeconds,
      pending_match_ids: matchIds,
      region: region,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`failed to create job: ${error.message}`)
  }

  return data.id
}

// update job progress with remaining matches
async function updateJobProgress(
  supabase: any,
  jobId: string,
  fetchedMatches: number,
  totalMatches: number,
  remainingMatchIds: string[]
) {
  // estimate ~3s per match for remaining
  const etaSeconds = Math.ceil(remainingMatchIds.length * 3)

  await supabase
    .from('update_jobs')
    .update({
      fetched_matches: fetchedMatches,
      eta_seconds: etaSeconds,
      pending_match_ids: remainingMatchIds,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

// mark job as completed
async function completeJob(supabase: any, jobId: string) {
  await supabase
    .from('update_jobs')
    .update({
      status: 'completed',
      pending_match_ids: [],
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

// mark job as failed
async function failJob(supabase: any, jobId: string, errorMessage: string) {
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

// check and calculate missing pig scores for recent matches (within 30 days)
// OPTIMIZED: Pre-fetches all champion stats in one query
async function calculateMissingPigScores(supabase: any, puuid: string) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  const { data: recentMatches, error: fetchError } = await supabase
    .from('summoner_matches')
    .select(
      'match_id, puuid, match_data, patch, champion_name, game_creation, matches!inner(game_duration, game_creation)'
    )
    .eq('puuid', puuid)
    .gte('game_creation', thirtyDaysAgo)
    .order('game_creation', { ascending: false })
    .limit(30)

  if (fetchError || !recentMatches) {
    console.error('[UpdateProfile] Error fetching recent matches for pig score calculation:', fetchError)
    return 0
  }

  const matchesNeedingPigScore = recentMatches.filter((m: any) => {
    const hasPigScore = m.match_data?.pigScore !== null && m.match_data?.pigScore !== undefined
    const isRemake = m.match_data?.isRemake === true
    return !hasPigScore && !isRemake
  })

  if (matchesNeedingPigScore.length === 0) {
    return 0
  }

  console.log(`[UpdateProfile] Calculating pig scores for ${matchesNeedingPigScore.length} matches...`)

  // Pre-fetch all champion stats in one query
  const championNames = [...new Set(matchesNeedingPigScore.map((m: any) => m.champion_name))]
  const statsCache = await prefetchChampionStats(championNames)

  let calculated = 0
  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5
  for (let i = 0; i < matchesNeedingPigScore.length; i += BATCH_SIZE) {
    const batch = matchesNeedingPigScore.slice(i, i + BATCH_SIZE)
    
    await Promise.all(batch.map(async (match: any) => {
      try {
        const gameDuration = match.matches?.game_duration || 0

        const breakdown = await calculatePigScoreWithBreakdownCached({
          championName: match.champion_name,
          damage_dealt_to_champions: match.match_data.stats?.damage || 0,
          total_damage_dealt: match.match_data.stats?.totalDamageDealt || 0,
          total_heals_on_teammates: match.match_data.stats?.totalHealsOnTeammates || 0,
          total_damage_shielded_on_teammates: match.match_data.stats?.totalDamageShieldedOnTeammates || 0,
          time_ccing_others: match.match_data.stats?.timeCCingOthers || 0,
          game_duration: gameDuration,
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
          buildOrder: match.match_data.buildOrder || undefined,
          firstBuy: match.match_data.firstBuy || undefined,
        }, statsCache)

        if (breakdown) {
          const updatedMatchData = {
            ...match.match_data,
            pigScore: breakdown.finalScore,
            pigScoreBreakdown: breakdown,
          }

          await supabase
            .from('summoner_matches')
            .update({ match_data: updatedMatchData })
            .eq('match_id', match.match_id)
            .eq('puuid', match.puuid)

          calculated++
        }
      } catch (err) {
        console.error(`[UpdateProfile] Failed to calculate pig score for ${match.match_id}:`, err)
      }
    }))
  }

  return calculated
}

export async function POST(request: Request) {
  try {
    const { region, gameName, tagLine, platform } = await request.json()

    if (!region || !gameName || !tagLine || !platform) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // check if already processing this profile (handles Strict Mode double-invoke)
    const lockKey = `${region}:${gameName}:${tagLine}`.toLowerCase()
    const existingLock = processingLocks.get(lockKey)
    if (existingLock) {
      console.log(`[UpdateProfile] Already processing ${gameName}#${tagLine}, waiting for result...`)
      return existingLock
    }

    // create processing promise and store it
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

async function processProfileUpdate(
  region: string,
  gameName: string,
  tagLine: string,
  platform: string
): Promise<Response> {
  let jobId: string | null = null
  try {
    const supabase = createAdminClient()

    // cleanup stale jobs first
    await cleanupStaleJobs(supabase)

    // riot
    const accountData = await getAccountByRiotId(gameName, tagLine, region as any)
    if (!accountData) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // check for existing active job - if it has pending matches, continue processing
    const existingJob = await getActiveJob(supabase, accountData.puuid)
    if (existingJob) {
      // if job has pending matches, continue processing them
      if (existingJob.pending_match_ids && existingJob.pending_match_ids.length > 0) {
        console.log(
          `[UpdateProfile] Resuming job ${existingJob.id} with ${existingJob.pending_match_ids.length} pending matches`
        )
        return await continueProcessingJob(supabase, existingJob, region, accountData.puuid)
      }

      // job exists but no pending matches - finalize it now
      console.log(`[UpdateProfile] Job ${existingJob.id} has no pending matches, finalizing...`)
      await finalizeJob(supabase, existingJob.id, accountData.puuid)
      return NextResponse.json({
        message: 'Update completed',
        jobId: existingJob.id,
        newMatches: existingJob.total_matches,
        completed: true,
      })
    }

    // check for 5-minute cooldown
    const { data: existingSummoner } = await supabase
      .from('summoners')
      .select('last_updated')
      .eq('puuid', accountData.puuid)
      .single()

    if (existingSummoner?.last_updated) {
      const lastUpdatedTime = new Date(existingSummoner.last_updated).getTime()
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

      if (lastUpdatedTime > fiveMinutesAgo) {
        return NextResponse.json({
          message: 'Profile updated recently, please wait',
          recentlyUpdated: true,
          newMatches: 0,
        })
      }
    }

    const summonerData = await getSummonerByPuuid(accountData.puuid, platform as PlatformCode)
    if (!summonerData) {
      return NextResponse.json({ error: 'Summoner not found' }, { status: 404 })
    }

    // update summoner data
    const { error: summonerError } = await supabase.from('summoners').upsert({
      puuid: accountData.puuid,
      game_name: accountData.gameName,
      tag_line: accountData.tagLine,
      summoner_level: summonerData.summonerLevel,
      profile_icon_id: summonerData.profileIconId,
      region: platform,
    })

    if (summonerError) {
      console.error('Summoner upsert error:', summonerError)
      return NextResponse.json({ error: 'Failed to update summoner data' }, { status: 500 })
    }

    const { data: existingMatches } = await supabase
      .from('summoner_matches')
      .select('match_id')
      .eq('puuid', accountData.puuid)

    const existingMatchIds = new Set(existingMatches?.map((m: { match_id: string }) => m.match_id) || [])

    console.log(`[UpdateProfile] Found ${existingMatchIds.size} existing matches for puuid ${accountData.puuid}`)

    // check if last job failed - if so, skip quick check
    const { data: lastJob } = await supabase
      .from('update_jobs')
      .select('status, error_message')
      .eq('puuid', accountData.puuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastJobFailed = lastJob?.status === 'failed'
    const shouldSkipQuickCheck = lastJobFailed || existingMatchIds.size === 0

    // Quick check: fetch match IDs and compare
    if (!shouldSkipQuickCheck) {
      console.log('[UpdateProfile] Quick check: fetching recent match IDs...')
      const quickCheckIds = await fetchMatchIds(region, accountData.puuid, 100, 'overhead')

      const missingForPlayer = quickCheckIds.filter((id: string) => !existingMatchIds.has(id))

      if (missingForPlayer.length === 0) {
        console.log('[UpdateProfile] No new matches found')
        const pigScoresCalculated = await calculateMissingPigScores(supabase, accountData.puuid)

        return NextResponse.json({
          success: true,
          newMatches: 0,
          pigScoresCalculated,
          message:
            pigScoresCalculated > 0
              ? `Profile is up to date, calculated ${pigScoresCalculated} pig scores`
              : 'Profile is already up to date',
        })
      }

      console.log(`[UpdateProfile] Quick check found ${missingForPlayer.length} new matches`)
    }

    console.log('[UpdateProfile] Fetching full match history...')
    const matchIds = await fetchMatchIds(region, accountData.puuid, undefined, 'batch')

    const newMatchIdsRaw = matchIds.filter((id: string) => !existingMatchIds.has(id))
    const newMatchIds = [...new Set(newMatchIdsRaw)]

    console.log(`[UpdateProfile] Found ${newMatchIds.length} new matches to process`)

    if (newMatchIds.length === 0) {
      const pigScoresCalculated = await calculateMissingPigScores(supabase, accountData.puuid)
      return NextResponse.json({
        success: true,
        newMatches: 0,
        pigScoresCalculated,
        message: 'Profile is already up to date',
      })
    }

    // create job with all pending matches
    const etaSeconds = Math.ceil(newMatchIds.length * 3)
    jobId = await createJob(supabase, accountData.puuid, newMatchIds, region, etaSeconds)
    console.log(`[UpdateProfile] Created job ${jobId} for ${newMatchIds.length} matches`)

    // process first chunk immediately
    const job: UpdateJob = {
      id: jobId,
      puuid: accountData.puuid,
      status: 'processing',
      total_matches: newMatchIds.length,
      fetched_matches: 0,
      eta_seconds: etaSeconds,
      pending_match_ids: newMatchIds,
      region: region,
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    }

    return await continueProcessingJob(supabase, job, region, accountData.puuid)
  } catch (error: any) {
    console.error('[UpdateProfile] Error:', error)

    if (jobId) {
      const supabase = createAdminClient()
      await failJob(supabase, jobId, error.message || 'unknown error')
    }

    return NextResponse.json({ error: error.message || 'Failed to update profile' }, { status: 500 })
  }
}

// continue processing an existing job - process one chunk and return
async function continueProcessingJob(supabase: any, job: UpdateJob, region: string, puuid: string): Promise<Response> {
  const pendingMatchIds = job.pending_match_ids || []

  if (pendingMatchIds.length === 0) {
    // no more matches - finalize job
    await finalizeJob(supabase, job.id, puuid)
    return NextResponse.json({
      message: 'Update completed',
      jobId: job.id,
      newMatches: job.total_matches,
      completed: true,
    })
  }

  // take next chunk
  const chunkToProcess = pendingMatchIds.slice(0, CHUNK_SIZE)
  const remainingMatchIds = pendingMatchIds.slice(CHUNK_SIZE)

  console.log(
    `[UpdateProfile] Processing chunk of ${chunkToProcess.length} matches (${remainingMatchIds.length} remaining)`
  )

  const requestType: RequestType = 'batch'
  const processedMatches = new Set<string>()
  let fetchedInChunk = 0

  // batch pre-check for existing matches
  const [existingMatchesResult, existingUserRecordsResult] = await Promise.all([
    supabase.from('matches').select('match_id, game_creation, game_duration, patch').in('match_id', chunkToProcess),
    supabase.from('summoner_matches').select('match_id').eq('puuid', puuid).in('match_id', chunkToProcess),
  ])

  const existingMatchesMap = new Map<string, any>()
  for (const match of existingMatchesResult.data || []) {
    existingMatchesMap.set(match.match_id, match)
  }

  const userHasRecord = new Set<string>()
  for (const record of existingUserRecordsResult.data || []) {
    userHasRecord.add(record.match_id)
  }

  try {
    for (const matchId of chunkToProcess) {
      if (processedMatches.has(matchId)) continue
      processedMatches.add(matchId)

      try {
        const existingMatch = existingMatchesMap.get(matchId)
        const existingUserRecord = userHasRecord.has(matchId)

        if (existingMatch && existingUserRecord) {
          // user already has this match
          fetchedInChunk++
          continue
        }

        if (existingMatch) {
          // match exists but user doesn't have record - fetch match + timeline and add all records
          const match = await fetchMatch(region, matchId, requestType)
          const isOlderThan30Days = existingMatch.game_creation < Date.now() - 30 * 24 * 60 * 60 * 1000
          const isRemake = match.info.participants.some((p: any) => p.gameEndedInEarlySurrender)

          // Fetch timeline for recent matches (same as new matches)
          let timeline = null
          if (!isOlderThan30Days) {
            try {
              timeline = await getMatchTimeline(matchId, region as any, requestType)
            } catch {}
          }

          // Pre-fetch champion stats for ALL participants
          const allChampionNames = match.info.participants.map((p: any) => p.championName)
          const statsCache = !isOlderThan30Days && !isRemake
            ? await prefetchChampionStats(allChampionNames)
            : new Map()

          // Calculate team kills for KP
          const team100Kills = match.info.participants
            .filter((p: any) => p.teamId === 100)
            .reduce((sum: number, p: any) => sum + (p.kills || 0), 0)
          const team200Kills = match.info.participants
            .filter((p: any) => p.teamId === 200)
            .reduce((sum: number, p: any) => sum + (p.kills || 0), 0)

          const summonerMatchRecords = await Promise.all(
            match.info.participants.map(async (p: any, index: number) => {
              const participantId = index + 1
              const teamTotalKills = p.teamId === 100 ? team100Kills : team200Kills

              // Extract timeline data for ALL participants
              let abilityOrder = null
              let buildOrderStr = null
              let firstBuyStr = null
              let itemPurchases: ItemTimelineEvent[] = []

              if (!isOlderThan30Days && timeline) {
                abilityOrder = extractAbilityOrder(timeline, participantId)
                const buildOrder = extractBuildOrder(timeline, participantId)
                const firstBuy = extractFirstBuy(timeline, participantId)
                itemPurchases = extractItemTimeline(timeline, participantId)
                buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
                firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
              }

              // Calculate PIG score for ALL players
              let pigScore = null
              let pigScoreBreakdown = null
              if (!isOlderThan30Days && !isRemake && statsCache.size > 0) {
                try {
                  const killDeathSummary = timeline ? getKillDeathSummary(timeline, participantId, p.teamId) : null

                  const breakdown = await calculatePigScoreWithBreakdownCached({
                    championName: p.championName,
                    damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
                    total_damage_dealt: p.totalDamageDealt || 0,
                    total_heals_on_teammates: p.totalHealsOnTeammates || 0,
                    total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
                    time_ccing_others: p.timeCCingOthers || 0,
                    game_duration: match.info.gameDuration || 0,
                    deaths: p.deaths,
                    kills: p.kills,
                    assists: p.assists,
                    teamTotalKills,
                    item0: p.item0 || 0,
                    item1: p.item1,
                    item2: p.item2,
                    item3: p.item3,
                    item4: p.item4,
                    item5: p.item5,
                    perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
                    patch: existingMatch.patch,
                    spell1: p.summoner1Id || 0,
                    spell2: p.summoner2Id || 0,
                    skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
                    buildOrder: buildOrderStr || undefined,
                    firstBuy: firstBuyStr || undefined,
                    takedownQualityScore: killDeathSummary?.takedownScore,
                    deathQualityScore: killDeathSummary?.deathScore,
                  }, statsCache)
                  if (breakdown) {
                    pigScore = breakdown.finalScore
                    pigScoreBreakdown = breakdown
                  }
                } catch {}
              }

              return {
                puuid: p.puuid,
                match_id: matchId,
                champion_name: p.championName,
                riot_id_game_name: p.riotIdGameName || '',
                riot_id_tagline: p.riotIdTagline || '',
                win: p.win,
                game_creation: existingMatch.game_creation,
                patch: existingMatch.patch,
                match_data: {
                  kills: p.kills,
                  deaths: p.deaths,
                  assists: p.assists,
                  level: p.champLevel || 0,
                  teamId: p.teamId || 0,
                  isRemake: p.gameEndedInEarlySurrender || false,
                  stats: {
                    damage: p.totalDamageDealtToChampions || 0,
                    gold: p.goldEarned || 0,
                    cs: p.totalMinionsKilled || 0,
                    doubleKills: p.doubleKills || 0,
                    tripleKills: p.tripleKills || 0,
                    quadraKills: p.quadraKills || 0,
                    pentaKills: p.pentaKills || 0,
                    totalDamageDealt: p.totalDamageDealt || 0,
                    timeCCingOthers: p.timeCCingOthers || 0,
                    totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
                    totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0,
                  },
                  items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id: number) => id > 0),
                  spells: [p.summoner1Id || 0, p.summoner2Id || 0],
                  runes: {
                    primary: {
                      style: p.perks?.styles?.[0]?.style || 0,
                      perks: p.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0, 0, 0, 0],
                    },
                    secondary: {
                      style: p.perks?.styles?.[1]?.style || 0,
                      perks: p.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0, 0],
                    },
                    statPerks: [
                      p.perks?.statPerks?.offense || 0,
                      p.perks?.statPerks?.flex || 0,
                      p.perks?.statPerks?.defense || 0,
                    ],
                  },
                  pigScore,
                  pigScoreBreakdown,
                  abilityOrder,
                  buildOrder: buildOrderStr,
                  firstBuy: firstBuyStr,
                  itemPurchases: itemPurchases.length > 0 ? itemPurchases : null,
                },
              }
            })
          )

          await supabase.from('summoner_matches').insert(summonerMatchRecords).select()

          fetchedInChunk++
          continue
        }

        // new match - fetch full data with timeline
        const match = await fetchMatch(region, matchId, requestType)

        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const matchDate = match.info.gameCreation
        const isOlderThan30Days = matchDate < thirtyDaysAgo

        let timeline = null
        if (!isOlderThan30Days) {
          try {
            timeline = await getMatchTimeline(matchId, region as any, requestType)
          } catch {}
        }

        const patchVersion = match.info.gameVersion
          ? extractPatch(match.info.gameVersion)
          : getPatchFromDate(match.info.gameCreation)

        // store match
        await supabase.from('matches').upsert({
          match_id: match.metadata.matchId,
          game_creation: match.info.gameCreation,
          game_duration: match.info.gameDuration,
          patch: patchVersion,
        })

        // Pre-fetch champion stats for ALL participants in one query (optimization)
        const allChampionNames = match.info.participants.map((p: any) => p.championName)
        const statsCache = !isOlderThan30Days && !match.info.participants.some((p: any) => p.gameEndedInEarlySurrender)
          ? await prefetchChampionStats(allChampionNames)
          : new Map()

        // Calculate team total kills for KP calculation
        const team100Kills = match.info.participants
          .filter((p: any) => p.teamId === 100)
          .reduce((sum: number, p: any) => sum + (p.kills || 0), 0)
        const team200Kills = match.info.participants
          .filter((p: any) => p.teamId === 200)
          .reduce((sum: number, p: any) => sum + (p.kills || 0), 0)

        // prepare participant records - calculate PIG for ALL players
        const summonerMatchRecords = await Promise.all(
          match.info.participants.map(async (p: any, index: number) => {
            const participantId = index + 1
            const _isTrackedUser = p.puuid === puuid // Kept for debugging
            const teamTotalKills = p.teamId === 100 ? team100Kills : team200Kills

            // Extract timeline data for ALL participants (not just tracked user)
            let abilityOrder = null
            let buildOrderStr = null
            let firstBuyStr = null
            let itemPurchases: ItemTimelineEvent[] = []

            if (!isOlderThan30Days && timeline) {
              abilityOrder = extractAbilityOrder(timeline, participantId)
              const buildOrder = extractBuildOrder(timeline, participantId)
              const firstBuy = extractFirstBuy(timeline, participantId)
              itemPurchases = extractItemTimeline(timeline, participantId)
              buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
              firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
            }

            // Calculate PIG score for ALL players (not just tracked user)
            let pigScore = null
            let pigScoreBreakdown = null
            if (!isOlderThan30Days && !p.gameEndedInEarlySurrender && statsCache.size > 0) {
              try {
                // Get kill/death quality scores from timeline if available
                const killDeathSummary = timeline ? getKillDeathSummary(timeline, participantId, p.teamId) : null

                const breakdown = await calculatePigScoreWithBreakdownCached({
                  championName: p.championName,
                  damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
                  total_damage_dealt: p.totalDamageDealt || 0,
                  total_heals_on_teammates: p.totalHealsOnTeammates || 0,
                  total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
                  time_ccing_others: p.timeCCingOthers || 0,
                  game_duration: match.info.gameDuration || 0,
                  deaths: p.deaths,
                  kills: p.kills,
                  assists: p.assists,
                  teamTotalKills,
                  item0: p.item0 || 0,
                  item1: p.item1,
                  item2: p.item2,
                  item3: p.item3,
                  item4: p.item4,
                  item5: p.item5,
                  perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
                  patch: patchVersion,
                  spell1: p.summoner1Id || 0,
                  spell2: p.summoner2Id || 0,
                  skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
                  buildOrder: buildOrderStr || undefined,
                  firstBuy: firstBuyStr || undefined,
                  takedownQualityScore: killDeathSummary?.takedownScore,
                  deathQualityScore: killDeathSummary?.deathScore,
                }, statsCache)
                if (breakdown) {
                  pigScore = breakdown.finalScore
                  pigScoreBreakdown = breakdown
                }
              } catch {}
            }

            return {
              puuid: p.puuid,
              match_id: match.metadata.matchId,
              champion_name: p.championName,
              riot_id_game_name: p.riotIdGameName || '',
              riot_id_tagline: p.riotIdTagline || '',
              win: p.win,
              game_creation: match.info.gameCreation,
              patch: patchVersion,
              match_data: {
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                level: p.champLevel || 0,
                teamId: p.teamId || 0,
                isRemake: p.gameEndedInEarlySurrender || false,
                stats: {
                  damage: p.totalDamageDealtToChampions || 0,
                  gold: p.goldEarned || 0,
                  cs: p.totalMinionsKilled || 0,
                  doubleKills: p.doubleKills || 0,
                  tripleKills: p.tripleKills || 0,
                  quadraKills: p.quadraKills || 0,
                  pentaKills: p.pentaKills || 0,
                  totalDamageDealt: p.totalDamageDealt || 0,
                  timeCCingOthers: p.timeCCingOthers || 0,
                  totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
                  totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0,
                },
                items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id: number) => id > 0),
                spells: [p.summoner1Id || 0, p.summoner2Id || 0],
                runes: {
                  primary: {
                    style: p.perks?.styles?.[0]?.style || 0,
                    perks: p.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0, 0, 0, 0],
                  },
                  secondary: {
                    style: p.perks?.styles?.[1]?.style || 0,
                    perks: p.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0, 0],
                  },
                  statPerks: [
                    p.perks?.statPerks?.offense || 0,
                    p.perks?.statPerks?.flex || 0,
                    p.perks?.statPerks?.defense || 0,
                  ],
                },
                pigScore,
                pigScoreBreakdown,
                abilityOrder,
                buildOrder: buildOrderStr,
                firstBuy: firstBuyStr,
                itemPurchases: itemPurchases.length > 0 ? itemPurchases : null,
              },
            }
          })
        )

        const { error: junctionError } = await supabase.from('summoner_matches').insert(summonerMatchRecords)

        if (!junctionError) {
          // increment champion stats for tracked user
          const isRemake = match.info.participants.some((p: any) => p.gameEndedInEarlySurrender)
          if ((await isPatchAccepted(patchVersion)) && !isRemake) {
            const trackedUserIdx = match.info.participants.findIndex((p: any) => p.puuid === puuid)
            if (trackedUserIdx !== -1) {
              const participant = match.info.participants[trackedUserIdx]
              const participantId = trackedUserIdx + 1

              let abilityOrderStr = null
              let buildOrderForStats: number[] = []
              let firstBuyForStats = ''

              if (!isOlderThan30Days && timeline) {
                abilityOrderStr = extractAbilityOrder(timeline, participantId)
                const buildOrder = extractBuildOrder(timeline, participantId)
                const firstBuy = extractFirstBuy(timeline, participantId)
                buildOrderForStats = buildOrder.filter((id: number) => isFinishedItem(id)).slice(0, 6)
                firstBuyForStats = (firstBuy.length > 0 ? formatFirstBuy(firstBuy) : '') ?? ''
              }

              const skillOrder = abilityOrderStr ? extractSkillOrderAbbreviation(abilityOrderStr) : ''
              const itemsForStats =
                buildOrderForStats.length > 0
                  ? buildOrderForStats
                  : [
                      participant.item0,
                      participant.item1,
                      participant.item2,
                      participant.item3,
                      participant.item4,
                      participant.item5,
                    ].filter((id: number) => id > 0 && isFinishedItem(id))

              const runes = {
                primary: {
                  style: participant.perks?.styles?.[0]?.style || 0,
                  perks: participant.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0, 0, 0, 0],
                },
                secondary: {
                  style: participant.perks?.styles?.[1]?.style || 0,
                  perks: participant.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0, 0],
                },
                statPerks: [
                  participant.perks?.statPerks?.offense || 0,
                  participant.perks?.statPerks?.flex || 0,
                  participant.perks?.statPerks?.defense || 0,
                ],
              }

              statsAggregator.add({
                champion_name: participant.championName,
                patch: patchVersion,
                win: participant.win,
                items: itemsForStats,
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
                spell1_id: participant.summoner1Id || 0,
                spell2_id: participant.summoner2Id || 0,
                skill_order: skillOrder || null,
                damage_to_champions: participant.totalDamageDealtToChampions || 0,
                total_damage: participant.totalDamageDealt || 0,
                healing: participant.totalHealsOnTeammates || 0,
                shielding: participant.totalDamageShieldedOnTeammates || 0,
                cc_time: participant.timeCCingOthers || 0,
                game_duration: match.info.gameDuration || 0,
                deaths: participant.deaths || 0,
              })
            }
          }
        }

        fetchedInChunk++
      } catch (err) {
        console.error(`Failed to process match ${matchId}:`, err)
      }
    }

    // update job progress
    const totalFetched = job.fetched_matches + fetchedInChunk
    await updateJobProgress(supabase, job.id, totalFetched, job.total_matches, remainingMatchIds)

    // return status - client will poll and trigger next chunk
    const hasMore = remainingMatchIds.length > 0

    return NextResponse.json({
      message: hasMore ? 'Processing...' : 'Completing...',
      jobId: job.id,
      newMatches: job.total_matches,
      progress: totalFetched,
      remaining: remainingMatchIds.length,
      hasMore,
    })
  } catch (error: any) {
    console.error('[UpdateProfile] Chunk processing error:', error)
    await failJob(supabase, job.id, error.message || 'unknown error')
    return NextResponse.json({ error: error.message || 'Failed to process matches' }, { status: 500 })
  }
}

// finalize job after all matches processed
async function finalizeJob(supabase: any, jobId: string, puuid: string) {
  console.log(`[UpdateProfile] Finalizing job ${jobId}...`)

  // update last_updated timestamp
  await supabase.from('summoners').update({ last_updated: new Date().toISOString() }).eq('puuid', puuid)

  // calculate missing pig scores
  const pigScoresCalculated = await calculateMissingPigScores(supabase, puuid)

  // recalculate profile champion stats
  await recalculateProfileStatsForPlayers([puuid])

  // flush aggregated champion stats
  const flushResult = await flushAggregatedStats()
  if (!flushResult.success && flushResult.error) {
    console.error('[UpdateProfile] Failed to flush champion stats:', flushResult.error)
  }

  // complete job
  await completeJob(supabase, jobId)
  console.log(`[UpdateProfile] Job ${jobId} completed, ${pigScoresCalculated} pig scores calculated`)
}
