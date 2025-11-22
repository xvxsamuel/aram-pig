// unified tooltip data for items, runes, and summoner spells

import itemsData from '../data/items.json'
import runesData from '../data/runes.json'
import summonerSpellsData from '../data/summoner-spells.json'

export type ItemType = 'legendary' | 'boots' | 'component' | 'starter' | 'consumable' | 'other'

export interface ItemStats {
  [key: string]: number // e.g. "Attack Damage": 65, "Armor": 45
}

export interface TooltipData {
  name: string
  description: string
  totalCost?: number
  itemType?: ItemType
  stats?: ItemStats
  cooldown?: number
  icon?: string // icon path for runes
}

// preloaded item data
const itemMap = new Map<number, TooltipData>(
  Object.entries(itemsData).map(([id, item]: [string, any]) => [
    parseInt(id),
    {
      name: item.name,
      description: item.description,
      totalCost: item.totalCost,
      itemType: item.itemType,
      stats: item.stats
    } as TooltipData
  ])
)

// preloaded rune data
const runeMap = new Map<number, TooltipData>(
  Object.entries(runesData).map(([id, rune]: [string, any]) => [
    parseInt(id),
    {
      name: rune.name,
      description: rune.description,
      icon: rune.icon,
      stats: {}
    } as TooltipData
  ])
)

// preloaded summoner spell data
const summonerSpellMap = new Map<number, TooltipData>(
  Object.entries(summonerSpellsData).map(([id, spell]: [string, any]) => [
    parseInt(id),
    {
      name: spell.name,
      description: spell.description,
      cooldown: spell.cooldown
    } as TooltipData
  ])
)

// check if item is completed (legendary tier)
export function isCompletedItem(itemId: number): boolean {
  const item = itemMap.get(itemId)
  return item?.itemType === 'legendary' || false
}

// get tooltip data by id and type
export function getTooltipData(id: number, type: 'item' | 'rune' | 'summoner-spell' = 'item'): TooltipData | null {
  switch (type) {
    case 'item':
      return itemMap.get(id) || null
    case 'rune':
      return runeMap.get(id) || null
    case 'summoner-spell':
      return summonerSpellMap.get(id) || null
    default:
      return null
  }
}


export type { ItemType as TooltipType }
