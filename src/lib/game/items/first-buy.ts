// First buy (starter items) utilities
import type { MatchTimeline } from '@/types/match'
import { extractItemPurchases } from '../item-history'
import itemsData from '@/data/items.json'

interface ItemData {
  name: string
  totalCost: number
  [key: string]: unknown
}

const items = itemsData as Record<string, ItemData>

// ============================================================================
// CONSTANTS
// ============================================================================

/** ARAM starting gold */
export const ARAM_STARTING_GOLD = 1400

/** Time window after first purchase to consider as starter (1 minute) */
export const STARTER_TIME_WINDOW = 60000

/** Maximum time for starter items (1 minute) */
export const MAX_STARTER_TIME = 60000

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the gold cost of an item
 */
export function getItemCost(itemId: number): number {
  const item = items[String(itemId)]
  return item?.totalCost ?? 0
}

// ============================================================================
// FIRST BUY EXTRACTION
// ============================================================================

/**
 * Extract first buy (items purchased at game start in ARAM)
 * 
 * First buy criteria:
 * - Items bought within 1 minute of first purchase
 * - Total gold spent <= 1400 (ARAM starting gold)
 * - Only includes actual purchases (not refunds/undos)
 * 
 * @param timeline - Match timeline from Riot API
 * @param participantId - Participant ID (1-10)
 */
export function extractFirstBuy(
  timeline: MatchTimeline | null | undefined,
  participantId: number
): number[] {
  if (!timeline) return []

  const allPurchases = extractItemPurchases(timeline, participantId)

  // find first purchase timestamp
  const firstPurchaseTime = allPurchases.find(p => p.action === 'buy')?.timestamp ?? 0
  const cutoffTime = Math.min(firstPurchaseTime + STARTER_TIME_WINDOW, MAX_STARTER_TIME)

  const firstBuyItems: number[] = []
  let totalGold = 0

  for (const purchase of allPurchases) {
    if (purchase.action !== 'buy') continue
    if (purchase.timestamp > cutoffTime) break

    const itemCost = getItemCost(purchase.itemId)
    if (totalGold + itemCost > ARAM_STARTING_GOLD) break

    firstBuyItems.push(purchase.itemId)
    totalGold += itemCost
  }

  return firstBuyItems
}

/**
 * Format first buy as a compact string for storage
 * SORTED for order-independent comparison (1001,1053 == 1053,1001)
 */
export function formatFirstBuy(firstBuy: number[]): string | null {
  if (firstBuy.length === 0) return null
  // sort for order-independent storage/comparison
  return [...firstBuy].sort((a, b) => a - b).join(',')
}

/**
 * Parse first buy string back to array
 */
export function parseFirstBuy(firstBuyString: string | null): number[] {
  if (!firstBuyString) return []
  return firstBuyString
    .split(',')
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id))
}

/**
 * Normalize a first buy key for order-independent comparison
 * Sorts item IDs and joins with comma
 */
export function normalizeFirstBuyKey(key: string): string {
  return key
    .split(',')
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id))
    .sort((a, b) => a - b)
    .join(',')
}
