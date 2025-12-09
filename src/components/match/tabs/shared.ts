// shared types and utilities for match detail tabs
import { MatchData, ParticipantData } from '@/types/match'
import itemsData from '@/data/items.json'

// all boot IDs - excluded from core build
export const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158])

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemTimelineEvent {
  timestamp: number
  itemId: number
  itemName?: string
  action: 'buy' | 'sell'
  itemType?: 'component' | 'legendary' | 'boots' | 'consumable' | 'mythic' | 'other'
}

export interface CompletedItem {
  itemId: number
  position: number
  timestamp: number
}

export interface TakedownEvent {
  t: number
  gold: number
  tf: boolean
  wasKill: boolean
  pos: number
  value: number
  x?: number
  y?: number
}

export interface DeathEvent {
  t: number
  gold: number
  tf: boolean
  pos: number
  value: number
  x?: number
  y?: number
}

export interface TowerEvent {
  t: number
  team: 'ally' | 'enemy'
}

export interface KillDeathTimeline {
  takedowns: TakedownEvent[]
  deaths: DeathEvent[]
  towers?: TowerEvent[]
  deathScore: number
}

export interface ParticipantDetails {
  ability_order?: string
  item_timeline?: ItemTimelineEvent[]
  kill_death_timeline?: KillDeathTimeline
  loading?: boolean
}

export interface ItemPenaltyDetail {
  slot: number
  itemId: number
  reason: string
  penalty: number
  playerWinrate?: number
  topWinrate?: number
}

export interface StartingItemsDetails {
  penalty: number
  playerWinrate?: number
  rank?: number
  totalOptions?: number
}

export interface CoreBuildDetails {
  playerWinrate?: number
  rank?: number
  totalOptions?: number
  games?: number
  // debug info
  playerCoreKey?: string
  matchedCoreKey?: string
  globalWinrate?: number
}

export interface PigScoreBreakdown {
  finalScore: number
  componentScores: {
    performance: number
    build: number
    timeline: number
    kda: number
  }
  buildSubScores?: {
    items: number
    keystone: number
    spells: number
    skills: number
    core: number
    starting: number
  }
  metrics: Array<{
    name: string
    score: number
    percentOfAvg?: number
    zScore?: number
  }>
  patch: string
  matchPatch?: string
  usedFallbackPatch?: boolean
  totalGames: number
  itemDetails?: ItemPenaltyDetail[]
  startingItemsDetails?: StartingItemsDetails
  coreBuildDetails?: CoreBuildDetails
  coreKey?: string
  fallbackInfo?: {
    starting?: boolean
    items?: boolean
    keystone?: boolean
  }
  playerStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
    deathsPerMin: number
  }
  championAvgStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  }
  scoringInfo?: {
    description: string
  }
}

export interface TabProps {
  match: MatchData
  currentPlayer: ParticipantData | undefined
  currentPuuid: string
  ddragonVersion: string
  region: string
  participantDetails: Map<string, ParticipantDetails>
  pigScoreBreakdown: PigScoreBreakdown | null
  loadingBreakdown: boolean
  showPigScores?: boolean
}

export interface OverviewTabProps extends TabProps {
  team100: ParticipantData[]
  team200: ParticipantData[]
  team100Won: boolean
  team200Won: boolean
  hasPigScores: boolean
  loadingPigScores: boolean
  pigScores: Map<string, number | null>
  maxDamage: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if an item is a completed item based on its ID
 */
export function isCompletedItemById(itemId: number): boolean {
  // Normalize ARAM-specific item IDs (12XXXX -> XXXX)
  const itemIdStr = String(itemId)
  const normalizedId = itemIdStr.startsWith('12') && itemIdStr.length === 6
    ? itemIdStr.slice(2)
    : itemIdStr
  
  const itemData = (itemsData as Record<string, { itemType?: string }>)[normalizedId]
  if (!itemData?.itemType) return false
  // tier 1 boots (1001) have itemType "boots" but should not count as completed
  if (itemId === 1001 || itemId === 121001) return false
  return ['legendary', 'boots', 'mythic'].includes(itemData.itemType)
}

/**
 * Gets the item type from the items data
 */
export function getItemType(itemId: number): string | undefined {
  // Normalize ARAM-specific item IDs (12XXXX -> XXXX)
  const itemIdStr = String(itemId)
  const normalizedId = itemIdStr.startsWith('12') && itemIdStr.length === 6
    ? itemIdStr.slice(2)
    : itemIdStr
  
  return (itemsData as Record<string, { itemType?: string }>)[normalizedId]?.itemType
}

/**
 * Gets the item name from the items data
 */
export function getItemName(itemId: number): string | undefined {
  // Normalize ARAM-specific item IDs (12XXXX -> XXXX)
  const itemIdStr = String(itemId)
  const normalizedId = itemIdStr.startsWith('12') && itemIdStr.length === 6
    ? itemIdStr.slice(2)
    : itemIdStr
  
  return (itemsData as Record<string, { name?: string }>)[normalizedId]?.name
}

/**
 * Adds item names and types to timeline events
 */
export function hydrateItemTimeline(timeline: ItemTimelineEvent[]): ItemTimelineEvent[] {
  return timeline.map(event => ({
    ...event,
    itemName: event.itemName || getItemName(event.itemId),
    itemType: event.itemType || (getItemType(event.itemId) as ItemTimelineEvent['itemType']),
  }))
}

/**
 * Formats damage number with K suffix for thousands
 */
export function formatDamage(damage: number): string {
  if (damage >= 1000) {
    return `${(damage / 1000).toFixed(1)}K`
  }
  return String(damage)
}

/**
 * Formats timestamp in milliseconds to m:ss format
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Formats timestamp in seconds to m:ss format
 */
export function formatTimeSec(secs: number): string {
  const mins = Math.floor(secs / 60)
  const s = secs % 60
  return `${mins}:${s.toString().padStart(2, '0')}`
}

// ARAM map constants for coordinate conversion
const MAP_MIN = { x: -28, y: -19 }
const MAP_MAX = { x: 12849, y: 12858 }

/**
 * Convert game coordinates to map percentage (0-100)
 */
export function coordToPercent(x: number, y: number): { x: number; y: number } {
  return {
    x: ((x - MAP_MIN.x) / (MAP_MAX.x - MAP_MIN.x)) * 100,
    y: ((y - MAP_MIN.y) / (MAP_MAX.y - MAP_MIN.y)) * 100,
  }
}
