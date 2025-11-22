// Process timeline into purchase/sell history, filtering out undos
import type { MatchTimeline } from './riot-api'

export interface ItemPurchaseEvent {
  itemId: number
  timestamp: number
  action: 'buy' | 'sell'
}

/**
 * Extract item purchase history from timeline, accounting for undos and sales
 * Returns chronological list of buy/sell events
 */
export function extractItemPurchases(timeline: MatchTimeline, participantId: number): ItemPurchaseEvent[] {
  if (!timeline?.info?.frames) return []
  
  const purchases: ItemPurchaseEvent[] = []
  const eventQueue: Array<{ type: string; itemId: number; timestamp: number; index: number }> = []
  
  // Collect all item events for this participant
  for (const frame of timeline.info.frames) {
    const events = frame.events || []
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (event.participantId !== participantId) continue
      if (!event.itemId) continue // skip events without itemId
      
      if (event.type === 'ITEM_PURCHASED' || event.type === 'ITEM_SOLD' || event.type === 'ITEM_UNDO') {
        eventQueue.push({
          type: event.type,
          itemId: event.itemId,
          timestamp: event.timestamp,
          index: eventQueue.length
        })
      }
    }
  }
  
  // Process events, filtering out undos
  const processedIndices = new Set<number>()
  
  for (let i = 0; i < eventQueue.length; i++) {
    if (processedIndices.has(i)) continue
    
    const event = eventQueue[i]
    
    // Check if next event is an undo of this purchase/sale
    if (i + 1 < eventQueue.length) {
      const nextEvent = eventQueue[i + 1]
      
      // If next event is UNDO and matches this item, skip both
      if (nextEvent.type === 'ITEM_UNDO' && nextEvent.itemId === event.itemId) {
        // Undo detected - skip both this event and the undo
        processedIndices.add(i)
        processedIndices.add(i + 1)
        continue
      }
    }
    
    // Add non-undone purchases and sales
    if (event.type === 'ITEM_PURCHASED') {
      purchases.push({
        itemId: event.itemId,
        timestamp: event.timestamp,
        action: 'buy'
      })
    } else if (event.type === 'ITEM_SOLD') {
      purchases.push({
        itemId: event.itemId,
        timestamp: event.timestamp,
        action: 'sell'
      })
    }
    
    processedIndices.add(i)
  }
  
  return purchases
}

/**
 * Get net items owned at end of game (buys minus sells)
 */
export function getFinalItems(purchases: ItemPurchaseEvent[]): number[] {
  const inventory = new Map<number, number>() // itemId -> count
  
  for (const purchase of purchases) {
    const current = inventory.get(purchase.itemId) || 0
    
    if (purchase.action === 'buy') {
      inventory.set(purchase.itemId, current + 1)
    } else if (purchase.action === 'sell') {
      inventory.set(purchase.itemId, Math.max(0, current - 1))
    }
  }
  
  // Return items with count > 0
  const items: number[] = []
  for (const [itemId, count] of inventory.entries()) {
    for (let i = 0; i < count; i++) {
      items.push(itemId)
    }
  }
  
  return items
}
