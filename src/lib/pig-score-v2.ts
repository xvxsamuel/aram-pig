// pig score calculation - compares player performance to champion averages
import { createAdminClient } from './supabase'

interface ParticipantData {
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
  // new fields from scraper
  spell1?: number
  spell2?: number
  skillOrder?: string // e.g., "qew" or "qwe" 
  buildOrder?: string // comma-separated item IDs in purchase order
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
    .limit(10) // get recent patches for fallback
  
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
    // fallback to any patch with sufficient games
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
  // this avoids penalizing non-healers for not healing
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

// calculate penalty for a single stat based on performance vs average
function calculateStatPenalty(playerValue: number, avgValue: number, maxPenalty: number): number {
  if (avgValue <= 0) return 0 // no baseline to compare
  
  const performanceRatio = playerValue / avgValue
  
  if (performanceRatio >= 1.0) return 0 // at or above average
  if (performanceRatio >= 0.9) return maxPenalty * 0.15 // 90-99%: -3 points
  if (performanceRatio >= 0.8) return maxPenalty * 0.30 // 80-89%: -6 points
  if (performanceRatio >= 0.7) return maxPenalty * 0.50 // 70-79%: -10 points
  if (performanceRatio >= 0.6) return maxPenalty * 0.75 // 60-69%: -15 points
  return maxPenalty // <60%: full penalty
}

// calculate item build penalty by comparing to top meta items
// only looks at first 3 legendary items (excludes boots and components)
// uses priority formula: winrate * sqrt(pickrate)
async function calculateItemPenalty(participant: ParticipantData, championName: string): Promise<number> {
  if (!participant.patch) return 0 // can't compare without patch
  
  const supabase = createAdminClient()
  let totalPenalty = 0
  const items = [participant.item0, participant.item1, participant.item2] // only first 3 items
  
  // get item stats for this champion and patch
  const { data: itemStats } = await supabase
    .from('item_stats_by_patch')
    .select('item_id, slot, games, wins, winrate')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
  
  if (!itemStats || itemStats.length === 0) return 0
  
  // get total games for this champion to calculate pickrate
  const { data: championData } = await supabase
    .from('champion_stats_incremental')
    .select('games')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  const totalGames = championData?.games || 1
  
  // process first 3 item slots only
  for (let slot = 0; slot < 3; slot++) {
    const playerItemId = items[slot]
    if (!playerItemId || playerItemId === 0) continue
    
    // skip boots (item IDs 3006, 3009, 3020, 3047, 3111, 3117, 3158)
    const bootsIds = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
    if (bootsIds.includes(playerItemId)) continue
    
    // get items for this slot
    const slotItems = itemStats.filter(i => i.slot === slot)
    if (slotItems.length === 0) continue
    
    // calculate priority scores: winrate only (pickrate not considered)
    const itemsWithPriority = slotItems
      .map(item => {
        const pickrate = (item.games / totalGames) * 100
        const priority = item.winrate // use winrate only
        return { ...item, pickrate, priority }
      })
      .filter(item => item.games >= 30) // minimum 30 games sample size
      .sort((a, b) => b.priority - a.priority)
    
    if (itemsWithPriority.length === 0) continue // no items with enough data
    
    const top5 = itemsWithPriority.slice(0, 5)
    const playerItem = itemsWithPriority.find(i => i.item_id === playerItemId)
    
    if (!playerItem) {
      // item not in dataset or too few games, small penalty
      totalPenalty += 1
      continue
    }
    
    // check if player's item is in top 5
    const isInTop5 = top5.some(i => i.item_id === playerItemId)
    if (isInTop5) {
      // meta choice, no penalty
      continue
    }
    
    // calculate penalty: 2 points per 10 priority difference from top item
    const topPriority = top5[0].priority
    const priorityDiff = topPriority - playerItem.priority
    const penaltyAmount = Math.min(3, priorityDiff / 50)
    totalPenalty += penaltyAmount
  }
  
  return Math.min(10, totalPenalty) // cap at 10 points
}

// calculate keystone penalty by comparing to top meta keystones
// minimum 50 games required for keystone to be considered
async function calculateKeystonePenalty(participant: ParticipantData, championName: string): Promise<number> {
  if (!participant.patch || !participant.perk0) return 0
  
  const supabase = createAdminClient()
  
  // get keystone stats (slot 0) for this champion and patch
  const { data: runeStats } = await supabase
    .from('rune_stats_by_patch')
    .select('rune_id, games, wins, winrate')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .eq('slot', 0) // keystones are in slot 0
  
  if (!runeStats || runeStats.length === 0) return 0
  
  // calculate priority scores: winrate only (pickrate not considered)
  const totalGames = runeStats.reduce((sum, r) => sum + r.games, 0)
  const runesWithPriority = runeStats
    .map(rune => {
      const pickrate = (rune.games / totalGames) * 100
      const priority = rune.winrate // use winrate only
      return { ...rune, pickrate, priority }
    })
    .filter(rune => rune.games >= 50) // minimum 50 games sample size
    .sort((a, b) => b.priority - a.priority)
  
  if (runesWithPriority.length === 0) return 0 // no keystones with enough data
  
  const top5 = runesWithPriority.slice(0, 5)
  const playerRune = runesWithPriority.find(r => r.rune_id === participant.perk0)
  
  if (!playerRune) {
    // rune not in dataset or too few games, moderate penalty
    return 5
  }
  
  // check if player's keystone is in top 5
  const isInTop5 = top5.some(r => r.rune_id === participant.perk0)
  if (isInTop5) {
    // meta choice, no penalty
    return 0
  }
  
  // calculate penalty: 2 points per 10 priority difference from top keystone
  const topPriority = top5[0].priority
  const priorityDiff = topPriority - playerRune.priority
  const penaltyAmount = Math.min(10, priorityDiff / 20)
  
  return penaltyAmount
}

// calculate deaths per minute penalty
// optimal range: 0.5-0.7 deaths/min (no penalty)
// penalty for too many deaths (playing too aggressive/careless)
// higher penalty for too few deaths (not engaging enough, hurting team)
function calculateDeathsPerMinutePenalty(deaths: number, gameDurationMinutes: number): number {
  if (gameDurationMinutes <= 0) return 0
  
  const deathsPerMin = deaths / gameDurationMinutes
  
  // optimal range: 0.5-0.7 deaths/min
  if (deathsPerMin >= 0.5 && deathsPerMin <= 0.7) return 0
  
  // too few deaths (more severe penalty - not engaging)
  if (deathsPerMin < 0.5) {
    const deficit = 0.5 - deathsPerMin
    // 0.4 deaths/min: -3 points
    // 0.3 deaths/min: -6 points
    // 0.2 deaths/min: -9 points
    // 0.1 deaths/min: -12 points
    // 0.0 deaths/min: -15 points
    return Math.min(15, deficit * 30)
  }
  
  // too many deaths (less severe penalty - at least engaging)
  if (deathsPerMin > 0.7) {
    const excess = deathsPerMin - 0.7
    // 0.8 deaths/min: -2 points
    // 0.9 deaths/min: -4 points
    // 1.0 deaths/min: -6 points
    // 1.2 deaths/min: -10 points
    return Math.min(10, excess * 20)
  }
  
  return 0
}

// calculate summoner spells penalty by comparing to meta spell combinations
async function calculateSpellsPenalty(participant: ParticipantData, championName: string): Promise<number> {
  if (!participant.patch || !participant.spell1 || !participant.spell2) return 0
  
  const supabase = createAdminClient()
  
  // get champion stats with spells data
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.spells) return 0
  
  const spellsObj = championStats.data.spells as Record<string, { games: number; wins: number }>
  const spellsEntries = Object.entries(spellsObj)
  if (spellsEntries.length === 0) return 0
  
  // normalize player's spells to match format (sorted by id)
  const playerSpells = [participant.spell1, participant.spell2].sort((a, b) => a - b)
  const playerKey = `${playerSpells[0]}_${playerSpells[1]}`
  
  // calculate winrates for all spell combos
  const spellsWithWinrate = spellsEntries
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0
    }))
    .filter(s => s.games >= 30) // minimum sample size
    .sort((a, b) => b.winrate - a.winrate)
  
  if (spellsWithWinrate.length === 0) return 0
  
  // check if player's combo is in top 3
  const top3 = spellsWithWinrate.slice(0, 3)
  const playerSpellCombo = spellsWithWinrate.find(s => s.key === playerKey)
  
  if (!playerSpellCombo) {
    // not in dataset, small penalty
    return 2
  }
  
  const isInTop3 = top3.some(s => s.key === playerKey)
  if (isInTop3) return 0
  
  // penalty based on winrate difference
  const topWinrate = top3[0].winrate
  const winrateDiff = topWinrate - playerSpellCombo.winrate
  return Math.min(5, winrateDiff / 10) // max 5 points penalty
}

// calculate skill max order penalty (e.g., qew vs qwe)
async function calculateSkillOrderPenalty(participant: ParticipantData, championName: string): Promise<number> {
  if (!participant.patch || !participant.skillOrder) return 0
  
  const supabase = createAdminClient()
  
  // get champion stats with skills data
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.skills) return 0
  
  const skillsObj = championStats.data.skills as Record<string, { games: number; wins: number }>
  const skillsEntries = Object.entries(skillsObj)
  if (skillsEntries.length === 0) return 0
  
  // calculate winrates
  const skillsWithWinrate = skillsEntries
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0
    }))
    .filter(s => s.games >= 20) // minimum sample size
    .sort((a, b) => b.winrate - a.winrate)
  
  if (skillsWithWinrate.length === 0) return 0
  
  // check if player's skill order is in top 2
  const top2 = skillsWithWinrate.slice(0, 2)
  const playerSkillOrder = skillsWithWinrate.find(s => s.key === participant.skillOrder)
  
  if (!playerSkillOrder) {
    // very unusual skill order, moderate penalty
    return 5
  }
  
  const isInTop2 = top2.some(s => s.key === participant.skillOrder)
  if (isInTop2) return 0
  
  // penalty based on winrate difference
  const topWinrate = top2[0].winrate
  const winrateDiff = topWinrate - playerSkillOrder.winrate
  return Math.min(8, winrateDiff / 5) // max 8 points penalty
}

// calculate build order penalty (item purchase sequence)
// compares first 3 items built against meta item combinations
async function calculateBuildOrderPenalty(participant: ParticipantData, championName: string): Promise<number> {
  if (!participant.patch || !participant.buildOrder) return 0
  
  const supabase = createAdminClient()
  
  // get champion stats with core item combinations
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.core) return 0
  
  const coreData = championStats.data.core as Record<string, { games: number; wins: number }>
  if (Object.keys(coreData).length === 0) return 0
  
  // parse player's build order (first 3 items)
  const playerItems = participant.buildOrder.split(',').map(id => parseInt(id, 10)).slice(0, 3)
  if (playerItems.length < 3) return 0 // not enough items to evaluate
  
  // normalize boots to 10010 for comparison
  const BOOT_IDS = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158]
  const normalizeItem = (id: number) => BOOT_IDS.includes(id) ? 10010 : id
  
  const normalizedPlayerItems = playerItems.map(normalizeItem).sort((a, b) => a - b)
  const playerKey = normalizedPlayerItems.join('_')
  
  // calculate winrates for all combinations
  const combosWithWinrate = Object.entries(coreData)
    .map(([key, data]) => ({
      key,
      games: data.games,
      wins: data.wins,
      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0
    }))
    .filter(c => c.games >= 20)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (combosWithWinrate.length === 0) return 0
  
  // check if player's combination is in top 5
  const top5 = combosWithWinrate.slice(0, 5)
  const playerCombo = combosWithWinrate.find(c => c.key === playerKey)
  
  if (!playerCombo) {
    // unusual build, moderate penalty
    return 5
  }
  
  const isInTop5 = top5.some(c => c.key === playerKey)
  if (isInTop5) return 0
  
  // penalty based on winrate difference
  const topWinrate = top5[0].winrate
  const winrateDiff = topWinrate - playerCombo.winrate
  return Math.min(8, winrateDiff / 5) // max 8 points penalty
}

// detailed breakdown of pig score calculation
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
    .limit(10) // get recent patches for fallback
  
  if (avgError || !championStats || championStats.length === 0) return null
  
  // Find matching patch with 100+ games, or fallback to any patch with 100+ games
  let selectedStats = championStats.find(s => s.patch === participant.patch && (s.data?.games || 0) >= 100)
  if (!selectedStats) {
    // fallback to any patch with sufficient games
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
