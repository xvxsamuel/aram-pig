/**
 * BUILD SCORING MODULE
 * ====================
 * 
 * Handles scoring for build choices: items, runes, spells, skills, and core builds.
 * Uses Bayesian averaging to balance winrate vs pickrate, preventing low-sample
 * high-winrate options from dominating rankings.
 * 
 * KEY CONCEPTS:
 * - Core Family: All cores with the same 2 non-boot items (boots are game-specific)
 * - Bayesian Score: Weighted average of actual winrate and prior (mean) winrate
 * - Distance-Based Scoring: Score based on gap from best option, not rank position
 * - Confidence Scaling: Low-sample data has reduced penalty impact
 */

import { createAdminClient } from '../db/supabase'
import itemsData from '@/data/items.json'
import { calculateDistanceBasedScore } from './performance-scoring'

// Item data for checking completed items
const items = itemsData as Record<string, { itemType?: string }>

/**
 * Check if an item is a completed item (legendary, boots, or mythic)
 */
export function isCompletedItem(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots' || type === 'mythic'
}

// tier 1 boots - excluded from core items entirely
export const TIER1_BOOTS = 1001

// tier 2 boots - normalized to 99999 for core combo grouping
export const TIER2_BOOT_IDS = new Set([3006, 3009, 3020, 3047, 3111, 3117, 3158])

// all boots for item scoring exclusion
export const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158])

/**
 * Normalize boot ID to a generic boot ID (99999) for core matching
 * Only tier 2 boots are normalized - tier 1 boots are excluded from core entirely
 */
export function normalizeBootId(itemId: number): number {
  return TIER2_BOOT_IDS.has(itemId) ? 99999 : itemId
}

/**
 * Create a combo key from items (sorted, boots normalized to 99999)
 * Items should already have tier 2 boots normalized and tier 1 boots filtered out
 */
export function createComboKey(items: number[]): string | null {
  // items should already be normalized (tier 2 boots = 99999, tier 1 boots excluded)
  const validItems = items.filter(id => id > 0)
  const first3 = validItems.slice(0, 3)
  if (first3.length !== 3) return null

  const uniqueSorted = [...new Set(first3)].sort((a, b) => a - b)

  if (uniqueSorted.length !== 3) return null

  return uniqueSorted.join('_')
}

/**
 * Create a spell key (sorted for order-independent matching)
 */
export function createSpellKey(spell1: number, spell2: number): string {
  return `${Math.min(spell1, spell2)}_${Math.max(spell1, spell2)}`
}

/**
 * Calculate Wilson Score Lower Bound (95% confidence)
 * This gives us the lower bound of what the "true" winrate likely is.
 * Low sample sizes get heavily penalized, high samples stay close to actual WR.
 * 
 * Formula: (p + z²/2n - z*sqrt(p(1-p)/n + z²/4n²)) / (1 + z²/n)
 * where p = winrate (0-1), n = games, z = 1.96 for 95% confidence
 * 
 * Includes a small pickrate bonus: log10(games) * 0.5
 * This helps break ties in favor of more popular/proven options.
 */
export function calculateWilsonScore(winrate: number, games: number): number {
  if (games === 0) return 0
  
  const p = winrate / 100
  const n = games
  const z = 1.96
  const z2 = z * z
  
  const denominator = 1 + z2 / n
  const centerAdjusted = p + z2 / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  const wilsonLowerBound = (centerAdjusted - spread) / denominator
  
  // Small pickrate bonus: log10(games) * 1.2
  // This gives ~3.6% bonus at 10k games, ~4.8% at 100k games
  // Helps break ties in favor of more popular/proven options
  const pickrateBonus = Math.log10(Math.max(n, 1)) * 1.2
  
  return wilsonLowerBound * 100 + pickrateBonus
}

/**
 * Calculate a combined score that considers both winrate AND pickrate using Bayesian averaging
 * This prevents obscure high-winrate options from dominating rankings
 * 
 * Formula: (games * winrate + priorGames * priorWinrate) / (games + priorGames)
 * where priorGames is based on total games for the category, creating natural weighting
 */
export function calculateBayesianScore(
  winrate: number,
  games: number,
  totalGames: number,
  overallWinrate: number = 50 // fallback prior winrate
): number {
  // Prior strength: how many "virtual games" to assume at the overall winrate
  // This is the key tuning parameter - higher = more conservative rankings
  // Using 5% of total games as the prior strength (min 10, max 100)
  const priorGames = Math.max(10, Math.min(100, totalGames * 0.05))
  
  // Bayesian average: weighted combination of actual winrate and prior winrate
  const bayesianWinrate = (games * winrate + priorGames * overallWinrate) / (games + priorGames)
  
  return bayesianWinrate
}

// ============================================================================
// TYPES
// ============================================================================

export interface ParticipantForPenalty {
  patch: string | null
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  perk0: number // keystone
  perk1?: number // primary rune 1
  perk2?: number // primary rune 2
  perk3?: number // primary rune 3
  perk4?: number // secondary rune 1
  perk5?: number // secondary rune 2
  statPerk0?: number // offense shard
  statPerk1?: number // flex shard
  statPerk2?: number // defense shard
  primaryTree?: number // primary tree ID
  secondaryTree?: number // secondary tree ID
  spell1?: number
  spell2?: number
  skillOrder?: string
  buildOrder?: string
  firstBuy?: string // comma-separated item IDs of starting items
}

export interface ItemPenaltyDetail {
  slot: number // position among non-boots (0-indexed), boots are excluded from scoring
  itemId: number
  itemName?: string
  penalty: number
  reason: 'optimal' | 'suboptimal' | 'off-meta' | 'unknown'
  playerWinrate?: number
  topWinrate?: number
  games?: number // sample size for this item at this position
  isInTop5: boolean
}

export interface StartingItemsPenaltyDetail {
  itemIds: number[]
  penalty: number
  reason: 'optimal' | 'suboptimal' | 'off-meta' | 'unknown'
  playerWinrate?: number
  topWinrate?: number
  rank?: number
  totalOptions?: number
}

export interface CoreBuildDetails {
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

export interface FallbackInfo {
  items: boolean       // true if items used global data (no core match)
  keystone: boolean    // true if keystone used global data
  spells: boolean      // true if spells used global data
  starting: boolean    // true if starting items used global data
}

export interface AllPenaltiesResult {
  itemPenalty: number
  itemDetails: ItemPenaltyDetail[]
  keystonePenalty: number
  primaryTreePenalty: number
  secondaryTreePenalty: number
  statShardsPenalty: number
  spellsPenalty: number
  skillOrderPenalty: number
  buildOrderPenalty: number
  startingItemsPenalty: number
  startingItemsDetails?: StartingItemsPenaltyDetail
  coreBuildDetails?: CoreBuildDetails
  coreKey?: string // The player's actual core build key
  matchedCoreKey?: string // The core we actually matched for data (may differ due to boots fallback)
  fallbackInfo: FallbackInfo // Tracks which categories used fallback data
  usedFallbackPatch?: boolean // Whether we used a different patch's data
  actualPatchUsed?: string // The actual patch data used
}

// Type for core build data structure
export interface CoreBuildData {
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

// Type for champion stats data from database
export interface ChampionStatsData {
  games: number
  wins?: number
  core?: Record<string, CoreBuildData>
  items?: Record<string, Record<string, { games: number; wins: number }>>
  runes?: {
    primary?: Record<string, { games: number; wins: number }>
    secondary?: Record<string, { games: number; wins: number }>
  }
  spells?: Record<string, { games: number; wins: number }>
  skills?: Record<string, { games: number; wins: number }>
  starting?: Record<string, { games: number; wins: number }>
}

// ============================================================================
// CORE FAMILY MERGING
// ============================================================================

/**
 * Merge multiple CoreBuildData objects by summing games/wins
 * Used to combine all cores with the same 2 non-boot items ("core family")
 * 
 * This is key to the scoring system: boots are too game-specific to define
 * core identity, so we treat all boot variants as the same "core family"
 */
export function mergeCoreData(cores: CoreBuildData[]): CoreBuildData {
  if (cores.length === 0) {
    return { games: 0, wins: 0 }
  }
  if (cores.length === 1) {
    return cores[0]
  }

  const merged: CoreBuildData = { games: 0, wins: 0 }

  for (const core of cores) {
    merged.games += core.games
    merged.wins += core.wins

    // Merge items: Record<itemId, Record<slot, {games, wins}>>
    if (core.items) {
      merged.items = merged.items || {}
      for (const [itemId, slots] of Object.entries(core.items)) {
        merged.items[itemId] = merged.items[itemId] || {}
        for (const [slot, stats] of Object.entries(slots)) {
          if (!merged.items[itemId][slot]) {
            merged.items[itemId][slot] = { games: 0, wins: 0 }
          }
          merged.items[itemId][slot].games += stats.games
          merged.items[itemId][slot].wins += stats.wins
        }
      }
    }

    // Merge runes
    if (core.runes) {
      merged.runes = merged.runes || {}
      // Primary runes
      if (core.runes.primary) {
        merged.runes.primary = merged.runes.primary || {}
        for (const [runeId, stats] of Object.entries(core.runes.primary)) {
          if (!merged.runes.primary[runeId]) {
            merged.runes.primary[runeId] = { games: 0, wins: 0 }
          }
          merged.runes.primary[runeId].games += stats.games
          merged.runes.primary[runeId].wins += stats.wins
        }
      }
      // Secondary runes
      if (core.runes.secondary) {
        merged.runes.secondary = merged.runes.secondary || {}
        for (const [runeId, stats] of Object.entries(core.runes.secondary)) {
          if (!merged.runes.secondary[runeId]) {
            merged.runes.secondary[runeId] = { games: 0, wins: 0 }
          }
          merged.runes.secondary[runeId].games += stats.games
          merged.runes.secondary[runeId].wins += stats.wins
        }
      }
      // Tertiary runes (stat shards)
      if (core.runes.tertiary) {
        merged.runes.tertiary = merged.runes.tertiary || {}
        for (const shardType of ['offense', 'flex', 'defense'] as const) {
          if (core.runes.tertiary[shardType]) {
            merged.runes.tertiary[shardType] = merged.runes.tertiary[shardType] || {}
            for (const [shardId, stats] of Object.entries(core.runes.tertiary[shardType]!)) {
              if (!merged.runes.tertiary[shardType]![shardId]) {
                merged.runes.tertiary[shardType]![shardId] = { games: 0, wins: 0 }
              }
              merged.runes.tertiary[shardType]![shardId].games += stats.games
              merged.runes.tertiary[shardType]![shardId].wins += stats.wins
            }
          }
        }
      }
    }

    // Merge spells
    if (core.spells) {
      merged.spells = merged.spells || {}
      for (const [spellKey, stats] of Object.entries(core.spells)) {
        if (!merged.spells[spellKey]) {
          merged.spells[spellKey] = { games: 0, wins: 0 }
        }
        merged.spells[spellKey].games += stats.games
        merged.spells[spellKey].wins += stats.wins
      }
    }

    // Merge starting items
    if (core.starting) {
      merged.starting = merged.starting || {}
      for (const [startKey, stats] of Object.entries(core.starting)) {
        if (!merged.starting[startKey]) {
          merged.starting[startKey] = { games: 0, wins: 0 }
        }
        merged.starting[startKey].games += stats.games
        merged.starting[startKey].wins += stats.wins
      }
    }
  }

  return merged
}

// ============================================================================
// CORE BUILD PENALTY
// ============================================================================

/**
 * Rank cores for a champion using Wilson Score (same as champion page)
 * Returns cores sorted by Wilson Score descending, with minimum game/winrate filters
 */
export function rankChampionCores(
  coreData: Record<string, CoreBuildData> | undefined,
  championWinrate: number = 50,
  minGames: number = 100
): Array<{
  key: string
  games: number
  wins: number
  winrate: number
  wilsonScore: number
}> {
  if (!coreData) return []

  return Object.entries(coreData)
    .map(([key, data]) => {
      const winrate = data.games > 0 ? (data.wins / data.games) * 100 : 0
      const wilsonScore = calculateWilsonScore(winrate, data.games)
      // Check core has exactly 3 items
      const itemCount = key.split('_').length
      return {
        key,
        games: data.games,
        wins: data.wins,
        winrate,
        wilsonScore,
        itemCount,
      }
    })
    // Filter: exactly 3 items, minimum games, winrate at least (champion average - 5%)
    .filter(c => c.itemCount === 3 && c.games >= minGames && c.winrate >= (championWinrate - 5))
    .sort((a, b) => b.wilsonScore - a.wilsonScore)
    .map(({ itemCount: _itemCount, ...rest }) => rest) // Remove itemCount from output
}

/**
 * Calculate core build penalty (simplified)
 * 
 * Approach:
 * 1. Rank all cores using Wilson Score (same as champion page)
 * 2. #1 ranked core = 100 pig (baseline)
 * 3. Try exact match first, then family match (2+ items overlap)
 * 4. If player WR >= #1 WR: no penalty (100 pig)
 * 5. If player WR < #1 WR: penalty based on winrate difference
 */
export function calculateCoreBuildPenalty(
  playerCoreKey: string | null,
  coreData: Record<string, CoreBuildData> | undefined,
  championWinrate: number = 50
): CoreBuildDetails {
  if (!playerCoreKey || !coreData) return { penalty: 0, playerCoreKey: playerCoreKey || undefined, globalWinrate: championWinrate }

  const MIN_EXACT_GAMES = 10
  
  // Get ranked cores (using 100 game minimum like champion page)
  const rankedCores = rankChampionCores(coreData, championWinrate, 100)
  
  if (rankedCores.length === 0) return { penalty: 0, playerCoreKey, globalWinrate: championWinrate }

  const bestCore = rankedCores[0]
  const playerItems = playerCoreKey.split('_').map(Number)
  const playerItemSet = new Set(playerItems)

  // PRIORITY 1: Try exact match first
  let playerGames = 0
  let playerWins = 0
  let matchedCoreKey: string | undefined

  const exactMatch = coreData[playerCoreKey]
  if (exactMatch && exactMatch.games >= MIN_EXACT_GAMES) {
    playerGames = exactMatch.games
    playerWins = exactMatch.wins
    matchedCoreKey = playerCoreKey
  }
  
  // PRIORITY 2: Fall back to family matching (2+ items overlap)
  if (playerGames < MIN_EXACT_GAMES) {
    const matchingCores: { key: string; data: CoreBuildData; overlap: number }[] = []
    
    for (const [key, data] of Object.entries(coreData)) {
      if (key === playerCoreKey) continue
      
      const coreKeyItems = key.split('_').map(Number)
      let overlap = 0
      for (const item of coreKeyItems) {
        if (playerItemSet.has(item)) overlap++
      }
      
      if (overlap >= 2) {
        matchingCores.push({ key, data, overlap })
      }
    }
    
    if (matchingCores.length > 0) {
      // Sum all matching cores
      for (const { key, data, overlap } of matchingCores) {
        playerGames += data.games
        playerWins += data.wins
        // Track best match (prefer higher overlap, then more games)
        if (!matchedCoreKey || overlap === 3) {
          matchedCoreKey = key
        }
      }
      
      // Add exact match data too if it exists but was below threshold
      if (exactMatch) {
        playerGames += exactMatch.games
        playerWins += exactMatch.wins
      }
    }
  }
  
  if (playerGames < MIN_EXACT_GAMES) {
    // Unknown/rare core - moderate penalty
    return {
      penalty: 10,
      topWinrate: bestCore.winrate,
      totalOptions: rankedCores.length,
      playerCoreKey,
      globalWinrate: championWinrate,
    }
  }

  const playerWinrate = (playerWins / playerGames) * 100
  
  // Find rank in rankedCores by exact key match
  let playerRank = rankedCores.findIndex(c => c.key === playerCoreKey) + 1
  if (playerRank === 0) {
    // Not found exact, try finding by 2+ item overlap
    for (let i = 0; i < rankedCores.length; i++) {
      const rankedItems = rankedCores[i].key.split('_').map(Number)
      let overlap = 0
      for (const item of rankedItems) {
        if (playerItemSet.has(item)) overlap++
      }
      if (overlap >= 2) {
        playerRank = i + 1
        break
      }
    }
  }

  // Simple comparison: if player WR >= best WR, no penalty
  // Otherwise penalty scales with the winrate difference
  if (playerWinrate >= bestCore.winrate) {
    return {
      penalty: 0,
      playerWinrate,
      topWinrate: bestCore.winrate,
      rank: playerRank || rankedCores.length + 1,
      totalOptions: rankedCores.length,
      games: playerGames,
      playerCoreKey,
      matchedCoreKey,
      globalWinrate: championWinrate,
    }
  }

  // Penalty based on winrate gap from #1
  // Each 1% below best core = ~1 penalty point (max 20)
  const winrateDiff = bestCore.winrate - playerWinrate
  const penalty = Math.min(20, winrateDiff)

  return {
    penalty,
    playerWinrate,
    topWinrate: bestCore.winrate,
    rank: playerRank || rankedCores.length + 1,
    totalOptions: rankedCores.length,
    games: playerGames,
    playerCoreKey,
    matchedCoreKey,
    globalWinrate: championWinrate,
  }
}

// ============================================================================
// ITEM PENALTY (Non-Boot Items Only, Position-Aware)
// ============================================================================

/**
 * Get non-boot items for a specific non-boot position
 * 
 * The challenge: DB stores items by their actual build position (1-6, including boots).
 * We need to find items that were the Nth non-boot item.
 * 
 * Since we don't have per-game tracking of "which position was this item among non-boots",
 * we approximate by looking at items in positions that are likely to be the Nth non-boot.
 * 
 * For non-boot position N (0-indexed):
 * - Position 0: Look at actual positions 1-2 (first non-boot is usually 1st or 2nd item)
 * - Position 1: Look at actual positions 2-3
 * - Position 2: Look at actual positions 3-4
 * - Position 3: Look at actual positions 4-5
 * - Position 4: Look at actual positions 5-6
 * 
 * This is imperfect but gives reasonable position-aware comparison.
 */
function getNonBootItemsForPosition(
  itemsByPosition: Record<string, Record<string, { games: number; wins: number }>> | undefined,
  nonBootPosition: number
): Record<string, { games: number; wins: number }> {
  const result: Record<string, { games: number; wins: number }> = {}
  
  if (!itemsByPosition) return result
  
  // Map non-boot position to likely actual positions
  // nonBootPosition 0 -> positions 1,2 (first non-boot could be 1st or 2nd overall)
  // nonBootPosition 1 -> positions 2,3
  // etc.
  const startPos = nonBootPosition + 1
  const endPos = nonBootPosition + 2
  
  for (let pos = startPos; pos <= endPos && pos <= 6; pos++) {
    const positionItems = itemsByPosition[pos.toString()]
    if (!positionItems) continue
    
    for (const [itemId, stats] of Object.entries(positionItems)) {
      // Skip boots
      if (BOOT_IDS.has(parseInt(itemId))) continue
      
      if (!result[itemId]) {
        result[itemId] = { games: 0, wins: 0 }
      }
      result[itemId].games += stats.games
      result[itemId].wins += stats.wins
    }
  }
  
  return result
}

/**
 * Convert CoreBuildData items format to position-based format
 * CoreBuildData: items[itemId][position] = stats
 * We need: items[position][itemId] = stats
 */
function convertCoreItemsToPositionFormat(
  coreItems: Record<string, Record<string, { games: number; wins: number }>> | undefined
): Record<string, Record<string, { games: number; wins: number }>> {
  if (!coreItems) return {}
  
  const result: Record<string, Record<string, { games: number; wins: number }>> = {}
  
  for (const [itemId, positions] of Object.entries(coreItems)) {
    for (const [position, stats] of Object.entries(positions)) {
      if (!result[position]) result[position] = {}
      result[position][itemId] = stats
    }
  }
  
  return result
}

/**
 * Calculate item penalty - EXCLUDES BOOTS, POSITION-AWARE
 * 
 * Boots are game-dependent (need vs don't need) so we don't score them.
 * Non-boot items are scored by comparing to other non-boot items in similar positions:
 * - Your 1st non-boot item is compared against items commonly built as 1st non-boot
 * - Your 2nd non-boot item is compared against items commonly built as 2nd non-boot
 * - etc.
 */
export function calculateItemPenaltyFromCoreData(
  participant: ParticipantForPenalty,
  playerCoreItems: number[],
  coreData: CoreBuildData | null,
  globalItems: Record<string, Record<string, { games: number; wins: number }>> | undefined,
  _totalGames: number
): { totalPenalty: number; details: ItemPenaltyDetail[] } {
  const details: ItemPenaltyDetail[] = []

  // Require build order from timeline
  if (!participant.buildOrder) {
    return { totalPenalty: 0, details }
  }

  // Get final items from participant (what they ended the game with)
  const finalItems = new Set([
    participant.item0, participant.item1, participant.item2,
    participant.item3, participant.item4, participant.item5
  ].filter(id => id > 0))

  // Get completed items in BUILD ORDER that are ALSO in final inventory
  const allPurchasedItems = participant.buildOrder
    .split(',')
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id) && id > 0)
  
  const completedItemsInOrder = allPurchasedItems.filter(id => 
    isCompletedItem(id) && finalItems.has(id)
  )

  // Only score non-boots - boots are game-dependent and excluded from scoring
  const nonBootItemsInOrder = completedItemsInOrder.filter(id => !BOOT_IDS.has(id))

  // Convert core items to position format
  const coreItemsByPosition = coreData?.items ? convertCoreItemsToPositionFormat(coreData.items) : undefined

  const MIN_GAMES_THRESHOLD = 10
  const FULL_CONFIDENCE_GAMES = 30

  // Score each non-boot item by its position among non-boots
  for (let nonBootPosition = 0; nonBootPosition < nonBootItemsInOrder.length && nonBootPosition < 5; nonBootPosition++) {
    const playerItemId = nonBootItemsInOrder[nonBootPosition]
    if (!playerItemId || playerItemId === 0) continue

    // Get items for this non-boot position from both sources
    const corePositionItems = getNonBootItemsForPosition(coreItemsByPosition, nonBootPosition)
    const globalPositionItems = getNonBootItemsForPosition(globalItems, nonBootPosition)
    
    // Check if core data has enough games for this specific item
    const coreItemData = corePositionItems[playerItemId.toString()]
    
    // Use core data if the player's item has 10+ games there, otherwise use global
    const useCoreForThisItem = coreItemData && coreItemData.games >= MIN_GAMES_THRESHOLD
    const positionItems = useCoreForThisItem ? corePositionItems : globalPositionItems

    if (Object.keys(positionItems).length === 0) {
      details.push({ 
        slot: nonBootPosition, 
        itemId: playerItemId, 
        penalty: 0, 
        reason: 'unknown', 
        isInTop5: false 
      })
      continue
    }

    // Rank items by Wilson score (lower bound of 95% confidence interval)
    const itemsWithPriority = Object.entries(positionItems)
      .map(([itemId, stats]) => {
        const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
        const confidence = Math.min(
          1,
          0.5 + (0.5 * (stats.games - MIN_GAMES_THRESHOLD)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES_THRESHOLD)
        )
        return {
          itemId: parseInt(itemId),
          games: stats.games,
          winrate,
          confidence,
          wilsonScore: calculateWilsonScore(winrate, stats.games),
        }
      })
      .filter(item => item.games >= MIN_GAMES_THRESHOLD)
      .sort((a, b) => b.wilsonScore - a.wilsonScore)

    if (itemsWithPriority.length === 0) {
      details.push({ 
        slot: nonBootPosition,
        itemId: playerItemId, 
        penalty: 0, 
        reason: 'unknown', 
        isInTop5: false 
      })
      continue
    }

    // Find player's item in rankings
    const playerIndex = itemsWithPriority.findIndex(i => i.itemId === playerItemId)
    const playerItem = playerIndex >= 0 ? itemsWithPriority[playerIndex] : null
    const playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

    // If player's item not found with enough games, it's off-meta
    if (!playerItem) {
      details.push({
        slot: nonBootPosition,
        itemId: playerItemId,
        penalty: 10,
        reason: 'off-meta',
        topWinrate: itemsWithPriority[0]?.winrate,
        isInTop5: false,
      })
      continue
    }

    // Use distance-based scoring with Wilson scores
    const bestWilson = itemsWithPriority[0]?.wilsonScore ?? 50
    const score = calculateDistanceBasedScore(playerItem.wilsonScore, bestWilson)
    const isInTop5 = playerRank <= 5
    const basePenalty = ((100 - score) / 100) * 20
    const penaltyAmount = basePenalty * playerItem.confidence

    details.push({
      slot: nonBootPosition,
      itemId: playerItemId,
      penalty: penaltyAmount,
      reason: isInTop5 ? 'optimal' : 'suboptimal',
      playerWinrate: playerItem.winrate, // always has 10+ games now due to fallback logic
      topWinrate: itemsWithPriority[0].winrate,
      games: playerItem.games,
      isInTop5,
    })
  }

  // Sort details by slot for consistent display
  details.sort((a, b) => a.slot - b.slot)

  // Average the penalties instead of summing
  const avgPenalty = details.length > 0 
    ? details.reduce((sum, d) => sum + d.penalty, 0) / details.length 
    : 0

  return { totalPenalty: Math.min(20, avgPenalty), details }
}

// ============================================================================
// KEYSTONE PENALTY
// ============================================================================

/**
 * Calculate keystone penalty using core-specific data if available
 */
export function calculateKeystonePenaltyFromCoreData(
  participant: ParticipantForPenalty,
  coreRunes: Record<string, { games: number; wins: number }> | null | undefined,
  globalRunes: Record<string, { games: number; wins: number }> | undefined
): number {
  if (!participant.perk0) return 0

  const runeData = coreRunes && Object.keys(coreRunes).length > 0 ? coreRunes : globalRunes
  if (!runeData || Object.keys(runeData).length === 0) return 0

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 50

  const runeEntries = Object.entries(runeData)

  const runesWithPriority = runeEntries
    .map(([runeId, stats]) => {
      const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const confidence = Math.min(1, 0.5 + (0.5 * (stats.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        runeId: parseInt(runeId),
        games: stats.games,
        winrate,
        confidence,
        wilsonScore: calculateWilsonScore(winrate, stats.games),
      }
    })
    .filter(r => r.games >= MIN_GAMES)
    .sort((a, b) => b.wilsonScore - a.wilsonScore)

  if (runesWithPriority.length === 0) return 0

  const playerIndex = runesWithPriority.findIndex(r => r.runeId === participant.perk0)
  let playerRune = playerIndex >= 0 ? runesWithPriority[playerIndex] : null

  // Check low sample
  if (!playerRune && runeData[participant.perk0.toString()]) {
    const lowSample = runeData[participant.perk0.toString()]
    if (lowSample.games >= 1) {
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      const winrate = lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0
      playerRune = {
        runeId: participant.perk0,
        games: lowSample.games,
        winrate,
        confidence,
        wilsonScore: calculateWilsonScore(winrate, lowSample.games),
      }
    }
  }

  if (!playerRune) return 8

  // Use distance-based scoring with Wilson scores
  const bestWilson = runesWithPriority[0]?.wilsonScore ?? 50
  const score = calculateDistanceBasedScore(playerRune.wilsonScore, bestWilson)
  const basePenalty = ((100 - score) / 100) * 20
  return basePenalty * playerRune.confidence
}

// ============================================================================
// SPELLS PENALTY
// ============================================================================

/**
 * Calculate spells penalty using core-specific data if available
 * 
 * Approach:
 * 1. Rank spell combos by Wilson Score
 * 2. Top combo = 100 (baseline)
 * 3. Player's score = (playerWinrate / topWinrate) * 100
 * 4. Penalty based on how far below 100
 */
export function calculateSpellsPenaltyFromCoreData(
  participant: ParticipantForPenalty,
  coreSpells: Record<string, { games: number; wins: number }> | null | undefined,
  globalSpells: Record<string, { games: number; wins: number }> | undefined
): number {
  if (!participant.spell1 || !participant.spell2) return 0

  const spellData = coreSpells && Object.keys(coreSpells).length > 0 ? coreSpells : globalSpells
  if (!spellData || Object.keys(spellData).length === 0) return 0

  const MIN_GAMES = 10

  const playerKey = createSpellKey(participant.spell1, participant.spell2)

  // rank all spell combos by wilson score
  const rankedSpells = Object.entries(spellData)
    .map(([key, stats]) => ({
      key,
      games: stats.games,
      winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
      wilsonScore: calculateWilsonScore(stats.games > 0 ? (stats.wins / stats.games) * 100 : 0, stats.games),
    }))
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.wilsonScore - a.wilsonScore)

  if (rankedSpells.length === 0) return 0

  const topSpell = rankedSpells[0]
  
  // find player's spell combo
  const playerSpell = rankedSpells.find(s => s.key === playerKey)
  
  // check low sample if not in ranked list
  if (!playerSpell) {
    const lowSample = spellData[playerKey]
    if (lowSample && lowSample.games >= 1) {
      const playerWinrate = lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0
      // low sample: partial penalty, scale by games
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      const score = topSpell.winrate > 0 ? (playerWinrate / topSpell.winrate) * 100 : 50
      const basePenalty = Math.max(0, ((100 - score) / 100) * 15)
      return basePenalty * confidence
    }
    // not found at all
    return 5
  }

  // player's score = (playerWinrate / topWinrate) * 100
  // if player >= top, score = 100, no penalty
  if (playerSpell.winrate >= topSpell.winrate) return 0
  
  const score = topSpell.winrate > 0 ? (playerSpell.winrate / topSpell.winrate) * 100 : 100
  const penalty = Math.max(0, ((100 - score) / 100) * 15)
  return penalty
}

// ============================================================================
// SKILL ORDER PENALTY
// ============================================================================

/**
 * Rank skill orders for a champion using Wilson Score
 * Returns skill orders sorted by Wilson Score descending
 */
export function rankSkillOrders(
  skillsData: Record<string, { games: number; wins: number }> | undefined,
  minGames: number = 100
): Array<{
  key: string
  games: number
  wins: number
  winrate: number
  wilsonScore: number
}> {
  if (!skillsData) return []

  return Object.entries(skillsData)
    .map(([key, data]) => {
      const winrate = data.games > 0 ? (data.wins / data.games) * 100 : 0
      const wilsonScore = calculateWilsonScore(winrate, data.games)
      return {
        key,
        games: data.games,
        wins: data.wins,
        winrate,
        wilsonScore,
      }
    })
    .filter(s => s.games >= minGames)
    .sort((a, b) => b.wilsonScore - a.wilsonScore)
}

/**
 * Calculate skill order penalty (simplified - same approach as cores)
 * 
 * Approach:
 * 1. Rank all skill orders using Wilson Score
 * 2. #1 ranked skill order = 100 pig (baseline)
 * 3. Compare player's skill winrate to #1's winrate
 * 4. If player WR >= #1 WR: no penalty
 * 5. If player WR < #1 WR: penalty based on winrate difference
 */
export function calculateSkillOrderPenaltyFromData(
  participant: ParticipantForPenalty,
  championData: ChampionStatsData
): number {
  if (!participant.skillOrder || !championData?.skills) return 0

  // Use lower threshold for pig score to catch more player skill orders
  const MIN_GAMES_PIG = 10
  
  // Get ranked skill orders (using 100 game minimum for reliable data)
  const rankedSkills = rankSkillOrders(championData.skills, 100)
  
  if (rankedSkills.length === 0) return 0

  const bestSkill = rankedSkills[0]

  // Find player's skill order in the data (not the ranked list - may have fewer games)
  const playerSkillData = championData.skills[participant.skillOrder]
  
  if (!playerSkillData || playerSkillData.games < MIN_GAMES_PIG) {
    // Unknown/rare skill order - moderate penalty
    return 10
  }

  const playerWinrate = (playerSkillData.wins / playerSkillData.games) * 100

  // Simple comparison: if player WR >= best WR, no penalty
  // Otherwise penalty scales with the winrate difference (max 20)
  if (playerWinrate >= bestSkill.winrate) {
    return 0
  }

  const winrateDiff = bestSkill.winrate - playerWinrate
  return Math.min(20, winrateDiff)
}

// ============================================================================
// STARTING ITEMS PENALTY
// ============================================================================

// Potion IDs to normalize (health pot, refillable, corrupting → all become 99998)
const POTION_IDS = new Set([2003, 2031, 2033])
const NORMALIZED_POTION_ID = 99998

/**
 * Normalize a starter key:
 * 1. Sort item IDs for order-independent comparison
 * 2. Normalize all potions to a single ID (health pot, refillable, corrupting are equivalent)
 */
function normalizeStarterKey(key: string): string {
  return key
    .split(',')
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id))
    .map(id => POTION_IDS.has(id) ? NORMALIZED_POTION_ID : id)
    .sort((a, b) => a - b)
    .join(',')
}

/**
 * Calculate starting items penalty using core-specific data if available
 */
/**
 * Blend core and global starting item data
 * Uses weighted average: core data weighted higher when it has good sample size
 */
function blendStartingData(
  coreData: Record<string, { games: number; wins: number }> | null | undefined,
  globalData: Record<string, { games: number; wins: number }> | undefined
): Record<string, { games: number; wins: number }> {
  const blended: Record<string, { games: number; wins: number }> = {}
  
  // Add global data first (as base)
  if (globalData) {
    for (const [key, stats] of Object.entries(globalData)) {
      const normalizedKey = normalizeStarterKey(key)
      if (!blended[normalizedKey]) {
        blended[normalizedKey] = { games: 0, wins: 0 }
      }
      // Global data gets 50% weight
      blended[normalizedKey].games += Math.round(stats.games * 0.5)
      blended[normalizedKey].wins += Math.round(stats.wins * 0.5)
    }
  }
  
  // Add core data (gets full weight)
  if (coreData) {
    for (const [key, stats] of Object.entries(coreData)) {
      const normalizedKey = normalizeStarterKey(key)
      if (!blended[normalizedKey]) {
        blended[normalizedKey] = { games: 0, wins: 0 }
      }
      blended[normalizedKey].games += stats.games
      blended[normalizedKey].wins += stats.wins
    }
  }
  
  return blended
}

export function calculateStartingItemsPenaltyFromCoreData(
  participant: ParticipantForPenalty,
  coreStarting: Record<string, { games: number; wins: number }> | null | undefined,
  globalStarting: Record<string, { games: number; wins: number }> | undefined
): { penalty: number; details?: StartingItemsPenaltyDetail; usedFallback: boolean } {
  if (!participant.firstBuy) {
    return { penalty: 0, usedFallback: false }
  }

  const hasCoreData = coreStarting && Object.keys(coreStarting).length > 0
  const hasGlobalData = globalStarting && Object.keys(globalStarting).length > 0
  
  if (!hasCoreData && !hasGlobalData) {
    return { penalty: 0, usedFallback: true }
  }
  
  // Blend core + global data (core gets full weight, global gets 50%)
  const blendedData = blendStartingData(coreStarting, globalStarting)

  const MIN_GAMES = 10
  const FULL_CONFIDENCE_GAMES = 30

  // Normalize player's key for order-independent comparison (also normalizes potions)
  const playerKey = normalizeStarterKey(participant.firstBuy)

  // blendedData is already normalized by blendStartingData
  const normalizedData = blendedData
  const normalizedEntries = Object.entries(normalizedData)

  const startingWithPriority = normalizedEntries
    .map(([key, stats]) => {
      const winrate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const confidence = Math.min(1, 0.5 + (0.5 * (stats.games - MIN_GAMES)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES))
      return {
        key,
        games: stats.games,
        winrate,
        confidence,
        wilsonScore: calculateWilsonScore(winrate, stats.games),
      }
    })
    .filter(s => s.games >= MIN_GAMES)
    .sort((a, b) => b.wilsonScore - a.wilsonScore)

  if (startingWithPriority.length === 0) {
    return { penalty: 0, usedFallback: !hasCoreData }
  }

  const playerIndex = startingWithPriority.findIndex(s => s.key === playerKey)
  let playerStarting = playerIndex >= 0 ? startingWithPriority[playerIndex] : null
  let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

  // Check low sample using normalized data
  if (!playerStarting && normalizedData[playerKey]) {
    const lowSample = normalizedData[playerKey]
    if (lowSample.games >= 1) {
      playerRank = startingWithPriority.length + 1
      const confidence = Math.min(0.5, lowSample.games / MIN_GAMES)
      const winrate = lowSample.games > 0 ? (lowSample.wins / lowSample.games) * 100 : 0
      playerStarting = {
        key: playerKey,
        games: lowSample.games,
        winrate,
        confidence,
        wilsonScore: calculateWilsonScore(winrate, lowSample.games),
      }
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
      usedFallback: !hasCoreData,
    }
  }

  // Use distance-based scoring with Wilson scores
  const bestWilson = startingWithPriority[0]?.wilsonScore ?? 50
  const score = calculateDistanceBasedScore(playerStarting.wilsonScore, bestWilson)
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
    usedFallback: !hasCoreData, // only counts as fallback if no core data at all
  }
}

// ============================================================================
// MAIN ENTRY POINT - Calculate All Build Penalties
// ============================================================================

/**
 * Calculate all build/choice penalties using CORE BUILD CONTEXT
 * This scores items/runes/spells based on what works with YOUR specific core build
 * Accepts optional pre-fetched championData to avoid duplicate DB queries
 */
export async function calculateAllBuildPenalties(
  participant: ParticipantForPenalty,
  championName: string,
  prefetchedChampionData?: ChampionStatsData | null
): Promise<AllPenaltiesResult> {
  // Calculate player's core key from build timeline
  // Core = first 3 completed items (legendary/mythic/tier2 boots) with boots normalized to 99999
  // Tier 1 boots (1001) are excluded - they're not a meaningful item investment
  // If no buildOrder timeline data, we cannot calculate core-aware penalties
  const coreItems: number[] = []
  let playerCoreKey: string | undefined = undefined
  
  if (participant.buildOrder) {
    // Get final items from slots (including boots, for validation that items are still in inventory)
    const finalItems = [
      participant.item0, participant.item1, participant.item2,
      participant.item3, participant.item4, participant.item5
    ].filter(id => id > 0 && isCompletedItem(id))
    
    // Parse build order to get purchase sequence
    const buildOrderItems = participant.buildOrder
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id) && id > 0)
    
    // Find first 3 completed items from build order (tier 2 boots normalized to 99999)
    const seen = new Set<number>()
    for (const itemId of buildOrderItems) {
      if (coreItems.length >= 3) break
      // Skip tier 1 boots entirely - they're not a meaningful item investment
      if (itemId === TIER1_BOOTS) continue
      if (isCompletedItem(itemId) && finalItems.includes(itemId) && !seen.has(itemId)) {
        // Normalize tier 2 boots to 99999 for core matching
        const normalizedId = normalizeBootId(itemId)
        if (!seen.has(normalizedId)) {
          coreItems.push(normalizedId)
          seen.add(normalizedId)
        }
      }
    }
    
    playerCoreKey = createComboKey(coreItems) || undefined
  }
  // No fallback - if no buildOrder, playerCoreKey stays undefined

  if (!participant.patch) {
    return {
      itemPenalty: 0,
      itemDetails: [],
      keystonePenalty: 0,
      primaryTreePenalty: 0,
      secondaryTreePenalty: 0,
      statShardsPenalty: 0,
      spellsPenalty: 0,
      skillOrderPenalty: 0,
      buildOrderPenalty: 0,
      startingItemsPenalty: 0,
      coreKey: playerCoreKey,
      fallbackInfo: { items: true, keystone: true, spells: true, starting: true },
    }
  }

  // Use pre-fetched data if available, otherwise fetch from DB
  let championData: ChampionStatsData | null = prefetchedChampionData ?? null
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
    
    if (exactMatchResult?.data && (exactMatchResult.data as ChampionStatsData).games >= 2000) {
      championData = exactMatchResult.data as ChampionStatsData
      actualPatchUsed = exactMatchResult.patch
    } else {
      // Fallback: get all patches for this champion, sorted by patch desc
      const { data: allPatchesResult } = await supabase
        .from('champion_stats')
        .select('data, patch')
        .eq('champion_name', championName)
        .order('patch', { ascending: false })
        .limit(5)
      
      if (allPatchesResult && allPatchesResult.length > 0) {
        const validPatch = allPatchesResult.find(p => (p.data as ChampionStatsData)?.games >= 2000)
        if (validPatch) {
          championData = validPatch.data as ChampionStatsData
          actualPatchUsed = validPatch.patch
          usedFallbackPatch = actualPatchUsed !== participant.patch
        }
      }
    }
  }

  if (!championData) {
    return {
      itemPenalty: 0,
      itemDetails: [],
      keystonePenalty: 0,
      primaryTreePenalty: 0,
      secondaryTreePenalty: 0,
      statShardsPenalty: 0,
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

  // Find player's core build data
  // Priority 1: Exact match (same 3 items)
  // Priority 2: If no exact match, find cores containing player's items
  const coreData = championData.core
  let matchedCoreData: CoreBuildData | null = null
  let matchedCoreKey: string | null = null
  
  const MIN_EXACT_GAMES = 10  // Lower threshold for exact match
  const MIN_FAMILY_GAMES = 30 // Higher threshold for merged family

  if (coreData && playerCoreKey) {
    // PRIORITY 1: Try exact match first
    const exactMatch = coreData[playerCoreKey]
    if (exactMatch && exactMatch.games >= MIN_EXACT_GAMES) {
      matchedCoreData = exactMatch
      matchedCoreKey = playerCoreKey
    }
    
    // PRIORITY 2: Fall back to family matching if no exact match
    if (!matchedCoreData) {
      // Since cores are now always 3 non-boot items, we can match by checking
      // if 2+ items overlap (for cases where DB has different 3rd item)
      const playerItems = playerCoreKey.split('_').map(Number)
      const playerItemSet = new Set(playerItems)
      
      const matchingCores: { key: string; data: CoreBuildData; overlap: number }[] = []
      
      for (const [key, data] of Object.entries(coreData)) {
        if (key === playerCoreKey) continue // Already checked exact
        
        const coreKeyItems = key.split('_').map(Number)
        
        // Count how many items overlap
        let overlap = 0
        for (const item of coreKeyItems) {
          if (playerItemSet.has(item)) overlap++
        }
        
        // Require at least 2 overlapping items for family match
        if (overlap >= 2) {
          matchingCores.push({ key, data, overlap })
        }
      }
      
      if (matchingCores.length > 0) {
        // Sort by overlap (prefer 3-item match) then by games
        matchingCores.sort((a, b) => {
          if (b.overlap !== a.overlap) return b.overlap - a.overlap
          return b.data.games - a.data.games
        })
        
        // Merge all matching cores
        const mergedData = mergeCoreData(matchingCores.map(c => c.data))
        
        if (mergedData.games >= MIN_FAMILY_GAMES) {
          matchedCoreData = mergedData
          matchedCoreKey = `family:${matchingCores.map(c => c.key).slice(0, 3).join('+')}`
        }
      }
    }
  }

  // Calculate champion's overall winrate for baseline comparison
  const championWinrate = (championData.games && championData.wins)
    ? (championData.wins / championData.games) * 100 
    : 50

  // Calculate core build score (how good is the core itself)
  const coreBuildResult = calculateCoreBuildPenalty(playerCoreKey ?? null, coreData, championWinrate)

  // Determine if we should use core-specific data for per-slot items, runes, spells
  const useCore = matchedCoreData !== null

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
    primaryTreePenalty: 0,
    secondaryTreePenalty: 0,
    statShardsPenalty: 0,
    spellsPenalty,
    skillOrderPenalty,
    buildOrderPenalty: coreBuildResult.penalty,
    startingItemsPenalty: startingItemsResult.penalty,
    startingItemsDetails: startingItemsResult.details,
    coreBuildDetails: coreBuildResult,
    coreKey: playerCoreKey,
    matchedCoreKey: matchedCoreKey ?? undefined,
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
