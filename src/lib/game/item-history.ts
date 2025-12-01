// Item purchase history from match timeline
import type { MatchTimeline } from '@/types/match'
import itemsData from '@/data/items.json'

export interface ItemPurchaseEvent {
  itemId: number
  timestamp: number
  action: 'buy'
}

export interface CompletedItemEvent {
  itemId: number
  timestamp: number
  itemName: string
  itemType: 'legendary' | 'boots' | 'mythic' | 'other'
}

const items = itemsData as Record<string, { name?: string; itemType?: string }>

function getItemInfo(itemId: number): { name: string; type: 'legendary' | 'boots' | 'mythic' | 'other' } {
  const item = items[String(itemId)]
  if (!item) return { name: `Item ${itemId}`, type: 'other' }

  const type = item.itemType as string
  let itemType: 'legendary' | 'boots' | 'mythic' | 'other' = 'other'
  if (type === 'legendary') itemType = 'legendary'
  else if (type === 'boots') itemType = 'boots'
  else if (type === 'mythic') itemType = 'mythic'

  return { name: item.name || `Item ${itemId}`, type: itemType }
}

function isCompletedItem(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots' || type === 'mythic'
}

/**
 * Extract item purchase history from timeline, accounting for undos and sells
 */
export function extractItemPurchases(timeline: MatchTimeline, participantId: number): ItemPurchaseEvent[] {
  if (!timeline?.info?.frames) return []

  const allEvents: Array<{ type: string; itemId: number; timestamp: number }> = []

  for (const frame of timeline.info.frames) {
    const events = frame.events || []
    for (const event of events) {
      const evt = event as { type: string; participantId?: number; itemId?: number; timestamp: number }
      if (evt.participantId !== participantId) continue
      if (!evt.itemId) continue

      if (evt.type === 'ITEM_PURCHASED' || evt.type === 'ITEM_SOLD' || evt.type === 'ITEM_UNDO') {
        allEvents.push({
          type: evt.type,
          itemId: evt.itemId,
          timestamp: evt.timestamp,
        })
      }
    }
  }

  // First pass: handle immediate undos
  const afterUndos: Array<{ type: string; itemId: number; timestamp: number }> = []
  let i = 0

  while (i < allEvents.length) {
    const event = allEvents[i]

    if (event.type === 'ITEM_PURCHASED' && i + 1 < allEvents.length) {
      const nextEvent = allEvents[i + 1]

      if (nextEvent.type === 'ITEM_UNDO' && nextEvent.itemId === event.itemId) {
        i += 2
        continue
      }
    }

    afterUndos.push(event)
    i++
  }

  // Second pass: build purchase list, removing sold items
  const purchases: ItemPurchaseEvent[] = []

  for (const event of afterUndos) {
    if (event.type === 'ITEM_PURCHASED') {
      purchases.push({
        itemId: event.itemId,
        timestamp: event.timestamp,
        action: 'buy',
      })
    } else if (event.type === 'ITEM_SOLD') {
      for (let j = purchases.length - 1; j >= 0; j--) {
        if (purchases[j].itemId === event.itemId) {
          purchases.splice(j, 1)
          break
        }
      }
    }
  }

  return purchases
}

/**
 * Extract completed items (legendaries, boots, mythics) with timestamps
 * This is for displaying the build path in UI
 */
export function extractCompletedItems(timeline: MatchTimeline, participantId: number): CompletedItemEvent[] {
  const purchases = extractItemPurchases(timeline, participantId)

  const completedItems: CompletedItemEvent[] = []
  const seenItems = new Set<number>()

  for (const purchase of purchases) {
    // skip if already added (in case of repurchase after sell)
    if (seenItems.has(purchase.itemId)) continue

    if (isCompletedItem(purchase.itemId)) {
      const info = getItemInfo(purchase.itemId)
      completedItems.push({
        itemId: purchase.itemId,
        timestamp: purchase.timestamp,
        itemName: info.name,
        itemType: info.type,
      })
      seenItems.add(purchase.itemId)
    }
  }

  return completedItems
}

/**
 * Get list of items from purchases
 */
export function getFinalItems(purchases: ItemPurchaseEvent[]): number[] {
  return purchases.map(p => p.itemId)
}
