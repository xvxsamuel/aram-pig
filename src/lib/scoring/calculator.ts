// PIG Score calculator - main scoring functions (percentile-based)
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getStdDev, getZScore } from '../db/stats-aggregator'
import {
  calculateStatScore,
  calculateCCTimeScore,
  calculateAllBuildPenalties,
  calculateKillParticipationScore,
  calculateDeathsScore,
  type ItemPenaltyDetail,
  type StartingItemsPenaltyDetail,
} from './penalties'

// determine relevant stats for a champion based on their data
// returns weights (0-1) for each stat based on how meaningful it is for this champion
interface StatRelevance {
  damageToChampions: number // 0-1 weight
  totalDamage: number
  healingShielding: number
  ccTime: number
}

function calculateStatRelevance(
  championAvgPerMin: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  },
  welford: {
    damageToChampionsPerMin?: WelfordState
    totalDamagePerMin?: WelfordState
    healingShieldingPerMin?: WelfordState
    ccTimePerMin?: WelfordState
  } | null
): StatRelevance {
  // base relevance on:
  // 1. whether the stat has a meaningful average (threshold-based)
  // 2. coefficient of variation (CV = stddev/mean) - higher CV means more skill expression

  const relevance: StatRelevance = {
    damageToChampions: 1.0, // always relevant - everyone should do damage
    totalDamage: 1.0, // always relevant
    healingShielding: 0,
    ccTime: 0,
  }

  // healing/Shielding: only relevant if champion avg >= 300/min (lower threshold to catch more healers)
  // Then scale weight by how much they heal relative to damage dealers
  if (championAvgPerMin.healingShieldingPerMin >= 300) {
    // Weight from 0.5 (300/min) to 1.0 (1500+/min)
    const healWeight = Math.min(1.0, 0.5 + (championAvgPerMin.healingShieldingPerMin - 300) / 2400)
    relevance.healingShielding = healWeight
  }

  // cc time: only relevant if champion avg >= 2 sec/min
  // then scale weight by how much CC they have
  if (championAvgPerMin.ccTimePerMin >= 1) {
    // Weight from 0.5 (2 sec/min) to 1.0 (8+ sec/min)
    const ccWeight = Math.min(1.0, 0.5 + (championAvgPerMin.ccTimePerMin - 2) / 12)
    relevance.ccTime = ccWeight
  }

  // boost relevance if there's high variance - CV > 0.3
  if (welford) {
    // damage stats
    if (welford.damageToChampionsPerMin && welford.damageToChampionsPerMin.n >= 30) {
      const cv = getStdDev(welford.damageToChampionsPerMin) / welford.damageToChampionsPerMin.mean
      if (cv > 0.3) relevance.damageToChampions = Math.min(1.0, relevance.damageToChampions * (1 + cv * 0.5))
    }

    // healing
    if (welford.healingShieldingPerMin && welford.healingShieldingPerMin.n >= 30 && relevance.healingShielding > 0) {
      const cv = getStdDev(welford.healingShieldingPerMin) / welford.healingShieldingPerMin.mean
      if (cv > 0.4) relevance.healingShielding = Math.min(1.0, relevance.healingShielding * (1 + cv * 0.3))
    }

    // cc
    if (welford.ccTimePerMin && welford.ccTimePerMin.n >= 30 && relevance.ccTime > 0) {
      const cv = getStdDev(welford.ccTimePerMin) / welford.ccTimePerMin.mean
      if (cv > 0.4) relevance.ccTime = Math.min(1.0, relevance.ccTime * (1 + cv * 0.3))
    }
  }

  return relevance
}

export interface ParticipantData {
  championName: string
  damage_dealt_to_champions: number
  total_damage_dealt: number
  total_heals_on_teammates: number
  total_damage_shielded_on_teammates: number
  time_ccing_others: number
  game_duration: number
  deaths: number
  kills?: number // for kill participation
  assists?: number // for kill participation
  teamTotalKills?: number // total kills by player's team
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  perk0: number // keystone
  patch: string | null
  spell1?: number
  spell2?: number
  skillOrder?: string // e.g., "qew" or "qwe"
  buildOrder?: string // comma-separated item IDs in purchase order
  firstBuy?: string // comma-separated item IDs of starting items
  // Kill/Death quality scores from timeline analysis (0-100)
  takedownQualityScore?: number // how valuable were the takedowns (kills+assists treated the same)
  deathQualityScore?: number // how good were the deaths (teamfight, low gold, diving)
}

export interface PigScoreBreakdown {
  finalScore: number
  playerStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
    deathsPerMin: number
    killParticipation?: number // 0-1 value
  }
  championAvgStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  }
  // Component scores (0-100 each, then weighted)
  componentScores: {
    performance: number // 50% weight - damage, healing, CC stats
    build: number // 20% weight - items, runes, spells, skills
    timeline: number // 20% weight - kill/death quality from position/trades
    kda: number // 10% weight - kill participation and deaths per minute
  }
  // Detailed breakdown of each metric
  metrics: {
    name: string
    score: number // 0-100 score for this metric
    weight: number // Weight in its component (0-1)
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
  }
  coreKey?: string // The matched core build key (for debugging)
  fallbackInfo?: {
    items: boolean
    keystone: boolean
    spells: boolean
    starting: boolean
  }
  scoringInfo: {
    targetPercentile: number // 84th percentile (z=+1)
    averageScore: number // Score at 50th percentile (70)
    description: string
  }
  totalGames: number
  patch: string
  matchPatch?: string
  usedFallbackPatch: boolean
}

// calculate pig score based on performance vs patch champion averages
// Uses PERCENTILE-BASED scoring with skewed target (84th percentile = 100)
export async function calculatePigScore(participant: ParticipantData): Promise<number | null> {
  const supabase = createAdminClient()

  const championName = participant.championName
  const gameDurationMinutes = participant.game_duration / 60

  if (gameDurationMinutes <= 0) return null

  // Try to get championStats for current patch first, fallback to any available patch
  const { data: championStats, error: avgError } = await supabase
    .from('champion_stats')
    .select('data, patch')
    .eq('champion_name', championName)
    .order('patch', { ascending: false })
    .limit(10)

  if (avgError || !championStats || championStats.length === 0) return null

  // Find matching patch with 100+ games, or fallback to any patch with 100+ games
  let selectedStats = championStats.find(s => s.patch === participant.patch && (s.data?.games || 0) >= 100)
  if (!selectedStats) {
    selectedStats = championStats.find(s => (s.data?.games || 0) >= 100)
  }

  if (!selectedStats) return null

  const championAvg = selectedStats.data?.championStats
  if (!championAvg || !championAvg.sumGameDuration || championAvg.sumGameDuration === 0) return null

  const totalGames = selectedStats.data.games || 0
  if (!participant.total_damage_dealt || participant.total_damage_dealt === 0) return null

  // Calculate player's per-minute stats
  const playerStats = {
    damageToChampionsPerMin: participant.damage_dealt_to_champions / gameDurationMinutes,
    totalDamagePerMin: participant.total_damage_dealt / gameDurationMinutes,
    healingShieldingPerMin:
      (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
  }

  // Champion averages
  const avgGameDurationMinutes = championAvg.sumGameDuration / totalGames / 60
  const championAvgPerMin = {
    damageToChampionsPerMin: championAvg.sumDamageToChampions / totalGames / avgGameDurationMinutes,
    totalDamagePerMin: championAvg.sumTotalDamage / totalGames / avgGameDurationMinutes,
    healingShieldingPerMin: (championAvg.sumHealing + championAvg.sumShielding) / totalGames / avgGameDurationMinutes,
    ccTimePerMin: championAvg.sumCCTime / totalGames / avgGameDurationMinutes,
  }

  const welford = championAvg.welford || null
  const relevance = calculateStatRelevance(championAvgPerMin, welford)

  // ============================================================================
  // PERFORMANCE COMPONENT (60% of final score)
  // ============================================================================
  const performanceScores: { score: number; weight: number }[] = []

  // Damage to Champions
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const score = calculateStatScore(
      playerStats.damageToChampionsPerMin,
      championAvgPerMin.damageToChampionsPerMin,
      welford?.damageToChampionsPerMin
    )
    performanceScores.push({ score, weight: relevance.damageToChampions })
  }

  // Total Damage
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const score = calculateStatScore(
      playerStats.totalDamagePerMin,
      championAvgPerMin.totalDamagePerMin,
      welford?.totalDamagePerMin
    )
    performanceScores.push({ score, weight: relevance.totalDamage })
  }

  // Healing/Shielding
  if (relevance.healingShielding > 0) {
    const score = calculateStatScore(
      playerStats.healingShieldingPerMin,
      championAvgPerMin.healingShieldingPerMin,
      welford?.healingShieldingPerMin
    )
    performanceScores.push({ score, weight: relevance.healingShielding })
  }

  // CC Time - uses special scoring for low-CC champions
  if (relevance.ccTime > 0) {
    const score = calculateCCTimeScore(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, welford?.ccTimePerMin)
    performanceScores.push({ score, weight: relevance.ccTime })
  }

  // Weighted average of performance scores
  const totalPerfWeight = performanceScores.reduce((sum, s) => sum + s.weight, 0)
  const performanceScore =
    totalPerfWeight > 0 ? performanceScores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalPerfWeight : 50

  // ============================================================================
  // BUILD COMPONENT (20% of final score)
  // ============================================================================
  // Pass pre-fetched champion data to avoid duplicate DB query
  const buildPenalties = await calculateAllBuildPenalties(
    participant, 
    championName,
    selectedStats.patch === participant.patch ? selectedStats.data : null
  )

  // Convert penalties to scores (penalty 0 = score 100, penalty = maxPenalty = score 0)
  // Item penalty: max 60 -> score = 100 - (penalty/60 * 100)
  const itemScore = Math.max(0, 100 - (buildPenalties.itemPenalty / 60) * 100)
  const keystoneScore = Math.max(0, 100 - (buildPenalties.keystonePenalty / 20) * 100)
  const spellsScore = Math.max(0, 100 - (buildPenalties.spellsPenalty / 20) * 100)
  const skillOrderScore = Math.max(0, 100 - (buildPenalties.skillOrderPenalty / 20) * 100)
  const buildOrderScore = Math.max(0, 100 - (buildPenalties.buildOrderPenalty / 20) * 100)

  // Weighted average: items 40%, keystone 20%, spells 15%, skills 15%, build order 10%
  const buildScore =
    itemScore * 0.4 + keystoneScore * 0.2 + spellsScore * 0.15 + skillOrderScore * 0.15 + buildOrderScore * 0.1

  // ============================================================================
  // TIMELINE COMPONENT (20% of final score)
  // Kill/death quality based on position zones and trade detection
  // ============================================================================
  let timelineScore = 50 // Default average score if no timeline data

  if (participant.takedownQualityScore !== undefined && participant.deathQualityScore !== undefined) {
    // Both scores available - death quality weighted 4x more than kill value (80% vs 20%)
    timelineScore = participant.deathQualityScore * 0.8 + participant.takedownQualityScore * 0.2
  } else if (participant.deathQualityScore !== undefined) {
    // Only death quality available
    timelineScore = participant.deathQualityScore
  } else if (participant.takedownQualityScore !== undefined) {
    // Only takedown quality available
    timelineScore = participant.takedownQualityScore
  }

  // ============================================================================
  // KDA COMPONENT (10% of final score)
  // Kill participation and deaths per minute
  // ============================================================================
  let kdaScore = 50 // Default average score
  if (
    participant.kills !== undefined &&
    participant.assists !== undefined &&
    participant.teamTotalKills !== undefined &&
    participant.teamTotalKills > 0
  ) {
    const killParticipation = (participant.kills + participant.assists) / participant.teamTotalKills
    const kpScore = calculateKillParticipationScore(killParticipation)
    const deathScore = calculateDeathsScore(participant.deaths, gameDurationMinutes)
    kdaScore = kpScore * 0.6 + deathScore * 0.4
  }

  // ============================================================================
  // FINAL SCORE (weighted average of components)
  // ============================================================================
  // Performance: 50%, Build: 20%, Timeline: 20%, KDA: 10%
  const finalScore = Math.round(performanceScore * 0.5 + buildScore * 0.2 + timelineScore * 0.2 + kdaScore * 0.1)

  return Math.max(0, Math.min(100, finalScore))
}

// calculate pig score with full breakdown for UI display
// Uses PERCENTILE-BASED scoring with skewed target (84th percentile = 100)
export async function calculatePigScoreWithBreakdown(participant: ParticipantData): Promise<PigScoreBreakdown | null> {
  const supabase = createAdminClient()

  const championName = participant.championName
  const gameDurationMinutes = participant.game_duration / 60

  if (gameDurationMinutes <= 0) return null

  // get champion stats
  const { data: championStats, error: avgError } = await supabase
    .from('champion_stats')
    .select('data, patch')
    .eq('champion_name', championName)
    .order('patch', { ascending: false })
    .limit(10)

  if (avgError || !championStats || championStats.length === 0) return null

  // Find matching patch with 100+ games, or fallback to any patch with 100+ games
  let selectedStats = championStats.find(s => s.patch === participant.patch && (s.data?.games || 0) >= 100)
  const usedFallbackPatch = !selectedStats
  if (!selectedStats) {
    selectedStats = championStats.find(s => (s.data?.games || 0) >= 100)
  }

  if (!selectedStats) return null

  const championAvg = selectedStats.data?.championStats
  if (!championAvg || !championAvg.sumGameDuration || championAvg.sumGameDuration === 0) return null

  const totalGames = selectedStats.data.games || 0

  // calculate player's per-minute stats
  const playerStats = {
    damageToChampionsPerMin: participant.damage_dealt_to_champions / gameDurationMinutes,
    totalDamagePerMin: participant.total_damage_dealt / gameDurationMinutes,
    healingShieldingPerMin:
      (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
    deathsPerMin: participant.deaths / gameDurationMinutes,
  }

  // check if required stats are available
  if (!participant.total_damage_dealt || participant.total_damage_dealt === 0) return null

  // champion averages
  const avgGameDurationMinutes = championAvg.sumGameDuration / totalGames / 60
  const championAvgPerMin = {
    damageToChampionsPerMin: championAvg.sumDamageToChampions / totalGames / avgGameDurationMinutes,
    totalDamagePerMin: championAvg.sumTotalDamage / totalGames / avgGameDurationMinutes,
    healingShieldingPerMin: (championAvg.sumHealing + championAvg.sumShielding) / totalGames / avgGameDurationMinutes,
    ccTimePerMin: championAvg.sumCCTime / totalGames / avgGameDurationMinutes,
  }

  // Get Welford stats for z-score calculations (if available)
  const welford = championAvg.welford || null

  // Calculate dynamic stat relevance for this champion
  const relevance = calculateStatRelevance(championAvgPerMin, welford)

  const metrics: PigScoreBreakdown['metrics'] = []

  // Helper to get z-score for a stat
  const getZScore_safe = (playerValue: number, welfordState?: WelfordState): number | undefined => {
    if (!welfordState || welfordState.n < 30) return undefined
    const stdDev = getStdDev(welfordState)
    if (stdDev <= welfordState.mean * 0.05) return undefined
    return getZScore(playerValue, welfordState)
  }

  // ============================================================================
  // PERFORMANCE COMPONENT (60% of final score)
  // ============================================================================
  const performanceScores: { score: number; weight: number }[] = []

  // Damage to Champions
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const score = calculateStatScore(
      playerStats.damageToChampionsPerMin,
      championAvgPerMin.damageToChampionsPerMin,
      welford?.damageToChampionsPerMin
    )
    const weight = relevance.damageToChampions
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'Damage to Champions',
      score,
      weight,
      playerValue: playerStats.damageToChampionsPerMin,
      avgValue: championAvgPerMin.damageToChampionsPerMin,
      percentOfAvg: (playerStats.damageToChampionsPerMin / championAvgPerMin.damageToChampionsPerMin) * 100,
      zScore: getZScore_safe(playerStats.damageToChampionsPerMin, welford?.damageToChampionsPerMin),
    })
  }

  // Total Damage
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const score = calculateStatScore(
      playerStats.totalDamagePerMin,
      championAvgPerMin.totalDamagePerMin,
      welford?.totalDamagePerMin
    )
    const weight = relevance.totalDamage
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'Total Damage',
      score,
      weight,
      playerValue: playerStats.totalDamagePerMin,
      avgValue: championAvgPerMin.totalDamagePerMin,
      percentOfAvg: (playerStats.totalDamagePerMin / championAvgPerMin.totalDamagePerMin) * 100,
      zScore: getZScore_safe(playerStats.totalDamagePerMin, welford?.totalDamagePerMin),
    })
  }

  // Healing/Shielding
  if (relevance.healingShielding > 0) {
    const score = calculateStatScore(
      playerStats.healingShieldingPerMin,
      championAvgPerMin.healingShieldingPerMin,
      welford?.healingShieldingPerMin
    )
    const weight = relevance.healingShielding
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'Healing/Shielding',
      score,
      weight,
      playerValue: playerStats.healingShieldingPerMin,
      avgValue: championAvgPerMin.healingShieldingPerMin,
      percentOfAvg: (playerStats.healingShieldingPerMin / championAvgPerMin.healingShieldingPerMin) * 100,
      zScore: getZScore_safe(playerStats.healingShieldingPerMin, welford?.healingShieldingPerMin),
    })
  }

  // CC Time - uses special scoring for low-CC champions
  if (relevance.ccTime > 0) {
    const score = calculateCCTimeScore(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, welford?.ccTimePerMin)
    const weight = relevance.ccTime
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'CC Time',
      score,
      weight,
      playerValue: playerStats.ccTimePerMin,
      avgValue: championAvgPerMin.ccTimePerMin,
      percentOfAvg: (playerStats.ccTimePerMin / championAvgPerMin.ccTimePerMin) * 100,
      zScore: getZScore_safe(playerStats.ccTimePerMin, welford?.ccTimePerMin),
    })
  }

  // Weighted average of performance scores
  const totalPerfWeight = performanceScores.reduce((sum, s) => sum + s.weight, 0)
  const performanceScore =
    totalPerfWeight > 0 ? performanceScores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalPerfWeight : 50

  // ============================================================================
  // BUILD COMPONENT (20% of final score)
  // ============================================================================
  // Pass pre-fetched champion data to avoid duplicate DB query
  const buildPenalties = await calculateAllBuildPenalties(
    participant, 
    championName,
    selectedStats.patch === participant.patch ? selectedStats.data : null
  )

  // Convert penalties to scores
  const itemScore = Math.max(0, 100 - (buildPenalties.itemPenalty / 60) * 100)
  const keystoneScore = Math.max(0, 100 - (buildPenalties.keystonePenalty / 20) * 100)
  const spellsScore = Math.max(0, 100 - (buildPenalties.spellsPenalty / 20) * 100)
  const skillOrderScore = Math.max(0, 100 - (buildPenalties.skillOrderPenalty / 20) * 100)
  const buildOrderScore = Math.max(0, 100 - (buildPenalties.buildOrderPenalty / 20) * 100)

  // Add build metrics
  metrics.push({ name: 'Items', score: itemScore, weight: 0.4 })
  metrics.push({ name: 'Keystone', score: keystoneScore, weight: 0.2 })
  metrics.push({ name: 'Spells', score: spellsScore, weight: 0.15 })
  metrics.push({ name: 'Skill Order', score: skillOrderScore, weight: 0.15 })
  metrics.push({ name: 'Build Order', score: buildOrderScore, weight: 0.1 })

  // Weighted average: items 40%, keystone 20%, spells 15%, skills 15%, build order 10%
  const buildScore =
    itemScore * 0.4 + keystoneScore * 0.2 + spellsScore * 0.15 + skillOrderScore * 0.15 + buildOrderScore * 0.1

  // ============================================================================
  // TIMELINE COMPONENT (20% of final score)
  // Kill/death quality based on position zones and trade detection
  // ============================================================================
  let timelineScore = 50 // Default average score if no timeline data

  if (participant.takedownQualityScore !== undefined && participant.deathQualityScore !== undefined) {
    // Both scores available - death quality weighted 4x more than kill value (80% vs 20%)
    timelineScore = participant.deathQualityScore * 0.8 + participant.takedownQualityScore * 0.2
    metrics.push({
      name: 'Death Quality',
      score: participant.deathQualityScore,
      weight: 0.8,
    })
    metrics.push({
      name: 'Takedown Quality',
      score: participant.takedownQualityScore,
      weight: 0.2,
    })
  } else if (participant.deathQualityScore !== undefined) {
    // Only death quality available
    timelineScore = participant.deathQualityScore
    metrics.push({
      name: 'Death Quality',
      score: participant.deathQualityScore,
      weight: 1.0,
    })
  } else if (participant.takedownQualityScore !== undefined) {
    // Only takedown quality available
    timelineScore = participant.takedownQualityScore
    metrics.push({
      name: 'Takedown Quality',
      score: participant.takedownQualityScore,
      weight: 1.0,
    })
  } else {
    // No timeline data - add placeholder metric
    metrics.push({
      name: 'Timeline',
      score: 50,
      weight: 1.0,
    })
  }

  // ============================================================================
  // KDA COMPONENT (10% of final score)
  // Kill participation and deaths per minute
  // ============================================================================
  let kdaScore = 50 // Default average score
  let killParticipation: number | undefined

  // Calculate kill participation
  if (
    participant.kills !== undefined &&
    participant.assists !== undefined &&
    participant.teamTotalKills !== undefined &&
    participant.teamTotalKills > 0
  ) {
    killParticipation = (participant.kills + participant.assists) / participant.teamTotalKills
    const kpScore = calculateKillParticipationScore(killParticipation)
    const deathScore = calculateDeathsScore(participant.deaths, gameDurationMinutes)
    // Weight: KP 60%, Deaths 40%
    kdaScore = kpScore * 0.6 + deathScore * 0.4
    metrics.push({
      name: 'Kill Participation',
      score: kpScore,
      weight: 0.6,
      playerValue: killParticipation * 100,
    })
    metrics.push({
      name: 'Deaths/Min',
      score: deathScore,
      weight: 0.4,
      playerValue: participant.deaths / gameDurationMinutes,
    })
  }

  // ============================================================================
  // FINAL SCORE (weighted average of components)
  // ============================================================================
  // Performance: 50%, Build: 20%, Timeline: 20%, KDA: 10%
  const finalScore = Math.round(performanceScore * 0.5 + buildScore * 0.2 + timelineScore * 0.2 + kdaScore * 0.1)

  return {
    finalScore: Math.max(0, Math.min(100, finalScore)),
    playerStats: {
      ...playerStats,
      killParticipation,
    },
    championAvgStats: championAvgPerMin,
    componentScores: {
      performance: Math.round(performanceScore),
      build: Math.round(buildScore),
      timeline: Math.round(timelineScore),
      kda: Math.round(kdaScore),
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
      description: `Score is based on percentile performance vs other ${championName} players. 50 = average (50th percentile), 100 = excellent (98th percentile, top 2%).`,
    },
    totalGames,
    patch: selectedStats.patch,
    matchPatch: usedFallbackPatch ? (participant.patch ?? undefined) : undefined,
    usedFallbackPatch,
  }
}

// ============================================================================
// BATCH OPTIMIZATION FUNCTIONS
// ============================================================================

// Type for pre-fetched champion stats cache
export type ChampionStatsCache = Map<string, { data: Record<string, unknown>; patch: string }[]>

// Pre-fetch champion stats for multiple champions in a single query
// Returns a map of championName -> stats array (sorted by patch desc)
export async function prefetchChampionStats(championNames: string[]): Promise<ChampionStatsCache> {
  if (championNames.length === 0) return new Map()
  
  const supabase = createAdminClient()
  const uniqueChampions = [...new Set(championNames)]
  
  const { data: allStats, error } = await supabase
    .from('champion_stats')
    .select('champion_name, data, patch')
    .in('champion_name', uniqueChampions)
    .order('patch', { ascending: false })
  
  if (error || !allStats) return new Map()
  
  // Group by champion name
  const cache: ChampionStatsCache = new Map()
  for (const stat of allStats) {
    const existing = cache.get(stat.champion_name) || []
    existing.push({ data: stat.data, patch: stat.patch })
    cache.set(stat.champion_name, existing)
  }
  
  return cache
}

// Calculate pig score using pre-fetched champion stats (avoids DB query)
export async function calculatePigScoreWithBreakdownCached(
  participant: ParticipantData,
  statsCache: ChampionStatsCache
): Promise<PigScoreBreakdown | null> {
  const championName = participant.championName
  const gameDurationMinutes = participant.game_duration / 60

  if (gameDurationMinutes <= 0) return null

  // Get stats from cache instead of DB
  const championStats = statsCache.get(championName)
  if (!championStats || championStats.length === 0) return null

  // Find matching patch with 100+ games, or fallback to any patch with 100+ games
  let selectedStats = championStats.find(s => s.patch === participant.patch && ((s.data as any)?.games || 0) >= 100)
  const usedFallbackPatch = !selectedStats
  if (!selectedStats) {
    selectedStats = championStats.find(s => ((s.data as any)?.games || 0) >= 100)
  }

  if (!selectedStats) return null

  const championAvg = (selectedStats.data as any)?.championStats
  if (!championAvg || !championAvg.sumGameDuration || championAvg.sumGameDuration === 0) return null

  const totalGames = (selectedStats.data as any).games || 0

  // calculate player's per-minute stats
  const playerStats = {
    damageToChampionsPerMin: participant.damage_dealt_to_champions / gameDurationMinutes,
    totalDamagePerMin: participant.total_damage_dealt / gameDurationMinutes,
    healingShieldingPerMin:
      (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
    deathsPerMin: participant.deaths / gameDurationMinutes,
  }

  // check if required stats are available
  if (!participant.total_damage_dealt || participant.total_damage_dealt === 0) return null

  // champion averages
  const avgGameDurationMinutes = championAvg.sumGameDuration / totalGames / 60
  const championAvgPerMin = {
    damageToChampionsPerMin: championAvg.sumDamageToChampions / totalGames / avgGameDurationMinutes,
    totalDamagePerMin: championAvg.sumTotalDamage / totalGames / avgGameDurationMinutes,
    healingShieldingPerMin: (championAvg.sumHealing + championAvg.sumShielding) / totalGames / avgGameDurationMinutes,
    ccTimePerMin: championAvg.sumCCTime / totalGames / avgGameDurationMinutes,
  }

  // Get Welford stats for z-score calculations (if available)
  const welford = championAvg.welford || null

  // Calculate dynamic stat relevance for this champion
  const relevance = calculateStatRelevance(championAvgPerMin, welford)

  const metrics: PigScoreBreakdown['metrics'] = []

  // Helper to get z-score for a stat
  const getZScore_safe = (playerValue: number, welfordState?: WelfordState): number | undefined => {
    if (!welfordState || welfordState.n < 30) return undefined
    const stdDev = getStdDev(welfordState)
    if (stdDev <= welfordState.mean * 0.05) return undefined
    return getZScore(playerValue, welfordState)
  }

  // ============================================================================
  // PERFORMANCE COMPONENT (50% of final score)
  // ============================================================================
  const performanceScores: { score: number; weight: number }[] = []

  // Damage to Champions
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const score = calculateStatScore(
      playerStats.damageToChampionsPerMin,
      championAvgPerMin.damageToChampionsPerMin,
      welford?.damageToChampionsPerMin
    )
    const weight = relevance.damageToChampions
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'Damage to Champions',
      score,
      weight,
      playerValue: playerStats.damageToChampionsPerMin,
      avgValue: championAvgPerMin.damageToChampionsPerMin,
      percentOfAvg: (playerStats.damageToChampionsPerMin / championAvgPerMin.damageToChampionsPerMin) * 100,
      zScore: getZScore_safe(playerStats.damageToChampionsPerMin, welford?.damageToChampionsPerMin),
    })
  }

  // Total Damage
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const score = calculateStatScore(
      playerStats.totalDamagePerMin,
      championAvgPerMin.totalDamagePerMin,
      welford?.totalDamagePerMin
    )
    const weight = relevance.totalDamage
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'Total Damage',
      score,
      weight,
      playerValue: playerStats.totalDamagePerMin,
      avgValue: championAvgPerMin.totalDamagePerMin,
      percentOfAvg: (playerStats.totalDamagePerMin / championAvgPerMin.totalDamagePerMin) * 100,
      zScore: getZScore_safe(playerStats.totalDamagePerMin, welford?.totalDamagePerMin),
    })
  }

  // Healing/Shielding
  if (relevance.healingShielding > 0) {
    const score = calculateStatScore(
      playerStats.healingShieldingPerMin,
      championAvgPerMin.healingShieldingPerMin,
      welford?.healingShieldingPerMin
    )
    const weight = relevance.healingShielding
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'Healing/Shielding',
      score,
      weight,
      playerValue: playerStats.healingShieldingPerMin,
      avgValue: championAvgPerMin.healingShieldingPerMin,
      percentOfAvg: (playerStats.healingShieldingPerMin / championAvgPerMin.healingShieldingPerMin) * 100,
      zScore: getZScore_safe(playerStats.healingShieldingPerMin, welford?.healingShieldingPerMin),
    })
  }

  // CC Time
  if (relevance.ccTime > 0) {
    const score = calculateCCTimeScore(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, welford?.ccTimePerMin)
    const weight = relevance.ccTime
    performanceScores.push({ score, weight })
    metrics.push({
      name: 'CC Time',
      score,
      weight,
      playerValue: playerStats.ccTimePerMin,
      avgValue: championAvgPerMin.ccTimePerMin,
      percentOfAvg: championAvgPerMin.ccTimePerMin > 0 
        ? (playerStats.ccTimePerMin / championAvgPerMin.ccTimePerMin) * 100 
        : 0,
      zScore: getZScore_safe(playerStats.ccTimePerMin, welford?.ccTimePerMin),
    })
  }

  // Weighted average of performance scores
  const totalPerfWeight = performanceScores.reduce((sum, s) => sum + s.weight, 0)
  const performanceScore =
    totalPerfWeight > 0 ? performanceScores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalPerfWeight : 50

  // ============================================================================
  // BUILD COMPONENT (20% of final score)
  // ============================================================================
  // Pass pre-fetched champion data to avoid duplicate DB query
  const buildPenalties = await calculateAllBuildPenalties(
    participant, 
    championName,
    selectedStats.patch === participant.patch ? selectedStats.data : null
  )

  // Convert penalties to scores
  const itemScore = Math.max(0, 100 - (buildPenalties.itemPenalty / 60) * 100)
  const keystoneScore = Math.max(0, 100 - (buildPenalties.keystonePenalty / 20) * 100)
  const spellsScore = Math.max(0, 100 - (buildPenalties.spellsPenalty / 20) * 100)
  const skillOrderScore = Math.max(0, 100 - (buildPenalties.skillOrderPenalty / 20) * 100)
  const buildOrderScore = Math.max(0, 100 - (buildPenalties.buildOrderPenalty / 20) * 100)

  // Add build metrics
  metrics.push({ name: 'Items', score: itemScore, weight: 0.4 })
  metrics.push({ name: 'Keystone', score: keystoneScore, weight: 0.2 })
  metrics.push({ name: 'Spells', score: spellsScore, weight: 0.15 })
  metrics.push({ name: 'Skill Order', score: skillOrderScore, weight: 0.15 })
  metrics.push({ name: 'Build Order', score: buildOrderScore, weight: 0.1 })

  // Weighted average
  const buildScore =
    itemScore * 0.4 + keystoneScore * 0.2 + spellsScore * 0.15 + skillOrderScore * 0.15 + buildOrderScore * 0.1

  // ============================================================================
  // TIMELINE COMPONENT (20% of final score)
  // ============================================================================
  let timelineScore = 50

  if (participant.takedownQualityScore !== undefined && participant.deathQualityScore !== undefined) {
    timelineScore = participant.deathQualityScore * 0.8 + participant.takedownQualityScore * 0.2
    metrics.push({ name: 'Death Quality', score: participant.deathQualityScore, weight: 0.8 })
    metrics.push({ name: 'Takedown Quality', score: participant.takedownQualityScore, weight: 0.2 })
  } else if (participant.deathQualityScore !== undefined) {
    timelineScore = participant.deathQualityScore
    metrics.push({ name: 'Death Quality', score: participant.deathQualityScore, weight: 1.0 })
  } else if (participant.takedownQualityScore !== undefined) {
    timelineScore = participant.takedownQualityScore
    metrics.push({ name: 'Takedown Quality', score: participant.takedownQualityScore, weight: 1.0 })
  } else {
    metrics.push({ name: 'Timeline', score: 50, weight: 1.0 })
  }

  // ============================================================================
  // KDA COMPONENT (10% of final score)
  // ============================================================================
  let kdaScore = 50
  let killParticipation: number | undefined

  if (
    participant.kills !== undefined &&
    participant.assists !== undefined &&
    participant.teamTotalKills !== undefined &&
    participant.teamTotalKills > 0
  ) {
    killParticipation = (participant.kills + participant.assists) / participant.teamTotalKills
    const kpScore = calculateKillParticipationScore(killParticipation)
    const deathScore = calculateDeathsScore(participant.deaths, gameDurationMinutes)
    kdaScore = kpScore * 0.6 + deathScore * 0.4

    metrics.push({ name: 'Kill Participation', score: kpScore, weight: 0.6, playerValue: killParticipation * 100 })
    metrics.push({ name: 'Deaths/Min', score: deathScore, weight: 0.4, playerValue: participant.deaths / gameDurationMinutes })
  }

  // ============================================================================
  // FINAL SCORE
  // ============================================================================
  const finalScore = Math.round(performanceScore * 0.5 + buildScore * 0.2 + timelineScore * 0.2 + kdaScore * 0.1)

  return {
    finalScore: Math.max(0, Math.min(100, finalScore)),
    playerStats: { ...playerStats, killParticipation },
    championAvgStats: championAvgPerMin,
    componentScores: {
      performance: Math.round(performanceScore),
      build: Math.round(buildScore),
      timeline: Math.round(timelineScore),
      kda: Math.round(kdaScore),
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
      description: `Score is based on percentile performance vs other ${championName} players. 50 = average (50th percentile), 100 = excellent (98th percentile, top 2%).`,
    },
    totalGames,
    patch: selectedStats.patch,
    matchPatch: usedFallbackPatch ? (participant.patch ?? undefined) : undefined,
    usedFallbackPatch,
  }
}
