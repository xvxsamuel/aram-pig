// Item purchases - first buy and build order extraction
import { extractItemPurchases } from './item-history'
import type { MatchTimeline } from '@/types/match'
import itemsData from '@/data/items.json'

interface ItemData {
  name: string
  totalCost: number
  [key: string]: unknown
}

const items = itemsData as Record<string, ItemData>

// ARAM starting gold
const ARAM_STARTING_GOLD = 1400
const STARTER_TIME_WINDOW = 30000
const MAX_STARTER_TIME = 60000

function getItemCost(itemId: number): number {
  const item = items[String(itemId)]
  return item?.totalCost ?? 0
}

/**
 * Extract first buy (items purchased at game start in ARAM)
 */
export function extractFirstBuy(timeline: MatchTimeline | null | undefined, participantId: number): number[] {
  if (!timeline) return []

  const allPurchases = extractItemPurchases(timeline, participantId)

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
 */
export function formatFirstBuy(firstBuy: number[]): string | null {
  if (firstBuy.length === 0) return null
  return firstBuy.join(',')
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
 * Extract build order from timeline (all items in purchase order)
 */
export function extractBuildOrder(timeline: MatchTimeline | null | undefined, participantId: number): number[] {
  if (!timeline?.info?.frames) return []

  const allItems: Array<{ timestamp: number; itemId: number }> = []

  for (const frame of timeline.info.frames) {
    if (!frame.events) continue

    for (const event of frame.events) {
      const evt = event as { type: string; participantId?: number; itemId?: number; timestamp: number }
      if (
        evt.type === 'ITEM_PURCHASED' &&
        evt.participantId === participantId &&
        evt.itemId !== undefined &&
        evt.itemId !== 0
      ) {
        allItems.push({
          timestamp: evt.timestamp,
          itemId: evt.itemId,
        })
      }
    }
  }

  allItems.sort((a, b) => a.timestamp - b.timestamp)
  return allItems.map(item => item.itemId)
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
