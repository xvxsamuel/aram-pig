// Process timeline into purchase history, filtering out undos and sells
import type { MatchTimeline } from './riot-api'

export interface ItemPurchaseEvent {
  itemId: number
  timestamp: number
  action: 'buy'
}

/**
 * Extract item purchase history from timeline, accounting for undos and sells
 * - ITEM_UNDO: happens immediately after purchase, skip both
 * - ITEM_SOLD: happens later in game, removes item from purchase list
 * Returns chronological list of buy events that weren't undone or sold
 */
export function extractItemPurchases(timeline: MatchTimeline, participantId: number): ItemPurchaseEvent[] {
  if (!timeline?.info?.frames) return []
  
  const allEvents: Array<{ type: string; itemId: number; timestamp: number }> = []
  
  // Collect all item events for this participant in order
  for (const frame of timeline.info.frames) {
    const events = frame.events || []
    for (const event of events) {
      if (event.participantId !== participantId) continue
      if (!event.itemId) continue // skip events without itemId
      
      if (event.type === 'ITEM_PURCHASED' || event.type === 'ITEM_SOLD' || event.type === 'ITEM_UNDO') {
        allEvents.push({
          type: event.type,
          itemId: event.itemId,
          timestamp: event.timestamp
        })
      }
    }
  }
  
  // First pass: handle immediate undos (skip purchase+undo pairs)
  const afterUndos: Array<{ type: string; itemId: number; timestamp: number }> = []
  let i = 0
  
  while (i < allEvents.length) {
    const event = allEvents[i]
    
    // Check if next event is an immediate undo of this purchase
    if (event.type === 'ITEM_PURCHASED' && i + 1 < allEvents.length) {
      const nextEvent = allEvents[i + 1]
      
      // If next event is UNDO and matches this item, skip both
      if (nextEvent.type === 'ITEM_UNDO' && nextEvent.itemId === event.itemId) {
        i += 2 // skip both events
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
        action: 'buy'
      })
    } else if (event.type === 'ITEM_SOLD') {
      // Remove the most recent purchase of this item (player sold it)
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
 * Get list of items from purchases (simple extraction since sells are already filtered)
 */
export function getFinalItems(purchases: ItemPurchaseEvent[]): number[] {
  return purchases.map(p => p.itemId)
}
