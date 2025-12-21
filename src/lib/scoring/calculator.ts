// pig score calculator - unified scoring function
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getStdDev, getZScore } from '../db/stats-aggregator'
import {
  calculateStatScore,
  calculateDamageScore,
  calculateCCTimeScore,
  calculateAllBuildPenalties,
  calculateKillParticipationScore,
  calculateDeathsScore,
  type ChampionStatsData,
  type ItemPenaltyDetail,
  type StartingItemsPenaltyDetail,
} from './penalties'

// types

export interface ParticipantData {
  championName: string
  damage_dealt_to_champions: number
  total_damage_dealt: number
  total_heals_on_teammates: number
  total_damage_shielded_on_teammates: number
  time_ccing_others: number
  game_duration: number
  deaths: number
  kills?: number
  assists?: number
  teamTotalKills?: number
  teamTotalDamage?: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  perk0: number
  patch: string | null
  spell1?: number
  spell2?: number
  skillOrder?: string
  buildOrder?: string
  firstBuy?: string
  deathQualityScore?: number
}

export interface PigScoreBreakdown {
  finalScore: number
  playerStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
    deathsPerMin: number
    killParticipation?: number
  }
  championAvgStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  }
  componentScores: {
    performance: number
    build: number
    timeline: number
    kda: number
  }
  buildSubScores?: {
    items: number
    keystone: number
    spells: number
    skills: number
    core: number
    starting: number
  }
  metrics: {
    name: string
    score: number
    weight: number
    playerValue?: number
    avgValue?: number
    percentOfAvg?: number
    zScore?: number
  }[]
  itemDetails?: ItemPenaltyDetail[]
  startingItemsDetails?: StartingItemsPenaltyDetail
  coreBuildDetails?: {
    penalty: number
    playerWinrate?: number
    topWinrate?: number
    rank?: number
    totalOptions?: number
    games?: number
    // debug info
    playerCoreKey?: string
    matchedCoreKey?: string
    globalWinrate?: number
  }
  coreKey?: string
  fallbackInfo?: { items: boolean; keystone: boolean; spells: boolean; starting: boolean }
  scoringInfo: { targetPercentile: number; averageScore: number; description: string }
  totalGames: number
  patch: string
  matchPatch?: string
  usedFallbackPatch: boolean
}

// pre-fetched champion stats cache
export type ChampionStatsCache = Map<string, { data: Record<string, unknown>; patch: string }[]>

// ============================================================================
// STAT RELEVANCE
// ============================================================================

interface StatRelevance {
  damageToChampions: number
  totalDamage: number
  healingShielding: number
  ccTime: number
}

interface WelfordStats {
  damageToChampionsPerMin?: WelfordState
  totalDamagePerMin?: WelfordState
  healingShieldingPerMin?: WelfordState
  ccTimePerMin?: WelfordState
}

function calculateStatRelevance(
  avgPerMin: { damageToChampionsPerMin: number; totalDamagePerMin: number; healingShieldingPerMin: number; ccTimePerMin: number },
  welford: WelfordStats | null
): StatRelevance {
  const relevance: StatRelevance = { damageToChampions: 1.0, totalDamage: 1.0, healingShielding: 0, ccTime: 0 }

  if (avgPerMin.healingShieldingPerMin >= 300) {
    relevance.healingShielding = Math.min(1.0, 0.5 + (avgPerMin.healingShieldingPerMin - 300) / 2400)
  }
  if (avgPerMin.ccTimePerMin >= 1) {
    relevance.ccTime = Math.min(1.0, 0.5 + (avgPerMin.ccTimePerMin - 2) / 12)
  }

  // boost for high variance
  if (welford) {
    if (welford.damageToChampionsPerMin && welford.damageToChampionsPerMin.n >= 30) {
      const cv = getStdDev(welford.damageToChampionsPerMin) / welford.damageToChampionsPerMin.mean
      if (cv > 0.3) relevance.damageToChampions = Math.min(1.0, relevance.damageToChampions * (1 + cv * 0.5))
    }
    if (welford.healingShieldingPerMin && welford.healingShieldingPerMin.n >= 30 && relevance.healingShielding > 0) {
      const cv = getStdDev(welford.healingShieldingPerMin) / welford.healingShieldingPerMin.mean
      if (cv > 0.4) relevance.healingShielding = Math.min(1.0, relevance.healingShielding * (1 + cv * 0.3))
    }
    if (welford.ccTimePerMin && welford.ccTimePerMin.n >= 30 && relevance.ccTime > 0) {
      const cv = getStdDev(welford.ccTimePerMin) / welford.ccTimePerMin.mean
      if (cv > 0.4) relevance.ccTime = Math.min(1.0, relevance.ccTime * (1 + cv * 0.3))
    }
  }

  return relevance
}

// ============================================================================
// BATCH OPTIMIZATION
// ============================================================================

export async function prefetchChampionStats(championNames: string[]): Promise<ChampionStatsCache> {
  if (championNames.length === 0) return new Map()
  
  const supabase = createAdminClient()
  const { data: allStats, error } = await supabase
    .from('champion_stats')
    .select('champion_name, data, patch')
    .in('champion_name', [...new Set(championNames)])
    .order('patch', { ascending: false })
  
  if (error || !allStats) return new Map()
  
  const cache: ChampionStatsCache = new Map()
  for (const stat of allStats) {
    const existing = cache.get(stat.champion_name) || []
    existing.push({ data: stat.data, patch: stat.patch })
    cache.set(stat.champion_name, existing)
  }
  return cache
}

// ============================================================================
// MAIN SCORING FUNCTION (unified)
// ============================================================================

/**
 * Calculate pig score with full breakdown
 * @param participant - Player data
 * @param statsCache - Optional pre-fetched stats (for batch processing)
 */
export async function calculatePigScoreWithBreakdown(
  participant: ParticipantData,
  statsCache?: ChampionStatsCache
): Promise<PigScoreBreakdown | null> {
  const { championName, game_duration, total_damage_dealt } = participant
  const gameDurationMinutes = game_duration / 60

  if (gameDurationMinutes <= 0 || !total_damage_dealt) return null

  // get champion stats from cache or DB
  let championStats: { data: Record<string, unknown>; patch: string }[] | null = null
  
  if (statsCache) {
    championStats = statsCache.get(championName) || null
  } else {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('champion_stats')
      .select('data, patch')
      .eq('champion_name', championName)
      .order('patch', { ascending: false })
      .limit(10)
    if (!error && data) championStats = data
  }

  if (!championStats || championStats.length === 0) return null

  // find valid stats (2000+ games, prefer matching patch)
  let selectedStats = championStats.find(s => s.patch === participant.patch && ((s.data as any)?.games || 0) >= 2000)
  const usedFallbackPatch = !selectedStats
  if (!selectedStats) selectedStats = championStats.find(s => ((s.data as any)?.games || 0) >= 2000)
  if (!selectedStats) return null

  const data = selectedStats.data as any
  const championAvg = data?.championStats
  if (!championAvg?.sumGameDuration) return null

  const totalGames = data.games || 0
  const avgGameDurationMinutes = championAvg.sumGameDuration / totalGames / 60

  // calculate stats
  const playerStats = {
    damageToChampionsPerMin: participant.damage_dealt_to_champions / gameDurationMinutes,
    totalDamagePerMin: participant.total_damage_dealt / gameDurationMinutes,
    healingShieldingPerMin: (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
    deathsPerMin: participant.deaths / gameDurationMinutes,
  }

  const championAvgPerMin = {
    damageToChampionsPerMin: championAvg.sumDamageToChampions / totalGames / avgGameDurationMinutes,
    totalDamagePerMin: championAvg.sumTotalDamage / totalGames / avgGameDurationMinutes,
    healingShieldingPerMin: (championAvg.sumHealing + championAvg.sumShielding) / totalGames / avgGameDurationMinutes,
    ccTimePerMin: championAvg.sumCCTime / totalGames / avgGameDurationMinutes,
  }

  const welford = championAvg.welford || null
  const relevance = calculateStatRelevance(championAvgPerMin, welford)

  const metrics: PigScoreBreakdown['metrics'] = []
  const getZScoreSafe = (val: number, w?: WelfordState): number | undefined => {
    if (!w || w.n < 30 || getStdDev(w) <= w.mean * 0.05) return undefined
    return getZScore(val, w)
  }

  // PERFORMANCE COMPONENT
  const perfScores: { score: number; weight: number }[] = []
  const addPerfMetric = (name: string, player: number, avg: number, welfordState: WelfordState | undefined, weight: number, customScore?: number) => {
    if (avg <= 0 || weight <= 0) return
    const score = customScore !== undefined ? customScore : calculateStatScore(player, avg, welfordState, true, gameDurationMinutes)
    perfScores.push({ score, weight })
    metrics.push({
      name,
      score,
      weight,
      playerValue: player,
      avgValue: avg,
      percentOfAvg: (player / avg) * 100,
      zScore: getZScoreSafe(player, welfordState),
    })
  }

  const teamDamageShare = participant.teamTotalDamage && participant.teamTotalDamage > 0
    ? participant.damage_dealt_to_champions / participant.teamTotalDamage
    : undefined

  const damageScore = calculateDamageScore(
    playerStats.damageToChampionsPerMin,
    championAvgPerMin.damageToChampionsPerMin,
    welford?.damageToChampionsPerMin,
    gameDurationMinutes,
    teamDamageShare
  )

  addPerfMetric('Damage to Champions', playerStats.damageToChampionsPerMin, championAvgPerMin.damageToChampionsPerMin, welford?.damageToChampionsPerMin, relevance.damageToChampions, damageScore)
  addPerfMetric('Total Damage', playerStats.totalDamagePerMin, championAvgPerMin.totalDamagePerMin, welford?.totalDamagePerMin, relevance.totalDamage)
  addPerfMetric('Healing/Shielding', playerStats.healingShieldingPerMin, championAvgPerMin.healingShieldingPerMin, welford?.healingShieldingPerMin, relevance.healingShielding)
  
  if (relevance.ccTime > 0) {
    const score = calculateCCTimeScore(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, welford?.ccTimePerMin, gameDurationMinutes)
    perfScores.push({ score, weight: relevance.ccTime })
    metrics.push({
      name: 'CC Time',
      score,
      weight: relevance.ccTime,
      playerValue: playerStats.ccTimePerMin,
      avgValue: championAvgPerMin.ccTimePerMin,
      percentOfAvg: championAvgPerMin.ccTimePerMin > 0 ? (playerStats.ccTimePerMin / championAvgPerMin.ccTimePerMin) * 100 : 0,
      zScore: getZScoreSafe(playerStats.ccTimePerMin, welford?.ccTimePerMin),
    })
  }

  const totalPerfWeight = perfScores.reduce((s, p) => s + p.weight, 0)
  const performanceScore = totalPerfWeight > 0 ? perfScores.reduce((s, p) => s + p.score * p.weight, 0) / totalPerfWeight : 50

  // BUILD COMPONENT
  const buildPenalties = await calculateAllBuildPenalties(
    participant,
    championName,
    data as ChampionStatsData
  )

  const penaltyToScore = (p: number, max: number) => Math.max(0, 100 - (p / max) * 100)
  const itemScore = penaltyToScore(buildPenalties.itemPenalty, 20)
  const keystoneScore = penaltyToScore(buildPenalties.keystonePenalty, 20)
  const spellsScore = penaltyToScore(buildPenalties.spellsPenalty, 20)
  const skillOrderScore = penaltyToScore(buildPenalties.skillOrderPenalty, 20)
  const coreScore = penaltyToScore(buildPenalties.buildOrderPenalty, 20)
  const startingScore = penaltyToScore(buildPenalties.startingItemsPenalty, 10)

  metrics.push(
    { name: 'Starter', score: startingScore, weight: 0.05 },
    { name: 'Skills', score: skillOrderScore, weight: 0.05 },
    { name: 'Keystone', score: keystoneScore, weight: 0.10 },
    { name: 'Spells', score: spellsScore, weight: 0.05 },
    { name: 'Core Build', score: coreScore, weight: 0.45 },
    { name: 'Items', score: itemScore, weight: 0.30 }
  )

  const buildScore = startingScore * 0.05 + skillOrderScore * 0.05 + keystoneScore * 0.10 + spellsScore * 0.05 + coreScore * 0.45 + itemScore * 0.30

  // TIMELINE COMPONENT (Death Quality only)
  let timelineScore = 50
  if (participant.deathQualityScore !== undefined) {
    timelineScore = participant.deathQualityScore
    metrics.push({ name: 'Death Quality', score: participant.deathQualityScore, weight: 1.0 })
  } else {
    metrics.push({ name: 'Timeline', score: 50, weight: 1.0 })
  }

  // KDA COMPONENT
  let kdaScore = 50
  let killParticipation: number | undefined
  if (participant.kills !== undefined && participant.assists !== undefined && participant.teamTotalKills && participant.teamTotalKills > 0) {
    killParticipation = (participant.kills + participant.assists) / participant.teamTotalKills
    const kpScore = calculateKillParticipationScore(killParticipation)
    const deathScore = calculateDeathsScore(participant.deaths, gameDurationMinutes, participant.deathQualityScore)
    kdaScore = kpScore * 0.6 + deathScore * 0.4
    metrics.push({ name: 'Kill Participation', score: kpScore, weight: 0.6, playerValue: killParticipation * 100 })
    metrics.push({ name: 'Deaths/Min', score: deathScore, weight: 0.4, playerValue: playerStats.deathsPerMin })
  }

  // FINAL SCORE: Performance 50% (stats 60% + timeline 25% + kda 15%), Build 50%
  const combinedPerformance = performanceScore * 0.6 + timelineScore * 0.25 + kdaScore * 0.15
  const finalScore = Math.round(Math.max(0, Math.min(100, combinedPerformance * 0.5 + buildScore * 0.5)))

  return {
    finalScore,
    playerStats: { ...playerStats, killParticipation },
    championAvgStats: championAvgPerMin,
    componentScores: {
      performance: Math.round(performanceScore),
      build: Math.round(buildScore),
      timeline: Math.round(timelineScore),
      kda: Math.round(kdaScore),
    },
    buildSubScores: {
      items: Math.round(itemScore),
      keystone: Math.round(keystoneScore),
      spells: Math.round(spellsScore),
      skills: Math.round(skillOrderScore),
      core: Math.round(coreScore),
      starting: Math.round(startingScore),
    },
    metrics,
    itemDetails: buildPenalties.itemDetails,
    startingItemsDetails: buildPenalties.startingItemsDetails,
    coreBuildDetails: buildPenalties.coreBuildDetails,
    coreKey: buildPenalties.coreKey,
    fallbackInfo: buildPenalties.fallbackInfo,
    scoringInfo: {
      targetPercentile: 98,
      averageScore: 50,
      description: `Score is based on percentile performance vs other ${championName} players. 50 = average, 100 = excellent (top 2%).`,
    },
    totalGames,
    patch: selectedStats.patch,
    matchPatch: usedFallbackPatch ? (participant.patch ?? undefined) : undefined,
    usedFallbackPatch,
  }
}

// Aliases for backwards compatibility
export const calculatePigScoreWithBreakdownCached = calculatePigScoreWithBreakdown
export async function calculatePigScore(participant: ParticipantData): Promise<number | null> {
  const result = await calculatePigScoreWithBreakdown(participant)
  return result?.finalScore ?? null
}
