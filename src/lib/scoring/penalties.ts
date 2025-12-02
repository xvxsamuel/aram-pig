// PIG Score calculator - percentile-based scoring
import { createAdminClient } from '../db/supabase'
import type { WelfordState } from '../db/stats-aggregator'
import { getZScore, getStdDev } from '../db/stats-aggregator'
import itemsData from '@/data/items.json'

// Item data for checking completed items
const items = itemsData as Record<string, { itemType?: string }>

function isCompletedItem(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots' || type === 'mythic'
}

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

// Special CC time scoring: 
// - Below 0.5 sec/min average: don't count CC at all (neutral score)
// - 0.5-2 sec/min average: just use ratio (100% of avg = 100 score, too inconsistent for variance)
// - Above 2 sec/min average: use normal z-score based scoring
export function calculateCCTimeScore(playerValue: number, avgValue: number, welfordState?: WelfordState): number {
  if (avgValue <= 0) return 50 // Default to average if no data

  // Champions with very low CC (< 0.5 sec/min avg) - don't count CC at all
  if (avgValue < 0.5) {
    return 100 // Neutral score, effectively ignored via weight
  }

  // If champion avg CC 0.5-2 sec/min, CC is too inconsistent - just use ratio scoring
  // Meeting or exceeding average = 100, below average scales down proportionally
  if (avgValue < 2) {
    const ratio = playerValue / avgValue
    if (ratio >= 1) return 100 // At or above average = perfect
    // Below average: scale from 0-100 based on how close to average
    // 0% of avg = 0 score, 100% of avg = 100 score
    return Math.round(ratio * 100)
  }

  // Above 2 sec/min: use normal stat scoring with z-score
  return calculateStatScore(playerValue, avgValue, welfordState)
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
  item3: number
  item4: number
  item5: number
  perk0: number
  spell1?: number
  spell2?: number
  skillOrder?: string
  buildOrder?: string
  firstBuy?: string // comma-separated item IDs of starting items
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

// Starting items penalty detail for breakdown display
export interface StartingItemsPenaltyDetail {
  itemIds: number[]
  penalty: number
  reason: 'optimal' | 'suboptimal' | 'off-meta' | 'unknown'
  playerWinrate?: number
  topWinrate?: number
  rank?: number
  totalOptions?: number
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
// OPTIMIZED BATCH CALCULATION - Core-build aware scoring
// ============================================================================

// All boots (tier 1 + tier 2) - normalized to 99999 for core combo grouping
const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158])

function normalizeBootId(itemId: number): number {
  return BOOT_IDS.has(itemId) ? 99999 : itemId
}

function createComboKey(items: number[]): string | null {
  const first3 = items.filter(id => id > 0).slice(0, 3)
  if (first3.length !== 3) return null

  const normalized = first3.map(normalizeBootId)
  const uniqueSorted = [...new Set(normalized)].sort((a, b) => a - b)

  if (uniqueSorted.length !== 3) return null

  return uniqueSorted.join('_')
}

function createSpellKey(spell1: number, spell2: number): string {
  return `${Math.min(spell1, spell2)}_${Math.max(spell1, spell2)}`
}

// Fallback info - tracks when global data is used instead of core-specific data
export interface FallbackInfo {
  items: boolean       // true if items used global data (no core match)
  keystone: boolean    // true if keystone used global data
  spells: boolean      // true if spells used global data
  starting: boolean    // true if starting items used global data
}

// Core build details for breakdown display
export interface CoreBuildDetails {
  penalty: number
  playerWinrate?: number
  topWinrate?: number
  rank?: number
  totalOptions?: number
  games?: number
}

export interface AllPenaltiesResult {
  itemPenalty: number
  itemDetails: ItemPenaltyDetail[]
  keystonePenalty: number
  spellsPenalty: number
  skillOrderPenalty: number
  buildOrderPenalty: number
  startingItemsPenalty: number
  startingItemsDetails?: StartingItemsPenaltyDetail
  coreBuildDetails?: CoreBuildDetails
  coreKey?: string // The matched core build key (for debugging)
  fallbackInfo: FallbackInfo // Tracks which categories used fallback data
  usedFallbackPatch?: boolean // Whether we used a different patch's data due to insufficient data for match patch
  actualPatchUsed?: string // The actual patch data used (may differ from match patch if fallback)
}

// Calculate all build/choice penalties using CORE BUILD CONTEXT
// This scores items/runes/spells based on what works with YOUR specific core build
// Accepts optional pre-fetched championData to avoid duplicate DB queries
export async function calculateAllBuildPenalties(
  participant: ParticipantForPenalty,
  championName: string,
  prefetchedChampionData?: Record<string, unknown> | null
): Promise<AllPenaltiesResult> {
  // Calculate player's core key from FINAL items, ordered by build timeline
  // Core = first 3 completed items (legendary/boots/mythic) the player finished
  const coreItems: number[] = []
  
  // Get final items from slots
  const finalItems = [
    participant.item0, participant.item1, participant.item2,
    participant.item3, participant.item4, participant.item5
  ].filter(id => id > 0 && isCompletedItem(id))
  
  if (participant.buildOrder && finalItems.length >= 3) {
    // Parse build order to get purchase sequence
    const buildOrderItems = participant.buildOrder
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id) && id > 0)
    
    // Find first 3 completed items from build order that are in final items
    // This gives us the order they were completed
    const seen = new Set<number>()
    for (const itemId of buildOrderItems) {
      if (coreItems.length >= 3) break
      // Only count if it's a completed item AND in final items AND not already counted
      // For boots: only count finished boots (not tier 1 boots 1001)
      if (isCompletedItem(itemId) && finalItems.includes(itemId) && !seen.has(itemId)) {
        coreItems.push(itemId)
        seen.add(itemId)
      }
    }

  }
  
  // Fallback to item slots if no build order or not enough items
  if (coreItems.length < 3) {

    for (const itemId of finalItems) {
      if (coreItems.length >= 3) break
      if (!coreItems.includes(itemId)) {
        coreItems.push(itemId)
      }
    }
  }
  
  const playerCoreKey = createComboKey(coreItems) || undefined


  if (!participant.patch) {
    return {
      itemPenalty: 0,
      itemDetails: [],
      keystonePenalty: 0,
      spellsPenalty: 0,
      skillOrderPenalty: 0,
      buildOrderPenalty: 0,
      startingItemsPenalty: 0,
      coreKey: playerCoreKey,
      fallbackInfo: { items: true, keystone: true, spells: true, starting: true },
    }
  }

  // Use pre-fetched data if available, otherwise fetch from DB
  // Implements fallback logic: try exact patch first, then fall back to latest patch with sufficient data
  let championData = prefetchedChampionData
  let usedFallbackPatch = false
  let actualPatchUsed = participant.patch
  
  if (!championData) {
    const supabase = createAdminClient()
    
    // First try exact patch match
    const { data: exactMatchResult } = await supabase
      .from('champion_stats')
      .select('data, patch')
      .eq('champion_name', championName)
      .eq('patch', participant.patch)
      .maybeSingle()
    
    if (exactMatchResult?.data && (exactMatchResult.data as any).games >= 100) {
      championData = exactMatchResult.data
      actualPatchUsed = exactMatchResult.patch
    } else {
      // Fallback: get all patches for this champion, sorted by patch desc (newest first)
      // and pick the one with the most data (100+ games)
      const { data: allPatchesResult } = await supabase
        .from('champion_stats')
        .select('data, patch')
        .eq('champion_name', championName)
        .order('patch', { ascending: false })
        .limit(5)
      
      if (allPatchesResult && allPatchesResult.length > 0) {
        // Find first patch with 100+ games (prefer newer patches)
        const validPatch = allPatchesResult.find(p => (p.data as any)?.games >= 100)
        if (validPatch) {
          championData = validPatch.data
          actualPatchUsed = validPatch.patch
          usedFallbackPatch = actualPatchUsed !== participant.patch
          if (usedFallbackPatch) {
            console.log(`[Penalties] Using fallback patch ${actualPatchUsed} for champion ${championName} (match was ${participant.patch})`)
          }
        }
      }
    }
  }

  if (!championData) {
    return {
      itemPenalty: 0,
      itemDetails: [],
      keystonePenalty: 0,
      spellsPenalty: 0,
      skillOrderPenalty: 0,
      buildOrderPenalty: 0,
      startingItemsPenalty: 0,
      coreKey: playerCoreKey,
      fallbackInfo: { items: true, keystone: true, spells: true, starting: true },
      usedFallbackPatch,
      actualPatchUsed,
    }
  }

  // Find player's core build data, or fall back to best matching core
  const coreData = championData.core as Record<string, CoreBuildData> | undefined
  let matchedCoreData: CoreBuildData | null = null

  // Debug: log incoming data
  console.log(`[CoreMatch] Champion: ${championName}, patch: ${participant.patch}`)
  console.log(`[CoreMatch] buildOrder: ${participant.buildOrder}`)
  console.log(`[CoreMatch] finalItems: ${finalItems.join(',')}`)
  console.log(`[CoreMatch] coreItems: ${coreItems.join(',')}`)
  console.log(`[CoreMatch] playerCoreKey: ${playerCoreKey}`)
  console.log(`[CoreMatch] coreData exists: ${!!coreData}, keys: ${coreData ? Object.keys(coreData).length : 0}`)

  if (coreData && playerCoreKey) {
    // Exact match
    if (coreData[playerCoreKey]) {
      matchedCoreData = coreData[playerCoreKey]
      console.log(`[CoreMatch] EXACT match found: ${playerCoreKey} with ${matchedCoreData.games} games`)
    } else {
      // Find best matching core (most games with at least 2 matching items)
      const playerNormalized = coreItems.slice(0, 3).map(normalizeBootId)
      let bestMatch: { key: string; data: CoreBuildData; matchCount: number } | null = null

      for (const [key, data] of Object.entries(coreData)) {
        const coreKeyItems = key.split('_').map(Number)
        const matchCount = playerNormalized.filter(item => coreKeyItems.includes(item)).length
        if (matchCount >= 2 && data.games >= 10) {
          if (!bestMatch || data.games > bestMatch.data.games) {
            bestMatch = { key, data, matchCount }
          }
        }
      }

      if (bestMatch) {
        matchedCoreData = bestMatch.data
        console.log(`[CoreMatch] PARTIAL match: ${bestMatch.key} with ${bestMatch.matchCount} items, ${matchedCoreData.games} games`)
      } else {
        console.log(`[CoreMatch] NO match found. Player normalized: ${playerNormalized.join(',')}`)
        // Log top 5 cores for debugging
        const topCores = Object.entries(coreData)
          .sort((a, b) => b[1].games - a[1].games)
          .slice(0, 5)
          .map(([k, v]) => `${k}(${v.games})`)
        console.log(`[CoreMatch] Top 5 cores: ${topCores.join(', ')}`)
      }
    }
  } else {
    console.log(`[CoreMatch] Missing data - coreData: ${!!coreData}, playerCoreKey: ${playerCoreKey}`)
    if (coreItems.length > 0) {
      console.log(`[CoreMatch] coreItems were: ${coreItems.join(',')} but key creation failed`)
    }
  }

  // Calculate core build score (how good is the core itself)
  const coreBuildResult = calculateCoreBuildPenalty(playerCoreKey, coreData)

  // If we have core-specific data, use it for items beyond slot 3, runes, spells
  // Otherwise fall back to global stats
  const useCore = matchedCoreData && matchedCoreData.games >= 10
  console.log(`[CoreMatch] useCore=${useCore}, matchedCoreData=${!!matchedCoreData}, games=${matchedCoreData?.games || 0}`)

  // Calculate penalties using core-specific or global data
  const itemResult = calculateItemPenaltyFromCoreData(
    participant,
    coreItems,
    useCore ? matchedCoreData : null,
    championData.items,
    championData.games || 1
  )

  const keystonePenalty = calculateKeystonePenaltyFromCoreData(
    participant,
    useCore ? matchedCoreData?.runes?.primary : null,
    championData.runes?.primary
  )

  const spellsPenalty = calculateSpellsPenaltyFromCoreData(
    participant,
    useCore ? matchedCoreData?.spells : null,
    championData.spells
  )

  // Skill order uses global data (not core-specific)
  const skillOrderPenalty = calculateSkillOrderPenaltyFromData(participant, championData)

  // Starting items - use core-specific data if available
  const startingItemsResult = calculateStartingItemsPenaltyFromCoreData(
    participant,
    useCore ? matchedCoreData?.starting : null,
    championData.starting
  )

  return {
    itemPenalty: itemResult.totalPenalty,
    itemDetails: itemResult.details,
    keystonePenalty,
    spellsPenalty,
    skillOrderPenalty,
    buildOrderPenalty: coreBuildResult.penalty,
    startingItemsPenalty: startingItemsResult.penalty,
    startingItemsDetails: startingItemsResult.details,
    coreBuildDetails: coreBuildResult,
    coreKey: playerCoreKey, // Return player's core build, not the matched data key
    fallbackInfo: {
      items: !useCore,
      keystone: !useCore,
      spells: !useCore,
      starting: startingItemsResult.usedFallback,
    },
    usedFallbackPatch,
    actualPatchUsed,
  }
}

// Type for core build data structure
interface CoreBuildData {
  games: number
  wins: number
  items?: Record<string, Record<string, { games: number; wins: number }>>
  runes?: {
    primary?: Record<string, { games: number; wins: number }>
    secondary?: Record<string, { games: number; wins: number }>
    tertiary?: {
      offense?: Record<string, { games: number; wins: number }>
      flex?: Record<string, { games: number; wins: number }>
      defense?: Record<string, { games: number; wins: number }>
    }
  }
  spells?: Record<string, { games: number; wins: number }>
  starting?: Record<string, { games: number; wins: number }>
}

// Calculate core build penalty (is the 3-item core good?)
function calculateCoreBuildPenalty(
  playerCoreKey: string | null,
  coreData: Record<string, CoreBuildData> | undefined
): CoreBuildDetails {
  if (!playerCoreKey || !coreData) return { penalty: 0 }

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 30

  const coresWithWinrate = Object.entries(coreData)
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

  if (coresWithWinrate.length === 0) return { penalty: 0 }

  // Find player's core
  const playerIndex = coresWithWinrate.findIndex(c => c.key === playerCoreKey)
  let playerCore = playerIndex >= 0 ? coresWithWinrate[playerIndex] : null
  let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

  // Check low sample data
  if (!playerCore && coreData[playerCoreKey]) {
    const lowSample = coreData[playerCoreKey]
    if (lowSample.games >= 1) {
      playerRank = coresWithWinrate.length + 1
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      playerCore = {
        key: playerCoreKey,
        games: lowSample.games,
        wins: lowSample.wins,
        winrate: lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerCore) {
    return {
      penalty: 8,
      topWinrate: coresWithWinrate[0]?.winrate,
      totalOptions: coresWithWinrate.length,
    }
  }

  const score = calculateRankBasedScore(playerRank, coresWithWinrate.length)
  const basePenalty = ((100 - score) / 100) * 20
  const penalty = basePenalty * playerCore.confidence

  return {
    penalty,
    playerWinrate: playerCore.winrate,
    topWinrate: coresWithWinrate[0]?.winrate,
    rank: playerRank,
    totalOptions: coresWithWinrate.length,
    games: playerCore.games,
  }
}

// Calculate item penalty using core-specific data for slots 4-6
// Calculate item penalty using BUILD ORDER positions (not physical slots)
// This matches how champion_stats stores data: by build order position (1st, 2nd, 3rd item bought)
function calculateItemPenaltyFromCoreData(
  participant: ParticipantForPenalty,
  playerCoreItems: number[],
  coreData: CoreBuildData | null,
  globalItems: Record<string, Record<string, { games: number; wins: number }>> | undefined,
  _totalGames: number
): { totalPenalty: number; details: ItemPenaltyDetail[] } {
  const details: ItemPenaltyDetail[] = []
  let totalPenalty = 0

  // Require build order from timeline - no fallback to item slots
  if (!participant.buildOrder) {
    return { totalPenalty: 0, details }
  }

  // Get completed items in BUILD ORDER (not physical slot order)
  const allPurchasedItems = participant.buildOrder
    .split(',')
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id) && id > 0)
  
  const completedItemsInOrder = allPurchasedItems.filter(isCompletedItem)

  const MIN_GAMES_THRESHOLD = 10
  const FULL_CONFIDENCE_GAMES = 30

  // Process each completed item by its BUILD ORDER position
  for (let buildPosition = 0; buildPosition < completedItemsInOrder.length && buildPosition < 6; buildPosition++) {
    const playerItemId = completedItemsInOrder[buildPosition]
    if (!playerItemId || playerItemId === 0) continue

    // Boots get no penalty
    if (BOOT_IDS.has(playerItemId)) {
      details.push({ slot: buildPosition, itemId: playerItemId, penalty: 0, reason: 'boots', isInTop5: true })
      continue
    }

    // Build position is 0-indexed, but champion_stats uses 1-indexed keys
    const positionKey = (buildPosition + 1).toString()
    let itemsForPosition: Record<string, { games: number; wins: number }> | undefined

    // For ALL positions, check core-specific data first (not just positions 4-6)
    if (coreData?.items) {
      const corePositionItems: Record<string, { games: number; wins: number }> = {}
      for (const [itemId, positions] of Object.entries(coreData.items)) {
        if (positions[positionKey]) {
          corePositionItems[itemId] = positions[positionKey]
        }
      }
      if (Object.keys(corePositionItems).length > 0) {
        itemsForPosition = corePositionItems
      }
    }

    // Fall back to global position data
    if (!itemsForPosition && globalItems?.[positionKey]) {
      itemsForPosition = globalItems[positionKey]
    }

    if (!itemsForPosition || Object.keys(itemsForPosition).length === 0) {
      details.push({ slot: buildPosition, itemId: playerItemId, penalty: 0, reason: 'unknown', isInTop5: false })
      continue
    }

    // Rank items by winrate
    const itemsWithPriority = Object.entries(itemsForPosition)
      .map(([itemId, stats]) => {
        const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
        const confidence = Math.min(
          1,
          0.5 + (0.5 * (stats.games - MIN_GAMES_THRESHOLD)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES_THRESHOLD)
        )
        return { itemId: parseInt(itemId), games: stats.games, winrate, confidence }
      })
      .filter(item => item.games >= MIN_GAMES_THRESHOLD)
      .sort((a, b) => b.winrate - a.winrate)

    if (itemsWithPriority.length === 0) {
      details.push({ slot: buildPosition, itemId: playerItemId, penalty: 0, reason: 'unknown', isInTop5: false })
      continue
    }

    // Find player's item
    const playerIndex = itemsWithPriority.findIndex(i => i.itemId === playerItemId)
    let playerItem = playerIndex >= 0 ? itemsWithPriority[playerIndex] : null
    let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

    // Check low sample
    if (!playerItem && itemsForPosition[playerItemId.toString()]) {
      const lowSample = itemsForPosition[playerItemId.toString()]
      if (lowSample.games >= 1) {
        playerRank = itemsWithPriority.length + 1
        const confidence = Math.min(0.5, lowSample.games / MIN_GAMES_THRESHOLD)
        playerItem = {
          itemId: playerItemId,
          games: lowSample.games,
          winrate: lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0,
          confidence,
        }
      }
    }

    if (!playerItem) {
      totalPenalty += 10
      details.push({
        slot: buildPosition,
        itemId: playerItemId,
        penalty: 10,
        reason: 'off-meta',
        topWinrate: itemsWithPriority[0]?.winrate,
        isInTop5: false,
      })
      continue
    }

    const score = calculateRankBasedScore(playerRank, itemsWithPriority.length)
    const isInTop5 = playerRank <= 5
    const basePenalty = ((100 - score) / 100) * 20
    const penaltyAmount = basePenalty * playerItem.confidence

    totalPenalty += penaltyAmount
    details.push({
      slot: buildPosition,
      itemId: playerItemId,
      penalty: penaltyAmount,
      reason: isInTop5 ? 'optimal' : 'suboptimal',
      playerWinrate: playerItem.winrate,
      topWinrate: itemsWithPriority[0].winrate,
      isInTop5,
    })
  }

  return { totalPenalty: Math.min(60, totalPenalty), details }
}

// Calculate keystone penalty using core-specific data if available
function calculateKeystonePenaltyFromCoreData(
  participant: ParticipantForPenalty,
  coreRunes: Record<string, { games: number; wins: number }> | null | undefined,
  globalRunes: Record<string, { games: number; wins: number }> | undefined
): number {
  if (!participant.perk0) return 0

  const runeData = coreRunes && Object.keys(coreRunes).length > 0 ? coreRunes : globalRunes
  if (!runeData || Object.keys(runeData).length === 0) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 50

  const runesWithPriority = Object.entries(runeData)
    .map(([runeId, stats]) => {
      const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const confidence = Math.min(1, 0.5 + (0.5 * (stats.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return { runeId: parseInt(runeId), games: stats.games, winrate, confidence }
    })
    .filter(r => r.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (runesWithPriority.length === 0) return 0

  const playerIndex = runesWithPriority.findIndex(r => r.runeId === participant.perk0)
  let playerRune = playerIndex >= 0 ? runesWithPriority[playerIndex] : null
  let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

  // Check low sample
  if (!playerRune && runeData[participant.perk0.toString()]) {
    const lowSample = runeData[participant.perk0.toString()]
    if (lowSample.games >= 1) {
      playerRank = runesWithPriority.length + 1
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      playerRune = {
        runeId: participant.perk0,
        games: lowSample.games,
        winrate: lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerRune) return 8

  const score = calculateRankBasedScore(playerRank, runesWithPriority.length)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerRune.confidence
}

// Calculate spells penalty using core-specific data if available
function calculateSpellsPenaltyFromCoreData(
  participant: ParticipantForPenalty,
  coreSpells: Record<string, { games: number; wins: number }> | null | undefined,
  globalSpells: Record<string, { games: number; wins: number }> | undefined
): number {
  if (!participant.spell1 || !participant.spell2) return 0

  const spellData = coreSpells && Object.keys(coreSpells).length > 0 ? coreSpells : globalSpells
  if (!spellData || Object.keys(spellData).length === 0) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 30

  const playerKey = createSpellKey(participant.spell1, participant.spell2)

  const spellsWithPriority = Object.entries(spellData)
    .map(([key, stats]) => {
      const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const confidence = Math.min(1, 0.5 + (0.5 * (stats.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return { key, games: stats.games, winrate, confidence }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  if (spellsWithPriority.length === 0) return 0

  const playerIndex = spellsWithPriority.findIndex(s => s.key === playerKey)
  let playerSpell = playerIndex >= 0 ? spellsWithPriority[playerIndex] : null
  let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

  // Check low sample
  if (!playerSpell && spellData[playerKey]) {
    const lowSample = spellData[playerKey]
    if (lowSample.games >= 1) {
      playerRank = spellsWithPriority.length + 1
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      playerSpell = {
        key: playerKey,
        games: lowSample.games,
        winrate: lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0,
        confidence,
      }
    }
  }

  if (!playerSpell) return 5

  const score = calculateRankBasedScore(playerRank, spellsWithPriority.length)
  const basePenalty = ((100 - score) / 100) * 15
  return basePenalty * playerSpell.confidence
}

function calculateSkillOrderPenaltyFromData(
  participant: ParticipantForPenalty,
  championData: Record<string, unknown>
): number {
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

// Normalize a starter key by sorting item IDs (for order-independent comparison)
function normalizeStarterKey(key: string): string {
  return key.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id)).sort((a, b) => a - b).join(',')
}

// Calculate starting items penalty using core-specific data if available
function calculateStartingItemsPenaltyFromCoreData(
  participant: ParticipantForPenalty,
  coreStarting: Record<string, { games: number; wins: number }> | null | undefined,
  globalStarting: Record<string, { games: number; wins: number }> | undefined
): { penalty: number; details?: StartingItemsPenaltyDetail; usedFallback: boolean } {
  if (!participant.firstBuy) {
    console.log(`[StartingItems] No firstBuy provided`)
    return { penalty: 0, usedFallback: false }
  }

  const useCoreData = coreStarting && Object.keys(coreStarting).length > 0
  const startingData = useCoreData ? coreStarting : globalStarting
  console.log(`[StartingItems] Using ${useCoreData ? 'CORE' : 'GLOBAL'} starting data. firstBuy=${participant.firstBuy}, options=${Object.keys(startingData || {}).length}`)
  
  if (!startingData || Object.keys(startingData).length === 0) return { penalty: 0, usedFallback: !useCoreData }

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 30

  // Normalize player's key for order-independent comparison
  const playerKey = normalizeStarterKey(participant.firstBuy)

  // Normalize all keys for comparison and merge duplicates that become identical after normalization
  const normalizedData: Record<string, { games: number; wins: number }> = {}
  for (const [key, stats] of Object.entries(startingData)) {
    const normalizedKey = normalizeStarterKey(key)
    if (normalizedData[normalizedKey]) {
      normalizedData[normalizedKey].games += stats.games
      normalizedData[normalizedKey].wins += stats.wins
    } else {
      normalizedData[normalizedKey] = { games: stats.games, wins: stats.wins }
    }
  }

  const startingWithPriority = Object.entries(normalizedData)
    .map(([key, stats]) => {
      const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const confidence = Math.min(1, 0.5 + (0.5 * (stats.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return { key, games: stats.games, winrate, confidence }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate)

  console.log(`[StartingItems] After MIN_GAMES filter: ${startingWithPriority.length} options with 10+ games`)

  if (startingWithPriority.length === 0) return { penalty: 0, usedFallback: !useCoreData }

  const playerIndex = startingWithPriority.findIndex(s => s.key === playerKey)
  let playerStarting = playerIndex >= 0 ? startingWithPriority[playerIndex] : null
  let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

  console.log(`[StartingItems] Player key="${playerKey}", found=${playerIndex >= 0}, rank=${playerRank}`)

  // Check low sample using normalized data
  if (!playerStarting && normalizedData[playerKey]) {
    const lowSample = normalizedData[playerKey]
    if (lowSample.games >= 1) {
      playerRank = startingWithPriority.length + 1
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      playerStarting = {
        key: playerKey,
        games: lowSample.games,
        winrate: lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0,
        confidence,
      }
      console.log(`[StartingItems] Low sample fallback: games=${lowSample.games}, winrate=${playerStarting.winrate.toFixed(1)}`)
    }
  }

  // Parse item IDs from the key
  const itemIds = playerKey.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id))

  if (!playerStarting) {
    return {
      penalty: 5,
      details: {
        itemIds,
        penalty: 5,
        reason: 'off-meta',
        topWinrate: startingWithPriority[0]?.winrate,
        rank: -1,
        totalOptions: startingWithPriority.length,
      },
      usedFallback: !useCoreData,
    }
  }

  const score = calculateRankBasedScore(playerRank, startingWithPriority.length)
  const isTop5 = playerRank <= 5
  const basePenalty = ((100 - score) / 100) * 10 // Max 10 penalty for starting items
  const penalty = basePenalty * playerStarting.confidence

  return {
    penalty,
    details: {
      itemIds,
      penalty,
      reason: isTop5 ? 'optimal' : 'suboptimal',
      playerWinrate: playerStarting.winrate,
      topWinrate: startingWithPriority[0].winrate,
      rank: playerRank,
      totalOptions: startingWithPriority.length,
    },
    usedFallback: !useCoreData,
  }
}
