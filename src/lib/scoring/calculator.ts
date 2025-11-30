// PIG Score calculator - main scoring functions
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getStdDev, getZScore } from '../db/stats-aggregator'
import {
  calculateStatPenalty,
  calculateDeathsPerMinutePenalty,
  calculateKillParticipationPenalty,
  calculateItemPenalty,
  calculateAllBuildPenalties,
  calculateKeystonePenalty,
  calculateSpellsPenalty,
  calculateSkillOrderPenalty,
  calculateBuildOrderPenalty,
  type ItemPenaltyDetail
} from './penalties'

// Target z-score for "perfect" performance (matches penalties.ts)
const TARGET_Z_SCORE = 1.0

// Determine relevant stats for a champion based on their data
// Returns weights (0-1) for each stat based on how meaningful it is for this champion
interface StatRelevance {
  damageToChampions: number  // 0-1 weight
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
  // Base relevance on:
  // 1. Whether the stat has a meaningful average (threshold-based)
  // 2. Coefficient of variation (CV = stddev/mean) - higher CV means more skill expression
  
  const relevance: StatRelevance = {
    damageToChampions: 1.0,  // always relevant - everyone should do damage
    totalDamage: 1.0,        // always relevant
    healingShielding: 0,
    ccTime: 0
  }
  
  // Healing/Shielding: only relevant if champion avg >= 300/min (lower threshold to catch more healers)
  // Then scale weight by how much they heal relative to damage dealers
  if (championAvgPerMin.healingShieldingPerMin >= 300) {
    // Weight from 0.5 (300/min) to 1.0 (1500+/min)
    const healWeight = Math.min(1.0, 0.5 + (championAvgPerMin.healingShieldingPerMin - 300) / 2400)
    relevance.healingShielding = healWeight
  }
  
  // CC Time: only relevant if champion avg >= 2 sec/min (lower threshold)
  // Then scale weight by how much CC they have
  if (championAvgPerMin.ccTimePerMin >= 2) {
    // Weight from 0.5 (2 sec/min) to 1.0 (8+ sec/min)
    const ccWeight = Math.min(1.0, 0.5 + (championAvgPerMin.ccTimePerMin - 2) / 12)
    relevance.ccTime = ccWeight
  }
  
  // Boost relevance if there's high variance (skill expression opportunity)
  if (welford) {
    // Damage stats: boost if CV > 0.3 (30% variation)
    if (welford.damageToChampionsPerMin && welford.damageToChampionsPerMin.n >= 30) {
      const cv = getStdDev(welford.damageToChampionsPerMin) / welford.damageToChampionsPerMin.mean
      if (cv > 0.3) relevance.damageToChampions = Math.min(1.0, relevance.damageToChampions * (1 + cv * 0.5))
    }
    
    // Healing: boost if high variance (some players really maximize it)
    if (welford.healingShieldingPerMin && welford.healingShieldingPerMin.n >= 30 && relevance.healingShielding > 0) {
      const cv = getStdDev(welford.healingShieldingPerMin) / welford.healingShieldingPerMin.mean
      if (cv > 0.4) relevance.healingShielding = Math.min(1.0, relevance.healingShielding * (1 + cv * 0.3))
    }
    
    // CC: boost if high variance
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
  kills?: number           // for kill participation
  assists?: number         // for kill participation
  teamTotalKills?: number  // total kills by player's team
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
}

export interface PigScoreBreakdown {
  finalScore: number
  playerStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
    deathsPerMin: number
    killParticipation?: number  // 0-1 value
  }
  championAvgStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  }
  penalties: {
    name: string
    penalty: number
    maxPenalty: number
    playerValue?: number
    avgValue?: number
    percentOfAvg?: number
    zScore?: number           // NEW: z-score for the stat
    targetZScore?: number     // NEW: target z-score (e.g., 1.0)
    stdDev?: number           // NEW: standard deviation
    relevanceWeight?: number  // NEW: stat relevance weight (0-1)
  }[]
  itemDetails?: ItemPenaltyDetail[]  // NEW: per-item breakdown
  scoringInfo: {                     // NEW: scoring formula info
    targetZScore: number             // The z-score target (+1 stddev)
    meanPenaltyPercent: number       // Penalty at mean (25%)
    description: string              // Human-readable explanation
  }
  totalGames: number
  patch: string
}

// calculate pig score based on performance vs patch champion averages
export async function calculatePigScore(participant: ParticipantData): Promise<number | null> {
  const supabase = createAdminClient()
  let score = 100 // start at perfect score
  
  const championName = participant.championName
  const gameDurationMinutes = participant.game_duration / 60
  
  // debug logging
  if (gameDurationMinutes <= 0 || participant.time_ccing_others === undefined) {
    console.log(`Invalid data for ${championName}:`, {
      game_duration: participant.game_duration,
      game_duration_minutes: gameDurationMinutes,
      time_ccing_others: participant.time_ccing_others,
      damage_to_champs: participant.damage_dealt_to_champions
    })
  }
  
  if (gameDurationMinutes <= 0) return null // invalid game duration
  
  // Try to get championStats for current patch first, fallback to any available patch
  const { data: championStats, error: avgError } = await supabase
    .from('champion_stats')
    .select('data, patch')
    .eq('champion_name', championName)
    .order('patch', { ascending: false })
    .limit(10)
  
  if (avgError) {
    console.error(`Error fetching champion stats for ${championName}:`, avgError)
    return null
  }
  
  if (!championStats || championStats.length === 0) {
    console.log(`No champion stats found for ${championName}`)
    return null
  }
  
  // Find matching patch with 100+ games, or fallback to any patch with 100+ games
  let selectedStats = championStats.find(s => s.patch === participant.patch && (s.data?.games || 0) >= 100)
  if (!selectedStats) {
    selectedStats = championStats.find(s => (s.data?.games || 0) >= 100)
    if (selectedStats) {
      console.log(`No sufficient stats for patch ${participant.patch}, using ${selectedStats.patch} (${selectedStats.data?.games} games)`)
    }
  }
  
  if (!selectedStats) {
    const bestAvailable = championStats[0]
    console.log(`Not enough games for ${championName} on any patch (best: ${bestAvailable?.data?.games || 0} games, need 100+)`)
    return null
  }
  
  const championAvg = selectedStats.data?.championStats
  if (!championAvg || !championAvg.sumGameDuration || championAvg.sumGameDuration === 0) {
    console.log(`No championStats found for ${championName}`)
    return null
  }
  
  const totalGames = selectedStats.data.games || 0

  // calculate player's per-minute stats
  const playerStats = {
    damageToChampionsPerMin: participant.damage_dealt_to_champions / gameDurationMinutes,
    totalDamagePerMin: participant.total_damage_dealt / gameDurationMinutes,
    healingShieldingPerMin: (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
  }
  
  console.log(`Raw player stats:`, {
    damage_dealt_to_champions: participant.damage_dealt_to_champions,
    total_damage_dealt: participant.total_damage_dealt,
    total_heals_on_teammates: participant.total_heals_on_teammates,
    total_damage_shielded_on_teammates: participant.total_damage_shielded_on_teammates,
    time_ccing_others: participant.time_ccing_others,
    game_duration: participant.game_duration
  })
  
  // check if required stats are available (old matches may not have these)
  if (!participant.total_damage_dealt || participant.total_damage_dealt === 0) {
    console.log(`Missing total_damage_dealt for ${championName} - cannot calculate pig score (old match)`)
    return null
  }
  
  // champion averages (convert sums to per-game averages, then to per-minute)
  const avgGameDurationMinutes = (championAvg.sumGameDuration / totalGames) / 60
  const championAvgPerMin = {
    damageToChampionsPerMin: (championAvg.sumDamageToChampions / totalGames) / avgGameDurationMinutes,
    totalDamagePerMin: (championAvg.sumTotalDamage / totalGames) / avgGameDurationMinutes,
    healingShieldingPerMin: ((championAvg.sumHealing + championAvg.sumShielding) / totalGames) / avgGameDurationMinutes,
    ccTimePerMin: (championAvg.sumCCTime / totalGames) / avgGameDurationMinutes,
  }
  
  // Get Welford stats for z-score calculations (if available)
  const welford = championAvg.welford || null
  
  // Calculate dynamic stat relevance for this champion
  const relevance = calculateStatRelevance(championAvgPerMin, welford)
  
  // Base max penalty is 80 per damage stat, scaled by relevance weight
  // Total performance penalty budget is ~160+ points across all stats
  const penalties: { [key: string]: number } = {}
  
  // Damage to Champions - always relevant (weight 1.0)
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const maxPenalty = 80 * relevance.damageToChampions
    const penalty = calculateStatPenalty(
      playerStats.damageToChampionsPerMin, 
      championAvgPerMin.damageToChampionsPerMin, 
      maxPenalty,
      welford?.damageToChampionsPerMin
    )
    penalties['Damage to Champions'] = penalty
    score -= penalty
  }
  
  // Total Damage - always relevant (weight 1.0)
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const maxPenalty = 80 * relevance.totalDamage
    const penalty = calculateStatPenalty(
      playerStats.totalDamagePerMin, 
      championAvgPerMin.totalDamagePerMin, 
      maxPenalty,
      welford?.totalDamagePerMin
    )
    penalties['Total Damage'] = penalty
    score -= penalty
  }
  
  // Healing/Shielding - only if champion has meaningful healing (weighted)
  if (relevance.healingShielding > 0) {
    const maxPenalty = 40 * relevance.healingShielding
    const penalty = calculateStatPenalty(
      playerStats.healingShieldingPerMin, 
      championAvgPerMin.healingShieldingPerMin, 
      maxPenalty,
      welford?.healingShieldingPerMin
    )
    penalties['Healing/Shielding'] = penalty
    score -= penalty
  }
  
  // CC Time - only if champion has meaningful CC (weighted)
  if (relevance.ccTime > 0) {
    const maxPenalty = 40 * relevance.ccTime
    const penalty = calculateStatPenalty(
      playerStats.ccTimePerMin, 
      championAvgPerMin.ccTimePerMin, 
      maxPenalty,
      welford?.ccTimePerMin
    )
    penalties['CC Time'] = penalty
    score -= penalty
  }
  
  // calculate item build penalty
  const itemPenalty = await calculateItemPenalty(participant, championName)
  penalties['Items'] = itemPenalty
  score -= itemPenalty
  
  // calculate keystone penalty
  const keystonePenalty = await calculateKeystonePenalty(participant, championName)
  penalties['Keystone'] = keystonePenalty
  score -= keystonePenalty
  
  // calculate summoner spells penalty
  const spellsPenalty = await calculateSpellsPenalty(participant, championName)
  penalties['Spells'] = spellsPenalty
  score -= spellsPenalty
  
  // calculate skill order penalty
  const skillOrderPenalty = await calculateSkillOrderPenalty(participant, championName)
  penalties['Skill Order'] = skillOrderPenalty
  score -= skillOrderPenalty
  
  // calculate build order penalty
  const buildOrderPenalty = await calculateBuildOrderPenalty(participant, championName)
  penalties['Build Order'] = buildOrderPenalty
  score -= buildOrderPenalty
  
  // calculate deaths per minute penalty
  const deathsPenalty = calculateDeathsPerMinutePenalty(participant.deaths, gameDurationMinutes)
  penalties['Deaths/Min'] = deathsPenalty
  score -= deathsPenalty
  
  // calculate kill participation penalty (if data available)
  if (participant.kills !== undefined && participant.assists !== undefined && participant.teamTotalKills !== undefined && participant.teamTotalKills > 0) {
    const killParticipation = (participant.kills + participant.assists) / participant.teamTotalKills
    const kpPenalty = calculateKillParticipationPenalty(killParticipation)
    penalties['Kill Participation'] = kpPenalty
    score -= kpPenalty
  }
  
  // clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  
  // detailed logging
  console.log(`\nPIG SCORE for ${championName}:`)
  console.log(`  Starting Score: 100`)
  console.log(`  Player Stats (per min):`, {
    dmg: playerStats.damageToChampionsPerMin.toFixed(1),
    totalDmg: playerStats.totalDamagePerMin.toFixed(1),
    heal: playerStats.healingShieldingPerMin.toFixed(1),
    cc: playerStats.ccTimePerMin.toFixed(1),
    deaths: participant.deaths,
    deathsPerMin: (participant.deaths / gameDurationMinutes).toFixed(2)
  })
  console.log(`  Champion Avg (per min):`, {
    dmg: championAvgPerMin.damageToChampionsPerMin.toFixed(1),
    totalDmg: championAvgPerMin.totalDamagePerMin.toFixed(1),
    heal: championAvgPerMin.healingShieldingPerMin.toFixed(1),
    cc: championAvgPerMin.ccTimePerMin.toFixed(1)
  })
  console.log(`  Penalties:`, penalties)
  console.log(`  Final Score: ${finalScore}\n`)
  
  return finalScore
}

// calculate pig score with full breakdown for UI display
export async function calculatePigScoreWithBreakdown(participant: ParticipantData): Promise<PigScoreBreakdown | null> {
  const supabase = createAdminClient()
  let score = 100
  
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
    healingShieldingPerMin: (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
    deathsPerMin: participant.deaths / gameDurationMinutes
  }
  
  // check if required stats are available
  if (!participant.total_damage_dealt || participant.total_damage_dealt === 0) return null
  
  // champion averages
  const avgGameDurationMinutes = (championAvg.sumGameDuration / totalGames) / 60
  const championAvgPerMin = {
    damageToChampionsPerMin: (championAvg.sumDamageToChampions / totalGames) / avgGameDurationMinutes,
    totalDamagePerMin: (championAvg.sumTotalDamage / totalGames) / avgGameDurationMinutes,
    healingShieldingPerMin: ((championAvg.sumHealing + championAvg.sumShielding) / totalGames) / avgGameDurationMinutes,
    ccTimePerMin: (championAvg.sumCCTime / totalGames) / avgGameDurationMinutes,
  }
  
  // Get Welford stats for z-score calculations (if available)
  const welford = championAvg.welford || null
  
  // Calculate dynamic stat relevance for this champion
  const relevance = calculateStatRelevance(championAvgPerMin, welford)
  
  const penalties: PigScoreBreakdown['penalties'] = []
  
  // Helper to get z-score info for a stat
  const getZScoreInfo = (playerValue: number, welfordState?: WelfordState) => {
    if (!welfordState || welfordState.n < 30) return {}
    const stdDev = getStdDev(welfordState)
    if (stdDev <= welfordState.mean * 0.05) return {}
    return {
      zScore: getZScore(playerValue, welfordState),
      targetZScore: TARGET_Z_SCORE,
      stdDev
    }
  }
  
  // damage to champions penalty
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const maxPenalty = 80 * relevance.damageToChampions
    const penalty = calculateStatPenalty(
      playerStats.damageToChampionsPerMin, 
      championAvgPerMin.damageToChampionsPerMin, 
      maxPenalty,
      welford?.damageToChampionsPerMin
    )
    const percentOfAvg = (playerStats.damageToChampionsPerMin / championAvgPerMin.damageToChampionsPerMin) * 100
    penalties.push({
      name: 'Damage to Champions',
      penalty,
      maxPenalty,
      playerValue: playerStats.damageToChampionsPerMin,
      avgValue: championAvgPerMin.damageToChampionsPerMin,
      percentOfAvg,
      relevanceWeight: relevance.damageToChampions,
      ...getZScoreInfo(playerStats.damageToChampionsPerMin, welford?.damageToChampionsPerMin)
    })
    score -= penalty
  }
  
  // total damage penalty
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const maxPenalty = 80 * relevance.totalDamage
    const penalty = calculateStatPenalty(
      playerStats.totalDamagePerMin, 
      championAvgPerMin.totalDamagePerMin, 
      maxPenalty,
      welford?.totalDamagePerMin
    )
    const percentOfAvg = (playerStats.totalDamagePerMin / championAvgPerMin.totalDamagePerMin) * 100
    penalties.push({
      name: 'Total Damage',
      penalty,
      maxPenalty,
      playerValue: playerStats.totalDamagePerMin,
      avgValue: championAvgPerMin.totalDamagePerMin,
      percentOfAvg,
      relevanceWeight: relevance.totalDamage,
      ...getZScoreInfo(playerStats.totalDamagePerMin, welford?.totalDamagePerMin)
    })
    score -= penalty
  }
  
  // healing/shielding penalty - weighted by relevance
  if (relevance.healingShielding > 0) {
    const maxPenalty = 40 * relevance.healingShielding
    const penalty = calculateStatPenalty(
      playerStats.healingShieldingPerMin, 
      championAvgPerMin.healingShieldingPerMin, 
      maxPenalty,
      welford?.healingShieldingPerMin
    )
    const percentOfAvg = (playerStats.healingShieldingPerMin / championAvgPerMin.healingShieldingPerMin) * 100
    penalties.push({
      name: 'Healing/Shielding',
      penalty,
      maxPenalty,
      playerValue: playerStats.healingShieldingPerMin,
      avgValue: championAvgPerMin.healingShieldingPerMin,
      percentOfAvg,
      relevanceWeight: relevance.healingShielding,
      ...getZScoreInfo(playerStats.healingShieldingPerMin, welford?.healingShieldingPerMin)
    })
    score -= penalty
  }
  
  // cc time penalty - weighted by relevance
  if (relevance.ccTime > 0) {
    const maxPenalty = 40 * relevance.ccTime
    const penalty = calculateStatPenalty(
      playerStats.ccTimePerMin, 
      championAvgPerMin.ccTimePerMin, 
      maxPenalty,
      welford?.ccTimePerMin
    )
    const percentOfAvg = (playerStats.ccTimePerMin / championAvgPerMin.ccTimePerMin) * 100
    penalties.push({
      name: 'CC Time',
      penalty,
      maxPenalty,
      playerValue: playerStats.ccTimePerMin,
      avgValue: championAvgPerMin.ccTimePerMin,
      percentOfAvg,
      relevanceWeight: relevance.ccTime,
      ...getZScoreInfo(playerStats.ccTimePerMin, welford?.ccTimePerMin)
    })
    score -= penalty
  }
  
  // Calculate all build penalties in ONE parallel batch (much faster!)
  const buildPenalties = await calculateAllBuildPenalties(participant, championName)
  
  // item penalty with details
  penalties.push({ name: 'Items', penalty: buildPenalties.itemPenalty, maxPenalty: 60 })
  score -= buildPenalties.itemPenalty
  
  // keystone penalty
  penalties.push({ name: 'Keystone', penalty: buildPenalties.keystonePenalty, maxPenalty: 20 })
  score -= buildPenalties.keystonePenalty
  
  // spells penalty
  penalties.push({ name: 'Spells', penalty: buildPenalties.spellsPenalty, maxPenalty: 20 })
  score -= buildPenalties.spellsPenalty
  
  // skill order penalty
  penalties.push({ name: 'Skill Order', penalty: buildPenalties.skillOrderPenalty, maxPenalty: 20 })
  score -= buildPenalties.skillOrderPenalty
  
  // build order penalty
  penalties.push({ name: 'Build Order', penalty: buildPenalties.buildOrderPenalty, maxPenalty: 20 })
  score -= buildPenalties.buildOrderPenalty
  
  // deaths per minute penalty
  const deathsPenalty = calculateDeathsPerMinutePenalty(participant.deaths, gameDurationMinutes)
  penalties.push({ 
    name: 'Deaths/Min', 
    penalty: deathsPenalty, 
    maxPenalty: 30,
    playerValue: playerStats.deathsPerMin
  })
  score -= deathsPenalty
  
  // kill participation penalty (if data available)
  let killParticipation: number | undefined
  if (participant.kills !== undefined && participant.assists !== undefined && participant.teamTotalKills !== undefined && participant.teamTotalKills > 0) {
    killParticipation = (participant.kills + participant.assists) / participant.teamTotalKills
    const kpPenalty = calculateKillParticipationPenalty(killParticipation)
    penalties.push({
      name: 'Kill Participation',
      penalty: kpPenalty,
      maxPenalty: 40,
      playerValue: killParticipation * 100,  // display as percentage
      avgValue: 90  // target is 90%
    })
    score -= kpPenalty
  }
  
  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  
  return {
    finalScore,
    playerStats: {
      ...playerStats,
      killParticipation
    },
    championAvgStats: championAvgPerMin,
    penalties,
    itemDetails: buildPenalties.itemDetails,
    scoringInfo: {
      targetZScore: TARGET_Z_SCORE,
      meanPenaltyPercent: 25,
      description: `Performance is measured against other ${championName} players. Target: top ${Math.round((1 - 0.8413) * 100)}% (mean + 1 stddev). Players at the mean receive a 25% penalty per stat.`
    },
    totalGames,
    patch: selectedStats.patch
  }
}
