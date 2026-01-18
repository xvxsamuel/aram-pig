// centralized pig score calculation utilities
// used by /api/calculate-pig-scores for on-demand calculation

import { SupabaseClient } from '@supabase/supabase-js'
import { calculatePigScoreWithBreakdown, prefetchChampionStats, extractSkillOrderAbbreviation, type ChampionStatsCache } from './index'
import { getMatchById } from '@/lib/riot/api'
import { getKillDeathSummary } from '@/lib/game/kill-timeline'
import { extractAbilityOrder, extractBuildOrder, extractFirstBuy, formatFirstBuy } from '@/lib/game'

// constants
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
export const BATCH_SIZE = 10 // matches per batch
export const MAX_TIME_MS = 50000 // 50s timeout safety

// types
export interface PigCalcResult {
  calculated: number
  hasMore: boolean
  nextOffset: number
}

export interface MatchParticipantRecord {
  puuid: string
  match_id: string
  match_data: any
  champion_name: string
  patch?: string
  game_creation?: number
  matches?: {
    game_duration: number
    timeline_data: any
    game_creation?: number
  } | {
    game_duration: number
    timeline_data: any
    game_creation?: number
  }[]
}

// helper to get match info from joined data (handles array or object from supabase join)
function getMatchInfo(record: MatchParticipantRecord): { game_duration: number; timeline_data: any; game_creation?: number } | undefined {
  if (!record.matches) return undefined
  return Array.isArray(record.matches) ? record.matches[0] : record.matches
}

// helper to calculate team totals from match data
export function calculateTeamTotals(participants: any[]): { 
  teamKills: Record<number, number>
  teamDamage: Record<number, number> 
} {
  const teamKills: Record<number, number> = {}
  const teamDamage: Record<number, number> = {}
  
  for (const p of participants) {
    teamKills[p.teamId] = (teamKills[p.teamId] || 0) + (p.kills || 0)
    teamDamage[p.teamId] = (teamDamage[p.teamId] || 0) + (p.totalDamageDealtToChampions || 0)
  }
  
  return { teamKills, teamDamage }
}

// helper to extract timeline data for a participant
export function extractTimelineData(
  timeline: any,
  participantId: number,
  existingMatchData: any
): {
  abilityOrderStr: string | null
  buildOrderStr: string | null
  firstBuyStr: string | null
  deathQualityScore: number | undefined
  teamId: number
} {
  let abilityOrderStr = existingMatchData?.abilityOrder || null
  let buildOrderStr = existingMatchData?.buildOrder || null
  let firstBuyStr = existingMatchData?.firstBuy || null
  let deathQualityScore: number | undefined = undefined
  const teamId = existingMatchData?.teamId || 100

  // extract build/ability data if not already present
  if (timeline && !abilityOrderStr) {
    abilityOrderStr = extractAbilityOrder(timeline, participantId)
    const buildOrder = extractBuildOrder(timeline, participantId)
    const firstBuy = extractFirstBuy(timeline, participantId)
    buildOrderStr = buildOrder.length > 0 ? buildOrder.join(',') : null
    firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
  }

  // always calculate death quality when timeline is available
  if (timeline) {
    const killDeathSummary = getKillDeathSummary(timeline, participantId, teamId)
    deathQualityScore = killDeathSummary.deathScore
  }

  return { abilityOrderStr, buildOrderStr, firstBuyStr, deathQualityScore, teamId }
}

// calculate pig score for a single participant
export async function calculateParticipantPigScore(
  participant: MatchParticipantRecord,
  matchParticipant: any,
  gameDuration: number,
  patch: string,
  timeline: any | null,
  teamKills: Record<number, number>,
  teamDamage: Record<number, number>,
  statsCache: ChampionStatsCache
): Promise<{ breakdown: any; updatedMatchData: any } | null> {
  const participantId = matchParticipant.participantId || 1

  const { abilityOrderStr, buildOrderStr, firstBuyStr, deathQualityScore } = extractTimelineData(
    timeline,
    participantId,
    participant.match_data
  )

  try {
    const breakdown = await calculatePigScoreWithBreakdown({
      championName: participant.champion_name,
      damage_dealt_to_champions: matchParticipant.totalDamageDealtToChampions || 0,
      total_damage_dealt: matchParticipant.totalDamageDealt || 0,
      total_heals_on_teammates: matchParticipant.totalHealsOnTeammates || 0,
      total_damage_shielded_on_teammates: matchParticipant.totalDamageShieldedOnTeammates || 0,
      time_ccing_others: matchParticipant.timeCCingOthers || 0,
      game_duration: gameDuration,
      deaths: matchParticipant.deaths || 0,
      kills: matchParticipant.kills || 0,
      assists: matchParticipant.assists || 0,
      teamTotalKills: teamKills[matchParticipant.teamId] || 0,
      teamTotalDamage: teamDamage[matchParticipant.teamId] || 0,
      item0: matchParticipant.item0 || 0,
      item1: matchParticipant.item1 || 0,
      item2: matchParticipant.item2 || 0,
      item3: matchParticipant.item3 || 0,
      item4: matchParticipant.item4 || 0,
      item5: matchParticipant.item5 || 0,
      perk0: matchParticipant.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
      patch,
      spell1: matchParticipant.summoner1Id || 0,
      spell2: matchParticipant.summoner2Id || 0,
      skillOrder: abilityOrderStr ? extractSkillOrderAbbreviation(abilityOrderStr) ?? undefined : undefined,
      buildOrder: buildOrderStr ?? undefined,
      firstBuy: firstBuyStr ?? undefined,
      deathQualityScore,
    }, statsCache)

    if (breakdown) {
      const updatedMatchData = {
        ...participant.match_data,
        pigScore: breakdown.finalScore,
        pigScoreBreakdown: breakdown,
        ...(abilityOrderStr && !participant.match_data?.abilityOrder ? { abilityOrder: abilityOrderStr } : {}),
        ...(buildOrderStr && !participant.match_data?.buildOrder ? { buildOrder: buildOrderStr } : {}),
        ...(firstBuyStr && !participant.match_data?.firstBuy ? { firstBuy: firstBuyStr } : {}),
      }
      return { breakdown, updatedMatchData }
    }
  } catch (err) {
    console.error(`[PigCalc] Error calculating for ${participant.champion_name}:`, err)
  }

  return null
}

// filter participants needing pig score calculation
export function filterNeedingCalculation(participants: MatchParticipantRecord[]): MatchParticipantRecord[] {
  return participants.filter(
    p => (p.match_data?.pigScore === null || p.match_data?.pigScore === undefined) && !p.match_data?.isRemake
  )
}

// calculate pig scores for user's matches
export async function calculateUserMatchesPigScores(
  supabase: SupabaseClient,
  puuid: string,
  region: string,
  oneYearAgo: number,
  offset: number,
  startTime: number
): Promise<PigCalcResult> {
  // fetch user's matches that have timeline data (required for accurate PIG scores)
  const { data: matches } = await supabase
    .from('summoner_matches')
    .select('puuid, match_id, match_data, champion_name, game_creation, patch, matches!inner(game_duration, timeline_data)')
    .eq('puuid', puuid)
    .gte('game_creation', oneYearAgo)
    .not('matches.timeline_data', 'is', null) // Only matches with timeline data
    .order('game_creation', { ascending: false })
    .range(offset, offset + BATCH_SIZE - 1)

  if (!matches || matches.length === 0) {
    console.log(`[PigCalc:User] No matches found at offset ${offset}`)
    return { calculated: 0, hasMore: false, nextOffset: offset }
  }

  console.log(`[PigCalc:User] Found ${matches.length} matches at offset ${offset}`)

  const needsCalc = filterNeedingCalculation(matches)
  console.log(`[PigCalc:User] ${needsCalc.length}/${matches.length} need PIG calculation`)

  if (needsCalc.length === 0) {
    const hasMore = matches.length === BATCH_SIZE
    console.log(`[PigCalc:User] All have scores, hasMore=${hasMore}`)
    return { calculated: 0, hasMore, nextOffset: offset + BATCH_SIZE }
  }

  // prefetch champion stats
  const championNames = [...new Set<string>(needsCalc.map(m => m.champion_name))]
  const statsCache = await prefetchChampionStats(championNames)

  let calculated = 0

  for (const match of needsCalc) {
    if (Date.now() - startTime > MAX_TIME_MS) {
      return { calculated, hasMore: true, nextOffset: offset + calculated }
    }

    let matchData
    try {
      matchData = await getMatchById(match.match_id, region as any, 'overhead')
    } catch (err) {
      console.error(`[PigCalc] Failed to fetch match ${match.match_id} from Riot API:`, err)
      continue
    }

    const matchParticipant = matchData?.info?.participants?.find((p: any) => p.puuid === puuid)
    if (!matchParticipant) {
      console.warn(`[PigCalc] No participant found for puuid in match ${match.match_id}`)
      continue
    }

    const { teamKills, teamDamage } = calculateTeamTotals(matchData.info.participants)
    const matchInfo = getMatchInfo(match)
    const timeline = matchInfo?.timeline_data

    const result = await calculateParticipantPigScore(
      match,
      matchParticipant,
      matchInfo?.game_duration || 0,
      match.patch || '',
      timeline,
      teamKills,
      teamDamage,
      statsCache
    )

    if (result) {
      await supabase
        .from('summoner_matches')
        .update({ match_data: result.updatedMatchData })
        .eq('match_id', match.match_id)
        .eq('puuid', puuid)
      calculated++
    }
  }

  return { calculated, hasMore: matches.length === BATCH_SIZE, nextOffset: offset + BATCH_SIZE }
}

// calculate pig scores for other players in user's matches
export async function calculateOtherPlayersPigScores(
  supabase: SupabaseClient,
  puuid: string,
  region: string,
  oneYearAgo: number,
  offset: number,
  startTime: number
): Promise<PigCalcResult> {
  const OTHER_BATCH_SIZE = 50

  // get user's recent match IDs
  const { data: userMatches } = await supabase
    .from('summoner_matches')
    .select('match_id')
    .eq('puuid', puuid)
    .gte('game_creation', oneYearAgo)
    .order('game_creation', { ascending: false })
    .limit(100)

  if (!userMatches || userMatches.length === 0) {
    return { calculated: 0, hasMore: false, nextOffset: offset }
  }

  const matchIds = userMatches.map(m => m.match_id)

  // get other participants needing scores (only from matches with timeline data)
  const { data: participants } = await supabase
    .from('summoner_matches')
    .select('puuid, match_id, match_data, champion_name, patch, matches!inner(game_duration, timeline_data, game_creation)')
    .in('match_id', matchIds)
    .neq('puuid', puuid)
    .gte('matches.game_creation', oneYearAgo)
    .not('matches.timeline_data', 'is', null) // Only matches with timeline data
    .range(offset, offset + OTHER_BATCH_SIZE - 1)

  if (!participants || participants.length === 0) {
    return { calculated: 0, hasMore: false, nextOffset: offset }
  }

  const needsCalc = filterNeedingCalculation(participants)

  if (needsCalc.length === 0) {
    const hasMore = participants.length === OTHER_BATCH_SIZE
    return { calculated: 0, hasMore, nextOffset: offset + OTHER_BATCH_SIZE }
  }

  // prefetch champion stats
  const championNames = [...new Set<string>(needsCalc.map(p => p.champion_name))]
  const statsCache = await prefetchChampionStats(championNames)

  let calculated = 0

  // group by match for efficiency
  const byMatch = new Map<string, MatchParticipantRecord[]>()
  for (const p of needsCalc.slice(0, 10)) { // limit per request
    const list = byMatch.get(p.match_id) || []
    list.push(p)
    byMatch.set(p.match_id, list)
  }

  for (const [matchId, matchParticipants] of byMatch) {
    if (Date.now() - startTime > MAX_TIME_MS) {
      return { calculated, hasMore: true, nextOffset: offset + calculated }
    }

    let matchData
    try {
      matchData = await getMatchById(matchId, region as any, 'overhead')
    } catch {
      continue
    }

    const { teamKills, teamDamage } = calculateTeamTotals(matchData.info.participants)
    const firstMatchInfo = getMatchInfo(matchParticipants[0])
    const timeline = firstMatchInfo?.timeline_data

    for (const participant of matchParticipants) {
      const matchParticipant = matchData?.info?.participants?.find((p: any) => p.puuid === participant.puuid)
      if (!matchParticipant) continue

      const participantMatchInfo = getMatchInfo(participant)
      const result = await calculateParticipantPigScore(
        participant,
        matchParticipant,
        participantMatchInfo?.game_duration || 0,
        participant.patch || '',
        timeline,
        teamKills,
        teamDamage,
        statsCache
      )

      if (result) {
        await supabase
          .from('summoner_matches')
          .update({ match_data: result.updatedMatchData })
          .eq('match_id', matchId)
          .eq('puuid', participant.puuid)
        calculated++
      }
    }
  }

  return { calculated, hasMore: needsCalc.length > 10, nextOffset: offset + OTHER_BATCH_SIZE }
}
