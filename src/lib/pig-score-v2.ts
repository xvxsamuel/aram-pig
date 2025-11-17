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
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  perk0: number // keystone
  patch: string | null
}

// calculate pig score based on performance vs 30d champion averages
export async function calculatePigScore(participant: ParticipantData): Promise<number | null> {
  const supabase = createAdminClient()
  let score = 100 // start at perfect score
  
  const championName = participant.championName.toLowerCase()
  const gameDurationMinutes = participant.game_duration / 60
  
  if (gameDurationMinutes <= 0) return null // invalid game duration
  
  // get 30d champion averages
  const { data: championAvg } = await supabase
    .from('champion_stats_windowed')
    .select('*')
    .eq('champion_name', championName)
    .eq('window_days', 30)
    .maybeSingle()
  
  if (!championAvg || championAvg.games < 10) {
    // not enough data for this champion, return null
    return null
  }
  
  // calculate player's per-minute stats
  const playerStats = {
    damageToChampionsPerMin: participant.damage_dealt_to_champions / gameDurationMinutes,
    totalDamagePerMin: participant.total_damage_dealt / gameDurationMinutes,
    healingShieldingPerMin: (participant.total_heals_on_teammates + participant.total_damage_shielded_on_teammates) / gameDurationMinutes,
    ccTimePerMin: participant.time_ccing_others / gameDurationMinutes,
  }
  
  // champion averages (already per-game, need to convert to per-minute)
  // note: avg_* columns in windowed view are per-game totals, not per-minute
  // we need to estimate average game duration - use 18 minutes as ARAM average
  const estimatedAvgGameDuration = 18
  const championAvgPerMin = {
    damageToChampionsPerMin: (championAvg.avg_damage_to_champions || 0) / estimatedAvgGameDuration,
    totalDamagePerMin: (championAvg.avg_total_damage_dealt || 0) / estimatedAvgGameDuration,
    healingShieldingPerMin: ((championAvg.avg_heals_on_teammates || 0) + (championAvg.avg_shielding_on_teammates || 0)) / estimatedAvgGameDuration,
    ccTimePerMin: (championAvg.avg_time_cc_dealt || 0) / estimatedAvgGameDuration,
  }
  
  // calculate performance penalties
  score -= calculateStatPenalty(playerStats.damageToChampionsPerMin, championAvgPerMin.damageToChampionsPerMin, 20)
  score -= calculateStatPenalty(playerStats.totalDamagePerMin, championAvgPerMin.totalDamagePerMin, 20)
  score -= calculateStatPenalty(playerStats.healingShieldingPerMin, championAvgPerMin.healingShieldingPerMin, 20)
  score -= calculateStatPenalty(playerStats.ccTimePerMin, championAvgPerMin.ccTimePerMin, 20)
  
  // calculate item build penalty
  const itemPenalty = await calculateItemPenalty(participant, championName)
  score -= itemPenalty
  
  // calculate keystone penalty
  const keystonePenalty = await calculateKeystonePenalty(participant, championName)
  score -= keystonePenalty
  
  // clamp score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)))
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
    .from('champion_stats_by_patch')
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
