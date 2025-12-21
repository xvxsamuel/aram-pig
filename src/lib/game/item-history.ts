// item purchase history from match timeline
import type { MatchTimeline } from '@/types/match'
import itemsData from '@/data/items.json'

export interface ItemPurchaseEvent {
  itemId: number
  timestamp: number
  action: 'buy'
}

export interface ItemTimelineEvent {
  itemId: number
  timestamp: number
  action: 'buy' | 'sell'
  itemType: 'legendary' | 'boots' | 'mythic' | 'component' | 'other'
  itemName: string
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

function getItemTypeExtended(itemId: number): 'legendary' | 'boots' | 'mythic' | 'component' | 'other' {
  const item = items[String(itemId)]
  if (!item) return 'other'

  const type = item.itemType as string
  if (type === 'legendary') return 'legendary'
  if (type === 'boots') return 'boots'
  if (type === 'mythic') return 'mythic'
  if (type === 'component') return 'component'
  return 'other'
}

function isCompletedItem(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots' || type === 'mythic'
}

// extract item purchase history from timeline, accounting for undos and sells
// uses cassiopeia-style undo handling: pop events until finding the target item
export function extractItemPurchases(timeline: MatchTimeline, participantId: number): ItemPurchaseEvent[] {
  if (!timeline?.info?.frames) return []

  // inventory state tracking
  const inventory: number[] = []
  const eventStack: { type: string; itemId: number; timestamp: number }[] = []
  
  const addItem = (itemId: number) => inventory.push(itemId)
  const removeItem = (itemId: number) => {
    const idx = inventory.lastIndexOf(itemId)
    if (idx !== -1) inventory.splice(idx, 1)
  }

  for (const frame of timeline.info.frames) {
    const events = frame.events || []
    for (const event of events) {
      const evt = event as { type: string; participantId?: number; itemId?: number; beforeId?: number; afterId?: number; timestamp: number }
      if (evt.participantId !== participantId) continue

      if (evt.type === 'ITEM_PURCHASED' && evt.itemId) {
        addItem(evt.itemId)
        eventStack.push({ type: evt.type, itemId: evt.itemId, timestamp: evt.timestamp })
      } else if (evt.type === 'ITEM_SOLD' && evt.itemId) {
        removeItem(evt.itemId)
        eventStack.push({ type: evt.type, itemId: evt.itemId, timestamp: evt.timestamp })
      } else if (evt.type === 'ITEM_DESTROYED' && evt.itemId) {
        // item destroyed (consumed or upgraded into another item)
        removeItem(evt.itemId)
        eventStack.push({ type: evt.type, itemId: evt.itemId, timestamp: evt.timestamp })
      } else if (evt.type === 'ITEM_UNDO') {
        // cassiopeia-style undo: pop events until we find the target item
        const targetItemId = evt.beforeId || evt.afterId
        if (!targetItemId || targetItemId === 0) continue

        // pop events and reverse their effects until we find the matching item
        while (eventStack.length > 0) {
          const prev = eventStack.pop()!
          
          if (prev.type === 'ITEM_PURCHASED') {
            removeItem(prev.itemId) // Undo the purchase
          } else if (prev.type === 'ITEM_DESTROYED') {
            addItem(prev.itemId) // Restore the destroyed item
          } else if (prev.type === 'ITEM_SOLD') {
            addItem(prev.itemId) // Restore the sold item
          }

          // Stop when we've undone the target item
          if (prev.itemId === targetItemId) break
        }
      }
    }
  }

  // Build the final purchase list from remaining events
  // We need to replay the event stack to get purchase timestamps
  const purchases: ItemPurchaseEvent[] = []
  const soldItems = new Set<number>()

  for (const event of eventStack) {
    if (event.type === 'ITEM_PURCHASED') {
      purchases.push({
        itemId: event.itemId,
        timestamp: event.timestamp,
        action: 'buy',
      })
    } else if (event.type === 'ITEM_SOLD') {
      // Mark this item as sold - remove from purchases
      for (let j = purchases.length - 1; j >= 0; j--) {
        if (purchases[j].itemId === event.itemId && !soldItems.has(j)) {
          soldItems.add(j)
          break
        }
      }
    }
  }

  // Filter out sold items
  return purchases.filter((_, idx) => !soldItems.has(idx))
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
 * Extract full item timeline for display (buy/sell events, undos removed)
 * Uses cassiopeia-style undo handling: pop events until finding the target item
 */
export function extractItemTimeline(timeline: MatchTimeline, participantId: number): ItemTimelineEvent[] {
  if (!timeline?.info?.frames) return []

  // Event stack for undo handling
  const eventStack: Array<{ type: string; itemId: number; timestamp: number }> = []

  for (const frame of timeline.info.frames) {
    const events = frame.events || []
    for (const event of events) {
      const evt = event as { type: string; participantId?: number; itemId?: number; beforeId?: number; afterId?: number; timestamp: number }
      if (evt.participantId !== participantId) continue

      if (evt.type === 'ITEM_PURCHASED' && evt.itemId) {
        eventStack.push({ type: evt.type, itemId: evt.itemId, timestamp: evt.timestamp })
      } else if (evt.type === 'ITEM_SOLD' && evt.itemId) {
        eventStack.push({ type: evt.type, itemId: evt.itemId, timestamp: evt.timestamp })
      } else if (evt.type === 'ITEM_DESTROYED' && evt.itemId) {
        eventStack.push({ type: evt.type, itemId: evt.itemId, timestamp: evt.timestamp })
      } else if (evt.type === 'ITEM_UNDO') {
        // Cassiopeia-style undo: pop events until we find the target item
        const targetItemId = evt.beforeId || evt.afterId
        if (!targetItemId || targetItemId === 0) continue

        // Pop events until we find the matching item
        while (eventStack.length > 0) {
          const prev = eventStack.pop()!
          if (prev.itemId === targetItemId) break
        }
      }
    }
  }

  // Convert to display format (excluding ITEM_DESTROYED since those are automatic)
  return eventStack
    .filter(event => event.type === 'ITEM_PURCHASED' || event.type === 'ITEM_SOLD')
    .map(event => {
      const info = getItemInfo(event.itemId)
      return {
        itemId: event.itemId,
        timestamp: event.timestamp,
        action: event.type === 'ITEM_PURCHASED' ? 'buy' : 'sell',
        itemType: getItemTypeExtended(event.itemId),
        itemName: info.name,
      }
    })
}
