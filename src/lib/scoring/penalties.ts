// PIG Score calculator - percentile-based scoring
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getZScore, getStdDev } from '../db/stats-aggregator'

/*
 * PIG SCORE - PERCENTILE-BASED SYSTEM
 * ====================================
 *
 * Instead of penalties, we calculate percentile scores for each metric.
 * Average performance gives 50 (true middle), excellence gives 100.
 *
 * TARGET: 98th percentile (z = +2, mean + 2σ) = Score 100
 *
 * PERCENTILE TO SCORE MAPPING:
 * | Percentile | Z-Score | Score |
 * |------------|---------|-------|
 * | 98th       | +2.0    | 100   | (capped) - TRUE excellence
 * | 84th       | +1.0    | 75    | Good performers
 * | 70th       | +0.5    | 62.5  |
 * | 50th       | 0.0     | 50    | AVERAGE players
 * | 30th       | -0.5    | 37.5  |
 * | 16th       | -1.0    | 25    |
 * | 2nd        | -2.0    | 0     | (capped)
 *
 * Formula: score = 50 + (zScore * 25), clamped to [0, 100]
 * - At z=+2 (excellent): 50 + 50 = 100
 * - At z=+1 (good): 50 + 25 = 75
 * - At z=0 (mean): 50 + 0 = 50
 * - At z=-1: 50 - 25 = 25
 * - At z=-2: 50 - 50 = 0
 *
 * COMPONENT WEIGHTS:
 * - Performance Stats: 50% (damage, healing, CC, etc.)
 * - Build Quality: 20% (items, runes, spells, skills)
 * - Timeline Quality: 30% (kill/death quality from position/trades)
 *
 * Each component is a weighted average of its sub-metrics, producing a 0-100 score.
 * Final score = weighted average of all components.
 */

// Convert z-score to a 0-100 score with target at z=+2
// Formula: score = 50 + (zScore * 25), clamped to [0, 100]
export function zScoreToScore(zScore: number): number {
  // 50 is the "average" score (z=0)
  // Each standard deviation is worth 25 points
  // Excellent (z=+2) gives 100, z=-2 gives 0
  const score = 50 + zScore * 25
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
// Returns 0-100 score where 50 = average, 100 = excellent (98th percentile)
export function calculateStatScore(playerValue: number, avgValue: number, welfordState?: WelfordState): number {
  if (avgValue <= 0) return 50 // Default to average if no data

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
  // Score 50 (average) = 50% of maxPenalty
  const penaltyRatio = (100 - score) / 100
  return maxPenalty * penaltyRatio
}

// Calculate deaths/minute score (0-100)
// Optimal: 0.4-0.6 deaths/min = 80 (good but not perfect)
// Very low deaths: 60 (safe play)
// Too many deaths: penalized harshly
export function calculateDeathsScore(deaths: number, gameDurationMinutes: number): number {
  if (gameDurationMinutes <= 0) return 50

  const deathsPerMin = deaths / gameDurationMinutes

  // Optimal range: 0.4-0.6 deaths/min = score 80 (good, not perfect)
  if (deathsPerMin >= 0.4 && deathsPerMin <= 0.6) return 80

  // Very few deaths (safe play, not necessarily bad)
  // 0 deaths/min = score 60
  if (deathsPerMin < 0.4) {
    const deficit = 0.4 - deathsPerMin
    return Math.max(60, 80 - deficit * 50)
  }

  // Too many deaths - penalize more harshly
  // 1.0 deaths/min = score ~50
  // 1.5 deaths/min = score ~20
  // 2.0 deaths/min = score ~0
  const excess = deathsPerMin - 0.6
  return Math.max(0, 80 - excess * 60)
}

// Legacy penalty function for backward compatibility
export function calculateDeathsPerMinutePenalty(deaths: number, gameDurationMinutes: number): number {
  const score = calculateDeathsScore(deaths, gameDurationMinutes)
  // Convert score to penalty: score 100 = 0 penalty, score 0 = 30 penalty
  return (100 - score) * 0.3
}

// Calculate kill participation score (0-100)
// 95%+ KP = 90, scales down from there
export function calculateKillParticipationScore(killParticipation: number): number {
  const EXCELLENT_KP = 0.95
  const GOOD_KP = 0.8

  if (killParticipation >= EXCELLENT_KP) return 90
  if (killParticipation >= GOOD_KP) {
    // 80% = 70, 95% = 90
    return 70 + ((killParticipation - GOOD_KP) / (EXCELLENT_KP - GOOD_KP)) * 20
  }

  // Linear scale from 0 to good
  // 0% KP = 0 score, 80% KP = 70 score
  return Math.max(0, (killParticipation / GOOD_KP) * 70)
}

// Legacy penalty function for backward compatibility
export function calculateKillParticipationPenalty(killParticipation: number): number {
  const score = calculateKillParticipationScore(killParticipation)
  // Convert score to penalty: score 100 = 0 penalty, score 0 = 40 penalty
  return (100 - score) * 0.4
}

// Calculate build choice score (0-100) based on rank position
// Uses exponential decay: top choice scores high, drops off faster
// Rank 1 = 90, Rank 2 = 74, Rank 3 = 61, Rank 5 = 41, Rank 10 = 14
export function calculateRankBasedScore(rank: number, _totalOptions: number): number {
  if (rank <= 0) return 90
  // Exponential decay with decay constant of 5 (faster decay)
  // score = 90 * e^(-(rank-1)/5)
  const score = 90 * Math.exp(-(rank - 1) / 5)
  return Math.max(0, Math.round(score))
}

// Legacy function for backward compatibility
export function calculateBuildChoiceScore(playerWinrate: number | null, topWinrate: number, isInTopN: boolean): number {
  // Top choices get perfect score
  if (isInTopN) return 100

  // Unknown/off-meta = 50 (below average)
  if (playerWinrate === null) return 50

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

    // Include all items with at least 10 games for ranking
    // Items with 30+ games get full confidence, 10-29 games get partial confidence
    const MIN_GAMES_THRESHOLD = 10
    const FULL_CONFIDENCE_GAMES = 30

    const itemsWithPriority = slotItems
      .map(item => {
        const pickrate = (item.games / totalGames) * 100
        const priority = item.winrate
        // Confidence scales from 0.5 at 10 games to 1.0 at 30+ games
        const confidence = Math.min(
          1,
          0.5 + (0.5 * (item.games - MIN_GAMES_THRESHOLD)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES_THRESHOLD)
        )
        return { ...item, pickrate, priority, confidence }
      })
      .filter(item => item.games >= MIN_GAMES_THRESHOLD)
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

    // Find player's item - first check in ranked list
    const playerItemIndex = itemsWithPriority.findIndex(i => i.item_id === playerItemId)
    let playerItem = playerItemIndex >= 0 ? itemsWithPriority[playerItemIndex] : null
    let playerRank = playerItemIndex >= 0 ? playerItemIndex + 1 : -1

    // If not in ranked list, check if it exists with ANY data (even < 10 games)
    if (!playerItem) {
      const lowSampleItem = slotItems.find(i => i.item_id === playerItemId)
      if (lowSampleItem && lowSampleItem.games >= 1) {
        // We have SOME data - use it but with very low confidence
        // Rank it at the end of known items
        playerRank = itemsWithPriority.length + 1
        const confidence = Math.min(0.5, lowSampleItem.games / MIN_GAMES_THRESHOLD)
        playerItem = {
          ...lowSampleItem,
          pickrate: (lowSampleItem.games / totalGames) * 100,
          priority: lowSampleItem.winrate,
          confidence,
        }
      }
    }

    if (!playerItem) {
      // Truly unknown item - no data at all
      const penaltyAmount = 10
      totalPenalty += penaltyAmount
      details.push({
        slot,
        itemId: playerItemId,
        penalty: penaltyAmount,
        reason: 'off-meta',
        topWinrate: itemsWithPriority[0]?.priority,
        isInTop5: false,
      })
      continue
    }

    // Calculate score based on rank
    const score = calculateRankBasedScore(playerRank, itemsWithPriority.length)
    const isInTop5 = playerRank <= 5

    // Apply confidence weight - low sample items have reduced penalty impact
    const basePenalty = ((100 - score) / 100) * 20
    const penaltyAmount = basePenalty * playerItem.confidence

    totalPenalty += penaltyAmount
    details.push({
      slot,
      itemId: playerItemId,
      penalty: penaltyAmount,
      reason: isInTop5 ? 'optimal' : 'suboptimal',
      playerWinrate: playerItem.priority,
      topWinrate: itemsWithPriority[0].priority,
      isInTop5,
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

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 50

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
      const confidence = Math.min(1, 0.5 + (0.5 * (rune.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return { ...rune, pickrate, priority, confidence }
    })
    .filter(rune => rune.games >= MIN_GAMES)
    .sort((a, b) => b.priority - a.priority)

  if (runesWithPriority.length === 0) return 0

  // Find player's rune
  const playerRuneIndex = runesWithPriority.findIndex(r => r.rune_id === participant.perk0)
  let playerRune = playerRuneIndex >= 0 ? runesWithPriority[playerRuneIndex] : null
  let playerRank = playerRuneIndex >= 0 ? playerRuneIndex + 1 : -1

  // Check for low sample data
  if (!playerRune) {
    const lowSampleRune = runeStats.find(r => r.rune_id === participant.perk0)
    if (lowSampleRune && lowSampleRune.games >= 1) {
      playerRank = runesWithPriority.length + 1
      const confidence = Math.min(0.5, lowSampleRune.games / MIN_GAMES)
      playerRune = { ...lowSampleRune, pickrate: 0, priority: lowSampleRune.winrate, confidence }
    }
  }

  if (!playerRune) return 8 // Truly unknown rune

  const score = calculateRankBasedScore(playerRank, runesWithPriority.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerRune.confidence
}

// calculate summoner spells penalty
export async function calculateSpellsPenalty(
  participant: ParticipantForPenalty,
  championName: string
): Promise<number> {
  if (!participant.patch || !participant.spell1 || !participant.spell2) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 30

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
    .map(([key, value]) => {
      const confidence = Math.min(1, 0.5 + (0.5 * (value.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: value.games,
        wins: value.wins,
        winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
        confidence,
      }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (spellsWithWinrate.length === 0) return 0

  // Find player's spell combo
  const playerComboIndex = spellsWithWinrate.findIndex(s => s.key === playerKey)
  let playerCombo = playerComboIndex >= 0 ? spellsWithWinrate[playerComboIndex] : null
  let playerRank = playerComboIndex >= 0 ? playerComboIndex + 1 : -1

  // Check for low sample data
  if (!playerCombo) {
    const lowSampleEntry = spellsEntries.find(([key]) => key === playerKey)
    if (lowSampleEntry && lowSampleEntry[1].games >= 1) {
      playerRank = spellsWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSampleEntry[1].games / MIN_GAMES)
      playerCombo = {
        key: playerKey,
        games: lowSampleEntry[1].games,
        wins: lowSampleEntry[1].wins,
        winrate: lowSampleEntry[1].games > 0 ? (lowSampleEntry[1].wins / lowSampleEntry[1].games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerCombo) return 5 // Truly unknown combo

  const score = calculateRankBasedScore(playerRank, spellsWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 15
  return basePenalty * playerCombo.confidence
}

// calculate skill max order penalty
export async function calculateSkillOrderPenalty(
  participant: ParticipantForPenalty,
  championName: string
): Promise<number> {
  if (!participant.patch || !participant.skillOrder) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 20

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
    .map(([key, value]) => {
      const confidence = Math.min(1, 0.5 + (0.5 * (value.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: value.games,
        wins: value.wins,
        winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
        confidence,
      }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (skillsWithWinrate.length === 0) return 0

  // Find player's skill order
  const playerSkillIndex = skillsWithWinrate.findIndex(s => s.key === participant.skillOrder)
  let playerSkill = playerSkillIndex >= 0 ? skillsWithWinrate[playerSkillIndex] : null
  let playerRank = playerSkillIndex >= 0 ? playerSkillIndex + 1 : -1

  // Check for low sample data
  if (!playerSkill) {
    const lowSampleEntry = skillsEntries.find(([key]) => key === participant.skillOrder)
    if (lowSampleEntry && lowSampleEntry[1].games >= 1) {
      playerRank = skillsWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSampleEntry[1].games / MIN_GAMES)
      playerSkill = {
        key: participant.skillOrder,
        games: lowSampleEntry[1].games,
        wins: lowSampleEntry[1].wins,
        winrate: lowSampleEntry[1].games > 0 ? (lowSampleEntry[1].wins / lowSampleEntry[1].games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerSkill) return 8 // Truly unknown skill order

  const score = calculateRankBasedScore(playerRank, skillsWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerSkill.confidence
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

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 20

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
    .map(([key, data]) => {
      const confidence = Math.min(1, 0.5 + (0.5 * (data.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: data.games,
        wins: data.wins,
        winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
        confidence,
      }
    })
    .filter(c => c.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (combosWithWinrate.length === 0) return 0

  // Find player's build order
  const playerComboIndex = combosWithWinrate.findIndex(c => c.key === playerKey)
  let playerCombo = playerComboIndex >= 0 ? combosWithWinrate[playerComboIndex] : null
  let playerRank = playerComboIndex >= 0 ? playerComboIndex + 1 : -1

  // Check for low sample data
  if (!playerCombo) {
    const lowSampleEntry = Object.entries(coreData).find(([key]) => key === playerKey)
    if (lowSampleEntry && lowSampleEntry[1].games >= 1) {
      playerRank = combosWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSampleEntry[1].games / MIN_GAMES)
      playerCombo = {
        key: playerKey,
        games: lowSampleEntry[1].games,
        wins: lowSampleEntry[1].wins,
        winrate: lowSampleEntry[1].games > 0 ? (lowSampleEntry[1].wins / lowSampleEntry[1].games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerCombo) return 8 // Truly unknown build order

  const score = calculateRankBasedScore(playerRank, combosWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerCombo.confidence
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

    // Include all items with at least 10 games for ranking
    // Items with 30+ games get full confidence, 10-29 games get partial confidence
    const MIN_GAMES_THRESHOLD = 10
    const FULL_CONFIDENCE_GAMES = 30

    const itemsWithPriority = slotItems
      .map(item => {
        const pickrate = (item.games / totalGames) * 100
        // Confidence scales from 0.5 at 10 games to 1.0 at 30+ games
        const confidence = Math.min(
          1,
          0.5 + (0.5 * (item.games - MIN_GAMES_THRESHOLD)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES_THRESHOLD)
        )
        return { ...item, pickrate, priority: item.winrate, confidence }
      })
      .filter(item => item.games >= MIN_GAMES_THRESHOLD)
      .sort((a, b) => b.priority - a.priority)

    if (itemsWithPriority.length === 0) {
      details.push({ slot, itemId: playerItemId, penalty: 0, reason: 'unknown', isInTop5: false })
      continue
    }

    // Find player's item - first check in ranked list
    const playerItemIndex = itemsWithPriority.findIndex(i => i.item_id === playerItemId)
    let playerItem = playerItemIndex >= 0 ? itemsWithPriority[playerItemIndex] : null
    let playerRank = playerItemIndex >= 0 ? playerItemIndex + 1 : -1

    // If not in ranked list, check if it exists with ANY data (even < 10 games)
    if (!playerItem) {
      const lowSampleItem = slotItems.find(i => i.item_id === playerItemId)
      if (lowSampleItem && lowSampleItem.games >= 1) {
        // We have SOME data - use it but with very low confidence
        // Rank it at the end of known items
        playerRank = itemsWithPriority.length + 1
        const confidence = Math.min(0.5, lowSampleItem.games / MIN_GAMES_THRESHOLD)
        playerItem = {
          ...lowSampleItem,
          pickrate: (lowSampleItem.games / totalGames) * 100,
          priority: lowSampleItem.winrate,
          confidence,
        }
      }
    }

    if (!playerItem) {
      // Truly unknown item - no data at all
      // Give benefit of doubt with moderate penalty
      const penaltyAmount = 10 // Fixed moderate penalty for completely unknown
      totalPenalty += penaltyAmount
      details.push({
        slot,
        itemId: playerItemId,
        penalty: penaltyAmount,
        reason: 'off-meta',
        topWinrate: itemsWithPriority[0]?.priority,
        isInTop5: false,
      })
      continue
    }

    // Calculate score based on rank
    const score = calculateRankBasedScore(playerRank, itemsWithPriority.length)
    const isInTop5 = playerRank <= 5

    // Apply confidence weight - low sample items have reduced penalty impact
    const basePenalty = ((100 - score) / 100) * 20
    const penaltyAmount = basePenalty * playerItem.confidence

    totalPenalty += penaltyAmount
    details.push({
      slot,
      itemId: playerItemId,
      penalty: penaltyAmount,
      reason: isInTop5 ? 'optimal' : 'suboptimal',
      playerWinrate: playerItem.priority,
      topWinrate: itemsWithPriority[0].priority,
      isInTop5,
    })
  }

  return { totalPenalty: Math.min(60, totalPenalty), details }
}

function calculateKeystonePenaltyFromData(
  participant: ParticipantForPenalty,
  runeStats: Array<{ rune_id: number; games: number; wins: number; winrate: number }>
): number {
  if (!participant.perk0 || runeStats.length === 0) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 50

  const totalGames = runeStats.reduce((sum, r) => sum + r.games, 0)
  const runesWithPriority = runeStats
    .map(rune => {
      const confidence = Math.min(1, 0.5 + (0.5 * (rune.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return { ...rune, pickrate: (rune.games / totalGames) * 100, priority: rune.winrate, confidence }
    })
    .filter(rune => rune.games >= MIN_GAMES)
    .sort((a, b) => b.priority - a.priority)

  if (runesWithPriority.length === 0) return 0

  // Find player's rune - first in ranked list
  const playerRuneIndex = runesWithPriority.findIndex(r => r.rune_id === participant.perk0)
  let playerRune = playerRuneIndex >= 0 ? runesWithPriority[playerRuneIndex] : null
  let playerRank = playerRuneIndex >= 0 ? playerRuneIndex + 1 : -1

  // Check for low sample data if not found
  if (!playerRune) {
    const lowSampleRune = runeStats.find(r => r.rune_id === participant.perk0)
    if (lowSampleRune && lowSampleRune.games >= 1) {
      playerRank = runesWithPriority.length + 1
      const confidence = Math.min(0.5, lowSampleRune.games / MIN_GAMES)
      playerRune = { ...lowSampleRune, pickrate: 0, priority: lowSampleRune.winrate, confidence }
    }
  }

  if (!playerRune) return 8 // Truly unknown rune

  const score = calculateRankBasedScore(playerRank, runesWithPriority.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerRune.confidence
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateSpellsPenaltyFromData(participant: ParticipantForPenalty, championData: any): number {
  if (!participant.spell1 || !participant.spell2 || !championData?.spells) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 30

  const spellsObj = championData.spells as Record<string, { games: number; wins: number }>
  const spellsEntries = Object.entries(spellsObj)
  if (spellsEntries.length === 0) return 0

  const playerSpells = [participant.spell1, participant.spell2].sort((a, b) => a - b)
  const playerKey = `${playerSpells[0]}_${playerSpells[1]}`

  const spellsWithWinrate = spellsEntries
    .map(([key, value]) => {
      const confidence = Math.min(1, 0.5 + (0.5 * (value.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: value.games,
        wins: value.wins,
        winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
        confidence,
      }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (spellsWithWinrate.length === 0) return 0

  // Find player's spell combo
  const playerComboIndex = spellsWithWinrate.findIndex(s => s.key === playerKey)
  let playerCombo = playerComboIndex >= 0 ? spellsWithWinrate[playerComboIndex] : null
  let playerRank = playerComboIndex >= 0 ? playerComboIndex + 1 : -1

  // Check for low sample data
  if (!playerCombo) {
    const lowSampleEntry = spellsEntries.find(([key]) => key === playerKey)
    if (lowSampleEntry && lowSampleEntry[1].games >= 1) {
      playerRank = spellsWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSampleEntry[1].games / MIN_GAMES)
      playerCombo = {
        key: playerKey,
        games: lowSampleEntry[1].games,
        wins: lowSampleEntry[1].wins,
        winrate: lowSampleEntry[1].games > 0 ? (lowSampleEntry[1].wins / lowSampleEntry[1].games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerCombo) return 5 // Truly unknown combo

  const score = calculateRankBasedScore(playerRank, spellsWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 15
  return basePenalty * playerCombo.confidence
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateSkillOrderPenaltyFromData(participant: ParticipantForPenalty, championData: any): number {
  if (!participant.skillOrder || !championData?.skills) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 20

  const skillsObj = championData.skills as Record<string, { games: number; wins: number }>
  const skillsEntries = Object.entries(skillsObj)
  if (skillsEntries.length === 0) return 0

  const skillsWithWinrate = skillsEntries
    .map(([key, value]) => {
      const confidence = Math.min(1, 0.5 + (0.5 * (value.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: value.games,
        wins: value.wins,
        winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0,
        confidence,
      }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (skillsWithWinrate.length === 0) return 0

  // Find player's skill order
  const playerSkillIndex = skillsWithWinrate.findIndex(s => s.key === participant.skillOrder)
  let playerSkill = playerSkillIndex >= 0 ? skillsWithWinrate[playerSkillIndex] : null
  let playerRank = playerSkillIndex >= 0 ? playerSkillIndex + 1 : -1

  // Check for low sample data
  if (!playerSkill) {
    const lowSampleEntry = skillsEntries.find(([key]) => key === participant.skillOrder)
    if (lowSampleEntry && lowSampleEntry[1].games >= 1) {
      playerRank = skillsWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSampleEntry[1].games / MIN_GAMES)
      playerSkill = {
        key: participant.skillOrder,
        games: lowSampleEntry[1].games,
        wins: lowSampleEntry[1].wins,
        winrate: lowSampleEntry[1].games > 0 ? (lowSampleEntry[1].wins / lowSampleEntry[1].games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerSkill) return 8 // Truly unknown skill order

  const score = calculateRankBasedScore(playerRank, skillsWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerSkill.confidence
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateBuildOrderPenaltyFromData(participant: ParticipantForPenalty, championData: any): number {
  if (!participant.buildOrder || !championData?.core) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 20

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
    .map(([key, data]) => {
      const confidence = Math.min(1, 0.5 + (0.5 * (data.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: data.games,
        wins: data.wins,
        winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
        confidence,
      }
    })
    .filter(c => c.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (combosWithWinrate.length === 0) return 0

  // Find player's build order
  const playerComboIndex = combosWithWinrate.findIndex(c => c.key === playerKey)
  let playerCombo = playerComboIndex >= 0 ? combosWithWinrate[playerComboIndex] : null
  let playerRank = playerComboIndex >= 0 ? playerComboIndex + 1 : -1

  // Check for low sample data
  if (!playerCombo) {
    const lowSampleEntry = Object.entries(coreData).find(([key]) => key === playerKey)
    if (lowSampleEntry && lowSampleEntry[1].games >= 1) {
      playerRank = combosWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSampleEntry[1].games / MIN_GAMES)
      playerCombo = {
        key: playerKey,
        games: lowSampleEntry[1].games,
        wins: lowSampleEntry[1].wins,
        winrate: lowSampleEntry[1].games > 0 ? (lowSampleEntry[1].wins / lowSampleEntry[1].games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerCombo) return 8 // Truly unknown build order

  const score = calculateRankBasedScore(playerRank, combosWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerCombo.confidence
}
