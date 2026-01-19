// unified tooltip data for items, runes, summoner spells, and augments

import itemsData from '../../data/items.json'
import runesData from '../../data/runes.json'
import summonerSpellsData from '../../data/summoner-spells.json'
import augmentsData from '../../data/augments.json'

export type ItemType = 'legendary' | 'boots' | 'component' | 'starter' | 'consumable' | 'other'

export interface ItemStats {
  [key: string]: number // e.g. "attack damage": 65, "armor": 45
}

export interface TooltipData {
  name: string
  description: string
  totalCost?: number
  itemType?: ItemType
  stats?: ItemStats
  cooldown?: number
  icon?: string // icon path for runes
  tier?: string // for augments
}

// preloaded item data - optimized initialization
const itemMap = new Map<number, TooltipData>()
for (const id in itemsData) {
  const item = (itemsData as Record<string, any>)[id]
  itemMap.set(parseInt(id), {
    name: item.name,
    description: item.description,
    totalCost: item.totalCost,
    itemType: item.itemType,
    stats: item.stats,
  })
}

// preloaded rune data - optimized initialization
const runeMap = new Map<number, TooltipData>()
for (const id in runesData) {
  const rune = (runesData as Record<string, any>)[id]
  runeMap.set(parseInt(id), {
    name: rune.name,
    description: rune.description,
    icon: rune.icon,
    stats: {},
  })
}

// preloaded summoner spell data - optimized initialization
const summonerSpellMap = new Map<number, TooltipData>()
for (const id in summonerSpellsData) {
  const spell = (summonerSpellsData as Record<string, any>)[id]
  summonerSpellMap.set(parseInt(id), {
    name: spell.name,
    description: spell.description,
    cooldown: spell.cooldown,
  })
}

// preloaded augment data - optimized initialization
const augmentMap = new Map<string, TooltipData>()
for (const name in augmentsData) {
  const augment = (augmentsData as Record<string, any>)[name]
  augmentMap.set(name, {
    name,
    description: augment.description,
    tier: augment.tier,
  })
}

// check if item is completed (legendary tier)
export function isCompletedItem(itemId: number): boolean {
  const item = itemMap.get(itemId)
  return item?.itemType === 'legendary' || false
}

// get tooltip data by id/name and type
export function getTooltipData(
  id: number | string, 
  type: 'item' | 'rune' | 'summoner-spell' | 'augment' = 'item'
): TooltipData | null {
  switch (type) {
    case 'item':
      return itemMap.get(id as number) || null
    case 'rune':
      return runeMap.get(id as number) || null
    case 'summoner-spell':
      return summonerSpellMap.get(id as number) || null
    case 'augment':
      return augmentMap.get(id as string) || null
    default:
      return null
  }
}

export type { ItemType as TooltipType }
