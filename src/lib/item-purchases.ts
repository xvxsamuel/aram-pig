// helper functions for extracting item purchase order from match timeline data
// timeline contains ITEM_PURCHASED events that tell us what items were bought and when

import { extractItemPurchases } from './item-purchase-history'
import type { MatchTimeline } from './riot-api'
import itemsData from '../data/items.json'

// type for items.json structure
interface ItemData {
  name: string
  totalCost: number
  [key: string]: unknown
}

const items = itemsData as Record<string, ItemData>

// ARAM starting gold is 1400
const ARAM_STARTING_GOLD = 1400

// Time window for starter items (30 seconds from first purchase)
const STARTER_TIME_WINDOW = 30000

// Hard cap at 1 minute after game start
const MAX_STARTER_TIME = 60000

/**
 * Get item cost from items.json
 * Returns 0 for unknown items (free items like Poro-Snax)
 */
function getItemCost(itemId: number): number {
  const item = items[String(itemId)]
  return item?.totalCost ?? 0
}

/**
 * Extract first buy (items purchased at game start in ARAM)
 * In ARAM, players start with 1400 gold
 * We capture items purchased within 30 seconds of first buy AND within 1 minute of game start
 * AND until total cost exceeds starting gold budget
 * Accounts for undos and sells via extractItemPurchases
 * @param timeline - Match timeline data from Riot API
 * @param participantId - Participant ID (1-10)
 * @returns Array of item IDs purchased at game start, or empty array if unavailable
 */
export function extractFirstBuy(
  timeline: MatchTimeline | null | undefined,
  participantId: number
): number[] {
  if (!timeline) return []
  
  // use extractItemPurchases which handles undos and sells correctly
  const allPurchases = extractItemPurchases(timeline, participantId)
  
  // find first purchase timestamp for time window
  const firstPurchaseTime = allPurchases.find(p => p.action === 'buy')?.timestamp ?? 0
  const cutoffTime = Math.min(firstPurchaseTime + STARTER_TIME_WINDOW, MAX_STARTER_TIME)
  
  // collect items until we exceed gold budget OR time window
  const firstBuyItems: number[] = []
  let totalGold = 0
  
  for (const purchase of allPurchases) {
    if (purchase.action !== 'buy') continue
    
    // stop if outside time window
    if (purchase.timestamp > cutoffTime) break
    
    const itemCost = getItemCost(purchase.itemId)
    
    // if adding this item would exceed budget, stop
    if (totalGold + itemCost > ARAM_STARTING_GOLD) break
    
    firstBuyItems.push(purchase.itemId)
    totalGold += itemCost
  }
  
  return firstBuyItems
}

/**
 * Format first buy as a compact string for storage
 * @param firstBuy - Array of item IDs
 * @returns Comma-separated string like "1036,2031" or null if empty
 */
export function formatFirstBuy(firstBuy: number[]): string | null {
  if (firstBuy.length === 0) {
    return null
  }
  return firstBuy.join(',')
}

/**
 * Parse first buy string back to array
 * @param firstBuyString - Comma-separated string like "1036,2031"
 * @returns Array of item IDs
 */
export function parseFirstBuy(firstBuyString: string | null): number[] {
  if (!firstBuyString) {
    return []
  }
  return firstBuyString.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id))
}

/**
 * Extract build order from timeline (all items in purchase order)
 * This captures the complete purchase history including components and completed items
 * @param timeline - Match timeline data from Riot API
 * @param participantId - Participant ID (1-10)
 * @returns Array of item IDs in purchase order (e.g. [1036, 3134, 3078, 3074, 3742])
 */
export function extractBuildOrder(
  timeline: MatchTimeline | null | undefined,
  participantId: number
): number[] {
  if (!timeline?.info?.frames) {
    return []
  }

  const allItems: Array<{ timestamp: number; itemId: number }> = []

  // Iterate through all frames and collect ITEM_PURCHASED events for all items
  for (const frame of timeline.info.frames) {
    if (!frame.events) continue

    for (const event of frame.events) {
      if (
        event.type === 'ITEM_PURCHASED' &&
        event.participantId === participantId &&
        event.itemId !== undefined &&
        event.itemId !== 0
      ) {
        allItems.push({
          timestamp: event.timestamp,
          itemId: event.itemId
        })
      }
    }
  }

  // Sort by timestamp to ensure correct order
  allItems.sort((a, b) => a.timestamp - b.timestamp)

  // Return just the item IDs in order
  return allItems.map(item => item.itemId)
}

/**
 * Format build order as a compact string for storage
 * @param buildOrder - Array of item IDs
 * @returns Comma-separated string like "3078,3074,3742" or null if empty
 */
export function formatBuildOrder(buildOrder: number[]): string | null {
  if (buildOrder.length === 0) {
    return null
  }
  return buildOrder.join(',')
}

/**
 * Parse build order string back to array
 * @param buildOrderString - Comma-separated string like "3078,3074,3742"
 * @returns Array of item IDs
 */
export function parseBuildOrder(buildOrderString: string | null): number[] {
  if (!buildOrderString) {
    return []
  }
  return buildOrderString.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id))
}
