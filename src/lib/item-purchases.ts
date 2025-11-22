// helper functions for extracting item purchase order from match timeline data
// timeline contains ITEM_PURCHASED events that tell us what items were bought and when

import { extractItemPurchases } from './item-purchase-history'
import type { MatchTimeline } from './riot-api'

/**
 * Extract first buy (items purchased up to 1400 gold within 20 seconds of first purchase)
 * Uses extractItemPurchases to handle undos/sells correctly
 * @param timeline - Match timeline data from Riot API
 * @param participantId - Participant ID (1-10)
 * @returns Array of item IDs purchased within 1400 gold budget and 20s window, or empty array if unavailable
 */
export function extractFirstBuy(
  timeline: MatchTimeline | null | undefined,
  participantId: number
): number[] {
  if (!timeline) return []
  
  // item costs for calculating starter budget
  const itemCosts: Record<number, number> = {
    1001: 300, 1004: 300, 1006: 400, 1011: 350, 1028: 400, 1029: 300, 1031: 300, 1036: 350,
    1037: 1300, 1038: 875, 1042: 400, 1043: 350, 1052: 350, 1053: 350, 1054: 350, 1055: 350,
    1056: 350, 1057: 350, 1058: 350, 2003: 50, 2031: 150, 2033: 0, 2052: 0, 3044: 0,
    3051: 800, 3057: 800, 3058: 800, 3070: 150, 3071: 800, 3076: 800, 3077: 800,
    3082: 800, 3083: 800, 3086: 800, 3089: 850, 3091: 800, 3108: 800, 3113: 800,
    3114: 800, 3115: 800, 3117: 800, 3133: 800, 3134: 800, 3135: 800, 3145: 800,
    3152: 800, 3155: 800, 3156: 800, 3158: 800, 3161: 800, 3165: 800, 3177: 800,
    3179: 800, 3181: 800, 3184: 800, 3190: 800, 3193: 800
  }
  
  const MAX_STARTING_GOLD = 1400
  const MAX_TIME_WINDOW = 20000 // 20 seconds after first purchase
  
  // use the same undo-filtering logic as build orders
  const allPurchases = extractItemPurchases(timeline, participantId)
  
  // find first purchase timestamp
  let firstPurchaseTime: number | null = null
  for (const purchase of allPurchases) {
    if (purchase.action === 'buy') {
      firstPurchaseTime = purchase.timestamp
      break
    }
  }
  
  if (firstPurchaseTime === null) return []
  
  const cutoffTime = firstPurchaseTime + MAX_TIME_WINDOW
  
  // collect items until we hit 1400 gold budget or time cutoff
  const firstBuyItems: number[] = []
  let totalCost = 0
  
  for (const purchase of allPurchases) {
    if (purchase.action !== 'buy') continue
    
    // stop if purchase is after cutoff time
    if (purchase.timestamp > cutoffTime) break
    
    const itemCost = itemCosts[purchase.itemId] || 0
    const newTotal = totalCost + itemCost
    
    // stop if adding this item would exceed starting gold
    if (newTotal > MAX_STARTING_GOLD) break
    
    firstBuyItems.push(purchase.itemId)
    totalCost = newTotal
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
