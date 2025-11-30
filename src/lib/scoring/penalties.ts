// PIG Score calculator - stat penalties
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getZScore, getStdDev } from '../db/stats-aggregator'

// Target z-score for "perfect" performance (no penalty)
// +1 stddev means top ~16% of players get no penalty
const TARGET_Z_SCORE = 1.0

// Max stddevs below target for full penalty
// At 3 stddevs below target (z=-2), you get 100% penalty
const MAX_STDDEVS_FOR_FULL_PENALTY = 3.0

/*
 * PIG SCORE PENALTY BREAKDOWN
 * ===========================
 * Starting Score: 100
 * 
 * PERFORMANCE STATS (quadratic curve, dynamic weights based on champion relevance):
 * - Damage to Champions:   max 80 pts (weight 1.0)
 * - Total Damage:          max 80 pts (weight 1.0)
 * - Healing/Shielding:     max 40 pts (weight 0-1.0, only if champ heals 300+/min)
 * - CC Time:               max 40 pts (weight 0-1.0, only if champ has 2+ sec/min CC)
 * - Kill Participation:    max 40 pts (quadratic, 90%+ = 0 penalty)
 * 
 * BUILD CHOICES (soft quadratic curve - usually forgiving):
 * - Items (1st, 2nd, 3rd): max 60 pts total (per-item: 0-20 pts based on WR diff)
 * - Keystone Rune:         max 20 pts (soft quadratic)
 * - Summoner Spells:       max 20 pts (soft quadratic)
 * - Skill Max Order:       max 20 pts (soft quadratic)
 * - Build Order (core):    max 20 pts (soft quadratic)
 * 
 * SURVIVAL:
 * - Deaths per Minute:     max 30 pts (optimal: 0.5-0.7 deaths/min)
 * 
 * TOTAL POSSIBLE PENALTY: ~410 pts (but clamped to 100)
 * 
 * QUADRATIC PENALTY CURVE (for performance stats):
 * Uses formula: penalty = maxPenalty * (stdDevsBelowTarget / 3)²
 * Gentle near target, steep for poor performance
 * 
 * | Z-Score | StdDevs Below Target | Penalty % |
 * |---------|---------------------|-----------|
 * | +1.0    | 0.0 (target)        | 0%        |
 * | +0.5    | 0.5                 | 3%        |
 * | 0.0     | 1.0 (mean)          | 11%       |
 * | -0.5    | 1.5                 | 25%       |
 * | -1.0    | 2.0                 | 44%       |
 * | -1.5    | 2.5                 | 69%       |
 * | -2.0    | 3.0                 | 100%      |
 * 
 * SOFT QUADRATIC CURVE (for build choices - keystone/spells/skills/build order):
 * Uses formula: penalty = maxPenalty * (winrateDiff / 10)²
 * Very forgiving - small differences barely matter, only punishes really bad choices
 * 
 * | WR Diff | Penalty (max 10) |
 * |---------|------------------|
 * | 0%      | 0.0              |
 * | 2%      | 0.4              |
 * | 4%      | 1.6              |
 * | 6%      | 3.6              |
 * | 8%      | 6.4              |
 * | 10%+    | 10.0             |
 */

// calculate penalty for a single stat based on z-score distance from target
// The target is mean + TARGET_Z_SCORE * stddev (demanding above-average performance)
// Uses quadratic curve: penalty = maxPenalty * (stdDevsBelowTarget / 3)²
// Gentle near target, punishes poor performance heavily
export function calculateStatPenalty(
  playerValue: number, 
  avgValue: number, 
  maxPenalty: number,
  welfordState?: WelfordState
): number {
  if (avgValue <= 0) return 0
  
  // If we have Welford stats with enough samples, use z-score based penalty
  if (welfordState && welfordState.n >= 30) {
    const stdDev = getStdDev(welfordState)
    
    // If stddev is meaningful (>5% of mean), use z-score
    if (stdDev > welfordState.mean * 0.05) {
      const zScore = getZScore(playerValue, welfordState)
      
      // No penalty if at or above target (mean + TARGET_Z_SCORE * stddev)
      if (zScore >= TARGET_Z_SCORE) return 0
      
      // Calculate how far below target (in stddevs)
      const stdDevsBelowTarget = TARGET_Z_SCORE - zScore
      
      // Quadratic penalty curve: (x / maxStdDevs)²
      // Gentle near target, steep for poor performance
      const normalizedDistance = Math.min(stdDevsBelowTarget / MAX_STDDEVS_FOR_FULL_PENALTY, 1.0)
      const penaltyRatio = normalizedDistance * normalizedDistance
      
      return maxPenalty * penaltyRatio
    }
  }
  
  // Fallback: ratio-based penalty with quadratic curve
  // Target is 115% of average (roughly +1 stddev)
  const targetRatio = 1.15
  const performanceRatio = playerValue / avgValue
  
  if (performanceRatio >= targetRatio) return 0
  
  // Convert to "stddevs below target" equivalent
  // Assume ~15% per stddev, so (targetRatio - performanceRatio) / 0.15
  const equivalentStdDevsBelow = Math.max(0, (targetRatio - performanceRatio) / 0.15)
  const normalizedDistance = Math.min(equivalentStdDevsBelow / MAX_STDDEVS_FOR_FULL_PENALTY, 1.0)
  const penaltyRatio = normalizedDistance * normalizedDistance
  
  return maxPenalty * penaltyRatio
}

// calculate deaths per minute penalty
export function calculateDeathsPerMinutePenalty(deaths: number, gameDurationMinutes: number): number {
  if (gameDurationMinutes <= 0) return 0
  
  const deathsPerMin = deaths / gameDurationMinutes
  
  if (deathsPerMin >= 0.5 && deathsPerMin <= 0.7) return 0
  
  if (deathsPerMin < 0.5) {
    const deficit = 0.5 - deathsPerMin
    return Math.min(30, deficit * 60)
  }
  
  if (deathsPerMin > 0.7) {
    const excess = deathsPerMin - 0.7
    return Math.min(20, excess * 40)
  }
  
  return 0
}

// calculate kill participation penalty
// 90%+ KP = 0 penalty, drops quadratically below that
// KP is calculated as (kills + assists) / team_total_kills
export function calculateKillParticipationPenalty(killParticipation: number): number {
  const MAX_PENALTY = 40
  const TARGET_KP = 0.90 // 90% kill participation is the target
  
  // 90%+ KP = no penalty
  if (killParticipation >= TARGET_KP) return 0
  
  // Quadratic penalty: ((target - actual) / target)^2 * maxPenalty
  // At 0% KP, penalty is maxPenalty
  // At 45% KP (half of target), penalty is 25% of max
  // At 70% KP, penalty is ~5% of max
  const deficit = TARGET_KP - killParticipation
  const normalizedDeficit = deficit / TARGET_KP
  const penalty = MAX_PENALTY * normalizedDeficit * normalizedDeficit
  
  return Math.min(MAX_PENALTY, penalty)
}

interface ParticipantForPenalty {
  patch: string | null
  item0: number
  item1: number
  item2: number
  perk0: number
  spell1?: number
  spell2?: number
  skillOrder?: string
  buildOrder?: string
}

// Item penalty detail for breakdown display
export interface ItemPenaltyDetail {
  slot: number
  itemId: number
  itemName?: string
  penalty: number
  reason: 'optimal' | 'suboptimal' | 'off-meta' | 'unknown' | 'boots'
  playerWinrate?: number
  topWinrate?: number
  isInTop5: boolean
}

// calculate item build penalty with detailed breakdown
export async function calculateItemPenaltyWithDetails(
  participant: ParticipantForPenalty, 
  championName: string
): Promise<{ totalPenalty: number; details: ItemPenaltyDetail[] }> {
  const details: ItemPenaltyDetail[] = []
  
  if (!participant.patch) return { totalPenalty: 0, details }
  
  const supabase = createAdminClient()
  let totalPenalty = 0
  const items = [participant.item0, participant.item1, participant.item2]
  
  const { data: itemStats } = await supabase
    .from('item_stats_by_patch')
    .select('item_id, slot, games, wins, winrate')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
  
  if (!itemStats || itemStats.length === 0) return { totalPenalty: 0, details }
  
  const { data: championData } = await supabase
    .from('champion_stats_incremental')
    .select('games')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  const totalGames = championData?.games || 1
  const bootsIds = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
  
  for (let slot = 0; slot < 3; slot++) {
    const playerItemId = items[slot]
    if (!playerItemId || playerItemId === 0) continue
    
    // Skip boots - no penalty
    if (bootsIds.includes(playerItemId)) {
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 0,
        reason: 'boots',
        isInTop5: true
      })
      continue
    }
    
    const slotItems = itemStats.filter(i => i.slot === slot)
    if (slotItems.length === 0) {
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 0,
        reason: 'unknown',
        isInTop5: false
      })
      continue
    }
    
    const itemsWithPriority = slotItems
      .map(item => {
        const pickrate = (item.games / totalGames) * 100
        const priority = item.winrate
        return { ...item, pickrate, priority }
      })
      .filter(item => item.games >= 30)
      .sort((a, b) => b.priority - a.priority)
    
    if (itemsWithPriority.length === 0) {
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 0,
        reason: 'unknown',
        isInTop5: false
      })
      continue
    }
    
    const top5 = itemsWithPriority.slice(0, 5)
    const playerItem = itemsWithPriority.find(i => i.item_id === playerItemId)
    
    if (!playerItem) {
      // Item not in data - small penalty
      totalPenalty += 2
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 2,
        reason: 'off-meta',
        topWinrate: top5[0]?.priority,
        isInTop5: false
      })
      continue
    }
    
    const isInTop5 = top5.some(i => i.item_id === playerItemId)
    if (isInTop5) {
      // Optimal item choice
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 0,
        reason: 'optimal',
        playerWinrate: playerItem.priority,
        topWinrate: top5[0].priority,
        isInTop5: true
      })
      continue
    }
    
    // Suboptimal but tracked item
    const topPriority = top5[0].priority
    const priorityDiff = topPriority - playerItem.priority
    const penaltyAmount = Math.min(6, priorityDiff / 25)
    totalPenalty += penaltyAmount
    
    details.push({
      slot,
      itemId: playerItemId,
      penalty: penaltyAmount,
      reason: 'suboptimal',
      playerWinrate: playerItem.priority,
      topWinrate: topPriority,
      isInTop5: false
    })
  }
  
  return { totalPenalty: Math.min(60, totalPenalty), details }
}

// Simple version for backward compatibility
export async function calculateItemPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  const result = await calculateItemPenaltyWithDetails(participant, championName)
  return result.totalPenalty
}

// calculate keystone penalty
export async function calculateKeystonePenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.perk0) return 0
  
  const supabase = createAdminClient()
  
  const { data: runeStats } = await supabase
    .from('rune_stats_by_patch')
    .select('rune_id, games, wins, winrate')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .eq('slot', 0)
  
  if (!runeStats || runeStats.length === 0) return 0
  
  const totalGames = runeStats.reduce((sum, r) => sum + r.games, 0)
  const runesWithPriority = runeStats
    .map(rune => {
      const pickrate = (rune.games / totalGames) * 100
      const priority = rune.winrate
      return { ...rune, pickrate, priority }
    })
    .filter(rune => rune.games >= 50)
    .sort((a, b) => b.priority - a.priority)
  
  if (runesWithPriority.length === 0) return 0
  
  const top5 = runesWithPriority.slice(0, 5)
  const playerRune = runesWithPriority.find(r => r.rune_id === participant.perk0)
  
  if (!playerRune) return 10
  
  const isInTop5 = top5.some(r => r.rune_id === participant.perk0)
  if (isInTop5) return 0
  
  const topPriority = top5[0].priority
  const priorityDiff = topPriority - playerRune.priority
  // Soft quadratic: (diff/maxDiff)² * maxPenalty
  // Max diff ~10% winrate difference for full penalty
  const normalizedDiff = Math.min(priorityDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// calculate summoner spells penalty
export async function calculateSpellsPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.spell1 || !participant.spell2) return 0
  
  const supabase = createAdminClient()
  
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
  
  const playerSpells = [participant.spell1, participant.spell2].sort((a, b) => a - b)
  const playerKey = `${playerSpells[0]}_${playerSpells[1]}`
  
  const spellsWithWinrate = spellsEntries
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0
    }))
    .filter(s => s.games >= 30)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (spellsWithWinrate.length === 0) return 0
  
  const top3 = spellsWithWinrate.slice(0, 3)
  const playerSpellCombo = spellsWithWinrate.find(s => s.key === playerKey)
  
  if (!playerSpellCombo) return 4
  
  const isInTop3 = top3.some(s => s.key === playerKey)
  if (isInTop3) return 0
  
  const topWinrate = top3[0].winrate
  const winrateDiff = topWinrate - playerSpellCombo.winrate
  // Soft quadratic: (diff/maxDiff)² * maxPenalty
  // Max diff ~10% winrate difference for full penalty
  const normalizedDiff = Math.min(winrateDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// calculate skill max order penalty
export async function calculateSkillOrderPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.skillOrder) return 0
  
  const supabase = createAdminClient()
  
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
  
  const skillsWithWinrate = skillsEntries
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0
    }))
    .filter(s => s.games >= 20)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (skillsWithWinrate.length === 0) return 0
  
  const top2 = skillsWithWinrate.slice(0, 2)
  const playerSkillOrder = skillsWithWinrate.find(s => s.key === participant.skillOrder)
  
  if (!playerSkillOrder) return 10
  
  const isInTop2 = top2.some(s => s.key === participant.skillOrder)
  if (isInTop2) return 0
  
  const topWinrate = top2[0].winrate
  const winrateDiff = topWinrate - playerSkillOrder.winrate
  // Soft quadratic: (diff/maxDiff)² * maxPenalty
  // Max diff ~10% winrate difference for full penalty
  const normalizedDiff = Math.min(winrateDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// calculate build order penalty
export async function calculateBuildOrderPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.buildOrder) return 0
  
  const supabase = createAdminClient()
  
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.core) return 0
  
  const coreData = championStats.data.core as Record<string, { games: number; wins: number }>
  if (Object.keys(coreData).length === 0) return 0
  
  const playerItems = participant.buildOrder.split(',').map(id => parseInt(id, 10)).slice(0, 3)
  if (playerItems.length < 3) return 0
  
  const BOOT_IDS = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158]
  const normalizeItem = (id: number) => BOOT_IDS.includes(id) ? 10010 : id
  
  const normalizedPlayerItems = playerItems.map(normalizeItem).sort((a, b) => a - b)
  const playerKey = normalizedPlayerItems.join('_')
  
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
  
  const top5 = combosWithWinrate.slice(0, 5)
  const playerCombo = combosWithWinrate.find(c => c.key === playerKey)
  
  if (!playerCombo) return 10
  
  const isInTop5 = top5.some(c => c.key === playerKey)
  if (isInTop5) return 0
  
  const topWinrate = top5[0].winrate
  const winrateDiff = topWinrate - playerCombo.winrate
  // Soft quadratic: (diff/maxDiff)² * maxPenalty
  // Max diff ~10% winrate difference for full penalty
  const normalizedDiff = Math.min(winrateDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// ============================================================================
// OPTIMIZED BATCH CALCULATION - runs all DB queries in parallel
// ============================================================================

export interface AllPenaltiesResult {
  itemPenalty: number
  itemDetails: ItemPenaltyDetail[]
  keystonePenalty: number
  spellsPenalty: number
  skillOrderPenalty: number
  buildOrderPenalty: number
}

// Calculate all build/choice penalties in one batch with parallel DB queries
// This is MUCH faster than calling each function individually (1 round trip vs 5+)
export async function calculateAllBuildPenalties(
  participant: ParticipantForPenalty, 
  championName: string
): Promise<AllPenaltiesResult> {
  if (!participant.patch) {
    return {
      itemPenalty: 0,
      itemDetails: [],
      keystonePenalty: 0,
      spellsPenalty: 0,
      skillOrderPenalty: 0,
      buildOrderPenalty: 0
    }
  }
  
  const supabase = createAdminClient()
  
  // Run ALL DB queries in parallel - this is the key optimization
  const [itemStatsResult, championStatsIncResult, runeStatsResult, championStatsResult] = await Promise.all([
    // For item penalty
    supabase
      .from('item_stats_by_patch')
      .select('item_id, slot, games, wins, winrate')
      .eq('champion_name', championName)
      .eq('patch', participant.patch),
    
    // For item penalty (total games)
    supabase
      .from('champion_stats_incremental')
      .select('games')
      .eq('champion_name', championName)
      .eq('patch', participant.patch)
      .maybeSingle(),
    
    // For keystone penalty
    supabase
      .from('rune_stats_by_patch')
      .select('rune_id, games, wins, winrate')
      .eq('champion_name', championName)
      .eq('patch', participant.patch)
      .eq('slot', 0),
    
    // For spells, skill order, and build order penalties (single query!)
    supabase
      .from('champion_stats')
      .select('data')
      .eq('champion_name', championName)
      .eq('patch', participant.patch)
      .maybeSingle()
  ])
  
  // Calculate item penalty from pre-fetched data
  const itemResult = calculateItemPenaltyFromData(
    participant,
    itemStatsResult.data || [],
    championStatsIncResult.data?.games || 1
  )
  
  // Calculate keystone penalty from pre-fetched data
  const keystonePenalty = calculateKeystonePenaltyFromData(
    participant,
    runeStatsResult.data || []
  )
  
  // Calculate spells, skill order, build order from shared champion_stats data
  const championData = championStatsResult.data?.data
  const spellsPenalty = calculateSpellsPenaltyFromData(participant, championData)
  const skillOrderPenalty = calculateSkillOrderPenaltyFromData(participant, championData)
  const buildOrderPenalty = calculateBuildOrderPenaltyFromData(participant, championData)
  
  return {
    itemPenalty: itemResult.totalPenalty,
    itemDetails: itemResult.details,
    keystonePenalty,
    spellsPenalty,
    skillOrderPenalty,
    buildOrderPenalty
  }
}

// Pure calculation functions that work with pre-fetched data
function calculateItemPenaltyFromData(
  participant: ParticipantForPenalty,
  itemStats: Array<{ item_id: number; slot: number; games: number; wins: number; winrate: number }>,
  totalGames: number
): { totalPenalty: number; details: ItemPenaltyDetail[] } {
  const details: ItemPenaltyDetail[] = []
  let totalPenalty = 0
  const items = [participant.item0, participant.item1, participant.item2]
  
  if (itemStats.length === 0) return { totalPenalty: 0, details }
  
  const bootsIds = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
  
  for (let slot = 0; slot < 3; slot++) {
    const playerItemId = items[slot]
    if (!playerItemId || playerItemId === 0) continue
    
    if (bootsIds.includes(playerItemId)) {
      details.push({ slot, itemId: playerItemId, penalty: 0, reason: 'boots', isInTop5: true })
      continue
    }
    
    const slotItems = itemStats.filter(i => i.slot === slot)
    if (slotItems.length === 0) {
      details.push({ slot, itemId: playerItemId, penalty: 0, reason: 'unknown', isInTop5: false })
      continue
    }
    
    const itemsWithPriority = slotItems
      .map(item => ({ ...item, pickrate: (item.games / totalGames) * 100, priority: item.winrate }))
      .filter(item => item.games >= 30)
      .sort((a, b) => b.priority - a.priority)
    
    if (itemsWithPriority.length === 0) {
      details.push({ slot, itemId: playerItemId, penalty: 0, reason: 'unknown', isInTop5: false })
      continue
    }
    
    const top5 = itemsWithPriority.slice(0, 5)
    const playerItem = itemsWithPriority.find(i => i.item_id === playerItemId)
    
    if (!playerItem) {
      totalPenalty += 2
      details.push({ slot, itemId: playerItemId, penalty: 2, reason: 'off-meta', topWinrate: top5[0]?.priority, isInTop5: false })
      continue
    }
    
    const isInTop5 = top5.some(i => i.item_id === playerItemId)
    if (isInTop5) {
      details.push({ slot, itemId: playerItemId, penalty: 0, reason: 'optimal', playerWinrate: playerItem.priority, topWinrate: top5[0].priority, isInTop5: true })
      continue
    }
    
    const topPriority = top5[0].priority
    const priorityDiff = topPriority - playerItem.priority
    const penaltyAmount = Math.min(6, priorityDiff / 25)
    totalPenalty += penaltyAmount
    
    details.push({ slot, itemId: playerItemId, penalty: penaltyAmount, reason: 'suboptimal', playerWinrate: playerItem.priority, topWinrate: topPriority, isInTop5: false })
  }
  
  return { totalPenalty: Math.min(60, totalPenalty), details }
}

function calculateKeystonePenaltyFromData(
  participant: ParticipantForPenalty,
  runeStats: Array<{ rune_id: number; games: number; wins: number; winrate: number }>
): number {
  if (!participant.perk0 || runeStats.length === 0) return 0
  
  const totalGames = runeStats.reduce((sum, r) => sum + r.games, 0)
  const runesWithPriority = runeStats
    .map(rune => ({ ...rune, pickrate: (rune.games / totalGames) * 100, priority: rune.winrate }))
    .filter(rune => rune.games >= 50)
    .sort((a, b) => b.priority - a.priority)
  
  if (runesWithPriority.length === 0) return 0
  
  const top5 = runesWithPriority.slice(0, 5)
  const playerRune = runesWithPriority.find(r => r.rune_id === participant.perk0)
  
  if (!playerRune) return 10
  if (top5.some(r => r.rune_id === participant.perk0)) return 0
  
  const priorityDiff = top5[0].priority - playerRune.priority
  const normalizedDiff = Math.min(priorityDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateSpellsPenaltyFromData(participant: ParticipantForPenalty, championData: any): number {
  if (!participant.spell1 || !participant.spell2 || !championData?.spells) return 0
  
  const spellsObj = championData.spells as Record<string, { games: number; wins: number }>
  const spellsEntries = Object.entries(spellsObj)
  if (spellsEntries.length === 0) return 0
  
  const playerSpells = [participant.spell1, participant.spell2].sort((a, b) => a - b)
  const playerKey = `${playerSpells[0]}_${playerSpells[1]}`
  
  const spellsWithWinrate = spellsEntries
    .map(([key, value]) => ({ key, games: value.games, wins: value.wins, winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0 }))
    .filter(s => s.games >= 30)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (spellsWithWinrate.length === 0) return 0
  
  const top3 = spellsWithWinrate.slice(0, 3)
  const playerSpellCombo = spellsWithWinrate.find(s => s.key === playerKey)
  
  if (!playerSpellCombo) return 4
  if (top3.some(s => s.key === playerKey)) return 0
  
  const winrateDiff = top3[0].winrate - playerSpellCombo.winrate
  const normalizedDiff = Math.min(winrateDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateSkillOrderPenaltyFromData(participant: ParticipantForPenalty, championData: any): number {
  if (!participant.skillOrder || !championData?.skills) return 0
  
  const skillsObj = championData.skills as Record<string, { games: number; wins: number }>
  const skillsEntries = Object.entries(skillsObj)
  if (skillsEntries.length === 0) return 0
  
  const skillsWithWinrate = skillsEntries
    .map(([key, value]) => ({ key, games: value.games, wins: value.wins, winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0 }))
    .filter(s => s.games >= 20)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (skillsWithWinrate.length === 0) return 0
  
  const top2 = skillsWithWinrate.slice(0, 2)
  const playerSkillOrder = skillsWithWinrate.find(s => s.key === participant.skillOrder)
  
  if (!playerSkillOrder) return 10
  if (top2.some(s => s.key === participant.skillOrder)) return 0
  
  const winrateDiff = top2[0].winrate - playerSkillOrder.winrate
  const normalizedDiff = Math.min(winrateDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateBuildOrderPenaltyFromData(participant: ParticipantForPenalty, championData: any): number {
  if (!participant.buildOrder || !championData?.core) return 0
  
  const coreData = championData.core as Record<string, { games: number; wins: number }>
  if (Object.keys(coreData).length === 0) return 0
  
  const playerItems = participant.buildOrder.split(',').map(id => parseInt(id, 10)).slice(0, 3)
  if (playerItems.length < 3) return 0
  
  const BOOT_IDS = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158]
  const normalizeItem = (id: number) => BOOT_IDS.includes(id) ? 10010 : id
  
  const normalizedPlayerItems = playerItems.map(normalizeItem).sort((a, b) => a - b)
  const playerKey = normalizedPlayerItems.join('_')
  
  const combosWithWinrate = Object.entries(coreData)
    .map(([key, data]) => ({ key, games: data.games, wins: data.wins, winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0 }))
    .filter(c => c.games >= 20)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (combosWithWinrate.length === 0) return 0
  
  const top5 = combosWithWinrate.slice(0, 5)
  const playerCombo = combosWithWinrate.find(c => c.key === playerKey)
  
  if (!playerCombo) return 10
  if (top5.some(c => c.key === playerKey)) return 0
  
  const winrateDiff = top5[0].winrate - playerCombo.winrate
  const normalizedDiff = Math.min(winrateDiff / 10, 1.0)
  return 20 * normalizedDiff * normalizedDiff
}
