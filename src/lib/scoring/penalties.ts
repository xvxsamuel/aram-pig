// PIG Score calculator - percentile-based scoring
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getZScore, getStdDev } from '../db/stats-aggregator'

/*
 * PIG SCORE - PERCENTILE-BASED SYSTEM
 * ====================================
 *
 * Instead of penalties, we calculate percentile scores for each metric.
 * The system is SKEWED so that "average" performance gives ~70, not 50.
 *
 * TARGET: 84th percentile (z = +1, mean + 1σ) = Score 100
 *
 * PERCENTILE TO SCORE MAPPING (skewed toward high performance):
 * | Percentile | Z-Score | Score |
 * |------------|---------|-------|
 * | 99th       | +2.33   | 100   | (capped)
 * | 84th       | +1.0    | 100   | TARGET - top performers
 * | 70th       | +0.5    | 85    |
 * | 50th       | 0.0     | 70    | AVERAGE players
 * | 30th       | -0.5    | 55    |
 * | 16th       | -1.0    | 40    |
 * | 2nd        | -2.0    | 10    |
 * | 0th        | -3.0    | 0     | (capped)
 *
 * Formula: score = 70 + (zScore * 30), clamped to [0, 100]
 * - At z=+1 (target): 70 + 30 = 100
 * - At z=0 (mean): 70 + 0 = 70
 * - At z=-1: 70 - 30 = 40
 * - At z=-2.33: 70 - 70 = 0
 *
 * COMPONENT WEIGHTS:
 * - Performance Stats: 60% (damage, healing, CC, etc.)
 * - Build Quality: 20% (items, runes, spells, skills)
 * - KDA Quality: 20% (deaths, kill participation, kill/death quality)
 *
 * Each component is a weighted average of its sub-metrics, producing a 0-100 score.
 * Final score = weighted average of all components.
 */

// Convert z-score to a 0-100 score with target at z=+1
// Formula: score = 70 + (zScore * 30), clamped to [0, 100]
export function zScoreToScore(zScore: number): number {
  // 70 is the "average" score (z=0)
  // Each standard deviation is worth 30 points
  // Target (z=+1) gives 100, z=-2.33 gives 0
  const score = 70 + zScore * 30
  return Math.max(0, Math.min(100, score))
}

// Convert a percentile (0-100) to a score (0-100) with skewed mapping
// Target: 84th percentile = 100, 50th percentile = 70
export function percentileToScore(percentile: number): number {
  // Convert percentile to approximate z-score using inverse normal approximation
  // This is a simplified approximation that works well for typical ranges
  const p = Math.max(0.001, Math.min(0.999, percentile / 100))

  // Approximation of inverse normal CDF (good enough for our purposes)
  // Using Abramowitz and Stegun approximation
  const sign = p < 0.5 ? -1 : 1
  const pAdj = p < 0.5 ? p : 1 - p
  const t = Math.sqrt(-2 * Math.log(pAdj))
  const c0 = 2.515517,
    c1 = 0.802853,
    c2 = 0.010328
  const d1 = 1.432788,
    d2 = 0.189269,
    d3 = 0.001308
  const zApprox = sign * (t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t))

  return zScoreToScore(zApprox)
}

// Calculate a percentile score for a stat using Welford stats
// Returns 0-100 score where 70 = average, 100 = target (84th percentile)
export function calculateStatScore(playerValue: number, avgValue: number, welfordState?: WelfordState): number {
  if (avgValue <= 0) return 70 // Default to average if no data

  // If we have Welford stats with enough samples, use z-score
  if (welfordState && welfordState.n >= 30) {
    const stdDev = getStdDev(welfordState)

    // If stddev is meaningful (>5% of mean), use z-score
    if (stdDev > welfordState.mean * 0.05) {
      const zScore = getZScore(playerValue, welfordState)
      return zScoreToScore(zScore)
    }
  }

  // Fallback: ratio-based score
  // Assume 15% of mean ≈ 1 standard deviation
  const performanceRatio = playerValue / avgValue
  // Convert ratio to equivalent z-score: (ratio - 1) / 0.15
  const equivalentZScore = (performanceRatio - 1) / 0.15
  return zScoreToScore(equivalentZScore)
}

// Legacy penalty function - converts percentile score to penalty for backward compatibility
// This allows gradual migration without breaking existing code
export function calculateStatPenalty(
  playerValue: number,
  avgValue: number,
  maxPenalty: number,
  welfordState?: WelfordState
): number {
  const score = calculateStatScore(playerValue, avgValue, welfordState)
  // Convert score (0-100) to penalty (0-maxPenalty)
  // Score 100 = 0 penalty, Score 0 = maxPenalty
  // Score 70 (average) = 30% of maxPenalty
  const penaltyRatio = (100 - score) / 100
  return maxPenalty * penaltyRatio
}

// Calculate deaths/minute score (0-100)
// Optimal: 0.5-0.7 deaths/min = 100
// Too few deaths (not fighting): penalized
// Too many deaths: penalized more harshly
export function calculateDeathsScore(deaths: number, gameDurationMinutes: number): number {
  if (gameDurationMinutes <= 0) return 70

  const deathsPerMin = deaths / gameDurationMinutes

  // Optimal range: 0.5-0.7 deaths/min = score 100
  if (deathsPerMin >= 0.5 && deathsPerMin <= 0.7) return 100

  // Too few deaths (not participating enough)
  // 0 deaths/min = score 70 (just average, not bad)
  if (deathsPerMin < 0.5) {
    const deficit = 0.5 - deathsPerMin
    // 0 deaths = 70, linear drop
    return Math.max(70, 100 - deficit * 60)
  }

  // Too many deaths - penalize more
  // 1.5 deaths/min = score ~40
  // 2.0 deaths/min = score ~20
  const excess = deathsPerMin - 0.7
  return Math.max(0, 100 - excess * 75)
}

// Legacy penalty function for backward compatibility
export function calculateDeathsPerMinutePenalty(deaths: number, gameDurationMinutes: number): number {
  const score = calculateDeathsScore(deaths, gameDurationMinutes)
  // Convert score to penalty: score 100 = 0 penalty, score 0 = 30 penalty
  return (100 - score) * 0.3
}

// Calculate kill participation score (0-100)
// 90%+ KP = 100, scales down from there
export function calculateKillParticipationScore(killParticipation: number): number {
  const TARGET_KP = 0.9

  if (killParticipation >= TARGET_KP) return 100

  // Linear scale from 0 to target
  // 0% KP = 0 score, 90% KP = 100 score
  // 70% KP = ~78 score
  return Math.max(0, (killParticipation / TARGET_KP) * 100)
}

// Legacy penalty function for backward compatibility
export function calculateKillParticipationPenalty(killParticipation: number): number {
  const score = calculateKillParticipationScore(killParticipation)
  // Convert score to penalty: score 100 = 0 penalty, score 0 = 40 penalty
  return (100 - score) * 0.4
}

// Calculate build choice score (0-100) from winrate difference
// Used for items, runes, spells, skills
// Top choices = 100, worse choices scale down based on WR diff
export function calculateBuildChoiceScore(playerWinrate: number | null, topWinrate: number, isInTopN: boolean): number {
  // Top choices get perfect score
  if (isInTopN) return 100

  // Unknown/off-meta = 70 (average)
  if (playerWinrate === null) return 70

  // Scale based on winrate difference
  // 0% diff = 100, 5% diff = 70, 10%+ diff = 40
  const winrateDiff = topWinrate - playerWinrate
  return Math.max(40, 100 - winrateDiff * 6)
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
        isInTop5: true,
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
        isInTop5: false,
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
        isInTop5: false,
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
        isInTop5: false,
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
        isInTop5: true,
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
      isInTop5: false,
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
export async function calculateKeystonePenalty(
  participant: ParticipantForPenalty,
  championName: string
): Promise<number> {
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
export async function calculateSpellsPenalty(
  participant: ParticipantForPenalty,
  championName: string
): Promise<number> {
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
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
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
export async function calculateSkillOrderPenalty(
  participant: ParticipantForPenalty,
  championName: string
): Promise<number> {
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
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
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
export async function calculateBuildOrderPenalty(
  participant: ParticipantForPenalty,
  championName: string
): Promise<number> {
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

  const playerItems = participant.buildOrder
    .split(',')
    .map(id => parseInt(id, 10))
    .slice(0, 3)
  if (playerItems.length < 3) return 0

  const BOOT_IDS = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158]
  const normalizeItem = (id: number) => (BOOT_IDS.includes(id) ? 10010 : id)

  const normalizedPlayerItems = playerItems.map(normalizeItem).sort((a, b) => a - b)
  const playerKey = normalizedPlayerItems.join('_')

  const combosWithWinrate = Object.entries(coreData)
    .map(([key, data]) => ({
      key,
      games: data.games,
      wins: data.wins,
      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
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
      buildOrderPenalty: 0,
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
      .maybeSingle(),
  ])

  // Calculate item penalty from pre-fetched data
  const itemResult = calculateItemPenaltyFromData(
    participant,
    itemStatsResult.data || [],
    championStatsIncResult.data?.games || 1
  )

  // Calculate keystone penalty from pre-fetched data
  const keystonePenalty = calculateKeystonePenaltyFromData(participant, runeStatsResult.data || [])

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
    buildOrderPenalty,
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
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 2,
        reason: 'off-meta',
        topWinrate: top5[0]?.priority,
        isInTop5: false,
      })
      continue
    }

    const isInTop5 = top5.some(i => i.item_id === playerItemId)
    if (isInTop5) {
      details.push({
        slot,
        itemId: playerItemId,
        penalty: 0,
        reason: 'optimal',
        playerWinrate: playerItem.priority,
        topWinrate: top5[0].priority,
        isInTop5: true,
      })
      continue
    }

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
      isInTop5: false,
    })
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
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
    }))
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
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
    }))
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

  const playerItems = participant.buildOrder
    .split(',')
    .map(id => parseInt(id, 10))
    .slice(0, 3)
  if (playerItems.length < 3) return 0

  const BOOT_IDS = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158]
  const normalizeItem = (id: number) => (BOOT_IDS.includes(id) ? 10010 : id)

  const normalizedPlayerItems = playerItems.map(normalizeItem).sort((a, b) => a - b)
  const playerKey = normalizedPlayerItems.join('_')

  const combosWithWinrate = Object.entries(coreData)
    .map(([key, data]) => ({
      key,
      games: data.games,
      wins: data.wins,
      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
    }))
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
