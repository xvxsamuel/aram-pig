// Build order utilities - core extraction and normalization
import type { MatchTimeline } from '@/types/match'
import itemsData from '@/data/items.json'
import { extractItemPurchases } from '../item-history'

const items = itemsData as Record<string, { itemType?: string; totalCost?: number }>

// ============================================================================
// CONSTANTS
// ============================================================================

/** All boot item IDs (tier 1 + tier 2) */
export const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158])

/** Tier 1 boots (not a "completed" boot) */
export const TIER1_BOOTS = 1001

/** Normalized boot ID for core key grouping */
export const BOOTS_NORMALIZED = 99999

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an item is a boot (any tier)
 */
export function isBootItem(itemId: number): boolean {
  return BOOT_IDS.has(itemId)
}

/**
 * Check if an item is a completed item (legendary, finished boots, or mythic)
 */
export function isCompletedItem(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots' || type === 'mythic'
}

/**
 * Check if an item is a legendary or completed boots (not tier 1)
 * This filters out tier 1 boots which are components, not finished items
 */
export function isLegendaryOrFinishedBoots(itemId: number): boolean {
  // tier 1 boots are not completed
  if (itemId === TIER1_BOOTS) return false
  
  // finished boots are completed
  if (BOOT_IDS.has(itemId)) return true
  
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'mythic'
}

/**
 * Normalize a boot ID to the standard value (99999) for core grouping
 */
export function normalizeBootId(itemId: number): number {
  return BOOT_IDS.has(itemId) ? BOOTS_NORMALIZED : itemId
}

// ============================================================================
// CORE EXTRACTION
// ============================================================================

/**
 * Extract first 3 NON-BOOT completed items from build order string
 * Returns the actual item IDs in purchase order (no boots)
 * 
 * @param buildOrder - Comma-separated item IDs from timeline
 * @param finalItems - Final item slots as fallback
 */
export function extractCoreItems(
  buildOrder: string | null,
  finalItems?: number[]
): number[] {
  const coreItems: number[] = []

  if (buildOrder) {
    // parse build order to get purchase sequence
    const buildOrderItems = buildOrder
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id) && id > 0)

    // find first 3 NON-BOOT completed items
    const seen = new Set<number>()
    for (const itemId of buildOrderItems) {
      if (coreItems.length >= 3) break
      // Skip boots entirely for core identification
      if (BOOT_IDS.has(itemId)) continue
      // check if completed legendary and not already in core
      if (isLegendaryOrFinishedBoots(itemId) && !seen.has(itemId)) {
        coreItems.push(itemId)
        seen.add(itemId)
      }
    }
  }

  // fallback to final items if build order insufficient
  if (coreItems.length < 3 && finalItems) {
    const completedFinalItems = finalItems.filter(
      id => id > 0 && isLegendaryOrFinishedBoots(id) && !BOOT_IDS.has(id)
    )
    for (const itemId of completedFinalItems) {
      if (coreItems.length >= 3) break
      if (!coreItems.includes(itemId)) {
        coreItems.push(itemId)
      }
    }
  }

  return coreItems.slice(0, 3)
}

/**
 * Create a sorted core key from 3 non-boot items
 * Returns underscore-separated string (e.g., "3031_6672_6675")
 */
export function createCoreKey(coreItems: number[]): string | null {
  // Filter out any boots that might have slipped through
  const nonBootItems = coreItems.filter(id => !BOOT_IDS.has(id))
  if (nonBootItems.length !== 3) return null
  
  // sort for consistent key
  const sorted = [...nonBootItems].sort((a, b) => a - b)
  
  // ensure 3 unique items
  const unique = [...new Set(sorted)]
  if (unique.length !== 3) return null

  return unique.join('_')
}

/**
 * Extract and normalize core key from build order
 * Combines extraction and key creation in one call
 * 
 * @param buildOrder - Comma-separated item IDs from timeline
 * @param finalItems - Final item slots as fallback
 */
export function extractAndNormalizeCoreKey(
  buildOrder: string | null,
  finalItems?: number[]
): string | null {
  const coreItems = extractCoreItems(buildOrder, finalItems)
  return createCoreKey(coreItems)
}

// ============================================================================
// BUILD ORDER EXTRACTION FROM TIMELINE
// ============================================================================

/**
 * Extract build order from timeline (all items in purchase order, with undos handled)
 * Uses extractItemPurchases which properly handles ITEM_UNDO events
 * 
 * @param timeline - Match timeline from Riot API
 * @param participantId - Participant ID (1-10)
 */
export function extractBuildOrder(
  timeline: MatchTimeline | null | undefined,
  participantId: number
): number[] {
  if (!timeline) return []

  const purchases = extractItemPurchases(timeline, participantId)
  return purchases.map(p => p.itemId)
}

/**
 * Extract build order filtered to completed items that are in final inventory
 * This is what should be stored in match_data.buildOrder
 * 
 * @param timeline - Match timeline from Riot API
 * @param participantId - Participant ID (1-10)
 * @param finalItems - Final item slots to validate against
 */
export function extractCompletedBuildOrder(
  timeline: MatchTimeline | null | undefined,
  participantId: number,
  finalItems: number[]
): number[] {
  if (!timeline) return []

  const purchases = extractItemPurchases(timeline, participantId)
  const finalItemSet = new Set(finalItems)

  // filter to completed items that are still in final inventory
  return purchases
    .filter(p => 
      isCompletedItem(p.itemId) && 
      finalItemSet.has(p.itemId)
    )
    .map(p => p.itemId)
    .slice(0, 6) // max 6 items
}

/**
 * Format build order as a compact string for storage
 */
export function formatBuildOrder(buildOrder: number[]): string | null {
  if (buildOrder.length === 0) return null
  return buildOrder.join(',')
}

/**
 * Parse build order string back to array
 */
export function parseBuildOrder(buildOrderString: string | null): number[] {
  if (!buildOrderString) return []
  return buildOrderString
    .split(',')
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id))
}
