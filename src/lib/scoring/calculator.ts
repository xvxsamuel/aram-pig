// PIG Score calculator - main scoring functions
import { createAdminClient } from '../db/supabase'
import {
  calculateStatPenalty,
  calculateDeathsPerMinutePenalty,
  calculateItemPenalty,
  calculateKeystonePenalty,
  calculateSpellsPenalty,
  calculateSkillOrderPenalty,
  calculateBuildOrderPenalty
} from './penalties'

export interface ParticipantData {
  championName: string
  damage_dealt_to_champions: number
  total_damage_dealt: number
  total_heals_on_teammates: number
  total_damage_shielded_on_teammates: number
  time_ccing_others: number
  game_duration: number
  deaths: number
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
  }[]
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
  
  // calculate performance penalties (skip if champion average is null/0)
  const penalties: { [key: string]: number } = {}
  
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const penalty = calculateStatPenalty(playerStats.damageToChampionsPerMin, championAvgPerMin.damageToChampionsPerMin, 20)
    penalties['Damage to Champions'] = penalty
    score -= penalty
  }
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const penalty = calculateStatPenalty(playerStats.totalDamagePerMin, championAvgPerMin.totalDamagePerMin, 20)
    penalties['Total Damage'] = penalty
    score -= penalty
  }
  // only penalize healing/shielding if champion actually heals/shields significantly (500+/min average)
  if (championAvgPerMin.healingShieldingPerMin >= 500) {
    const penalty = calculateStatPenalty(playerStats.healingShieldingPerMin, championAvgPerMin.healingShieldingPerMin, 20)
    penalties['Healing/Shielding'] = penalty
    score -= penalty
  }
  // only penalize CC if champion has meaningful CC (3+ seconds/min average)
  if (championAvgPerMin.ccTimePerMin >= 3) {
    const penalty = calculateStatPenalty(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, 20)
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
  
  const penalties: PigScoreBreakdown['penalties'] = []
  
  // damage to champions penalty
  if (championAvgPerMin.damageToChampionsPerMin > 0) {
    const penalty = calculateStatPenalty(playerStats.damageToChampionsPerMin, championAvgPerMin.damageToChampionsPerMin, 20)
    const percentOfAvg = (playerStats.damageToChampionsPerMin / championAvgPerMin.damageToChampionsPerMin) * 100
    penalties.push({
      name: 'Damage to Champions',
      penalty,
      maxPenalty: 20,
      playerValue: playerStats.damageToChampionsPerMin,
      avgValue: championAvgPerMin.damageToChampionsPerMin,
      percentOfAvg
    })
    score -= penalty
  }
  
  // total damage penalty
  if (championAvgPerMin.totalDamagePerMin > 0) {
    const penalty = calculateStatPenalty(playerStats.totalDamagePerMin, championAvgPerMin.totalDamagePerMin, 20)
    const percentOfAvg = (playerStats.totalDamagePerMin / championAvgPerMin.totalDamagePerMin) * 100
    penalties.push({
      name: 'Total Damage',
      penalty,
      maxPenalty: 20,
      playerValue: playerStats.totalDamagePerMin,
      avgValue: championAvgPerMin.totalDamagePerMin,
      percentOfAvg
    })
    score -= penalty
  }
  
  // healing/shielding penalty - only for champions that actually heal/shield (500+/min average)
  if (championAvgPerMin.healingShieldingPerMin >= 500) {
    const penalty = calculateStatPenalty(playerStats.healingShieldingPerMin, championAvgPerMin.healingShieldingPerMin, 20)
    const percentOfAvg = (playerStats.healingShieldingPerMin / championAvgPerMin.healingShieldingPerMin) * 100
    penalties.push({
      name: 'Healing/Shielding',
      penalty,
      maxPenalty: 20,
      playerValue: playerStats.healingShieldingPerMin,
      avgValue: championAvgPerMin.healingShieldingPerMin,
      percentOfAvg
    })
    score -= penalty
  }
  
  // cc time penalty - only for champions with meaningful CC (3+s/min average)
  if (championAvgPerMin.ccTimePerMin >= 3) {
    const penalty = calculateStatPenalty(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, 20)
    const percentOfAvg = (playerStats.ccTimePerMin / championAvgPerMin.ccTimePerMin) * 100
    penalties.push({
      name: 'CC Time',
      penalty,
      maxPenalty: 20,
      playerValue: playerStats.ccTimePerMin,
      avgValue: championAvgPerMin.ccTimePerMin,
      percentOfAvg
    })
    score -= penalty
  }
  
  // item penalty
  const itemPenalty = await calculateItemPenalty(participant, championName)
  penalties.push({ name: 'Items', penalty: itemPenalty, maxPenalty: 10 })
  score -= itemPenalty
  
  // keystone penalty
  const keystonePenalty = await calculateKeystonePenalty(participant, championName)
  penalties.push({ name: 'Keystone', penalty: keystonePenalty, maxPenalty: 10 })
  score -= keystonePenalty
  
  // spells penalty
  const spellsPenalty = await calculateSpellsPenalty(participant, championName)
  penalties.push({ name: 'Spells', penalty: spellsPenalty, maxPenalty: 5 })
  score -= spellsPenalty
  
  // skill order penalty
  const skillOrderPenalty = await calculateSkillOrderPenalty(participant, championName)
  penalties.push({ name: 'Skill Order', penalty: skillOrderPenalty, maxPenalty: 8 })
  score -= skillOrderPenalty
  
  // build order penalty
  const buildOrderPenalty = await calculateBuildOrderPenalty(participant, championName)
  penalties.push({ name: 'Build Order', penalty: buildOrderPenalty, maxPenalty: 8 })
  score -= buildOrderPenalty
  
  // deaths per minute penalty
  const deathsPenalty = calculateDeathsPerMinutePenalty(participant.deaths, gameDurationMinutes)
  penalties.push({ 
    name: 'Deaths/Min', 
    penalty: deathsPenalty, 
    maxPenalty: 15,
    playerValue: playerStats.deathsPerMin
  })
  score -= deathsPenalty
  
  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  
  return {
    finalScore,
    playerStats,
    championAvgStats: championAvgPerMin,
    penalties,
    totalGames,
    patch: selectedStats.patch
  }
}
