// fetch all items from meraki cdn

import * as fs from 'fs'
import * as path from 'path'

type ItemType = 'legendary' | 'boots' | 'component' | 'starter' | 'consumable' | 'other'

interface ItemData {
  name: string
  description: string
  totalCost: number
  itemType: ItemType
  stats: Record<string, number>
}

async function fetchItemData() {
  console.log('fetching all items from meraki...')
  
  const merakiResponse = await fetch('https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/items.json')
  const merakiItems = await merakiResponse.json()
  
  console.log(`fetched ${Object.keys(merakiItems).length} items from meraki`)
  
  const itemMap: Record<string, ItemData> = {}
  let count = 0
  
  for (const [itemId, item] of Object.entries(merakiItems) as [string, any][]) {
    if (!item.name) continue
    
    const id = parseInt(itemId)
    const nameLower = item.name.toLowerCase()
    
    // parse stats from meraki
    const stats: Record<string, number> = {}
    if (item.stats) {
      const statMap: Record<string, string> = {
        'abilityPower': 'Ability Power',
        'armor': 'Armor',
        'attackDamage': 'Attack Damage',
        'attackSpeed': 'Attack Speed',
        'criticalStrikeChance': 'Critical Strike Chance',
        'health': 'Health',
        'healthRegen': 'Health Regen',
        'lethality': 'Lethality',
        'lifesteal': 'Life Steal',
        'magicPenetration': 'Magic Penetration',
        'magicResistance': 'Magic Resistance',
        'mana': 'Mana',
        'manaRegen': 'Mana Regen',
        'movespeed': 'Move Speed',
        'abilityHaste': 'Ability Haste',
        'omnivamp': 'Omnivamp',
        'tenacity': 'Tenacity'
      }
      
      for (const [stat, name] of Object.entries(statMap)) {
        if (item.stats[stat]?.flat && item.stats[stat].flat !== 0) {
          stats[name] = item.stats[stat].flat
        } else if (item.stats[stat]?.percent && item.stats[stat].percent !== 0) {
          stats[name] = item.stats[stat].percent
        }
      }
    }
    
    // get item type from rank field
    let itemType: ItemType = 'other'
    if (item.rank && item.rank.length > 0) {
      const rank = item.rank[0].toLowerCase()
      if (rank === 'legendary' || rank === 'mythic') {
        itemType = 'legendary'
      } else if (rank === 'basic' || rank === 'epic') {
        // basic = low tier components, epic = mid tier components like lost chapter
        itemType = 'component'
      } else if (rank === 'starter') {
        itemType = 'starter'
      } else if (rank === 'consumable' || rank === 'potion') {
        itemType = 'consumable'
      } else if (rank === 'boots') {
        itemType = 'boots'
      }
    }
    
    // build description from passives/actives
    let desc = ''
    if (item.passives?.length) {
      desc = item.passives.map((p: any) => `${p.name || ''}: ${p.effects || ''}`).join('\n')
    }
    if (item.active?.length) {
      const active = item.active.map((a: any) => `${a.name || ''}: ${a.effects || ''}`).join('\n')
      desc = desc ? `${desc}\n${active}` : active
    }
    
    itemMap[itemId] = {
      name: item.name,
      description: desc,
      totalCost: item.shop?.prices?.total || 0,
      itemType,
      stats
    }
    count++
  }
  
  console.log(`processed ${count} items`)
  
  const outputPath = path.join(process.cwd(), 'src', 'data', 'items.json')
  fs.writeFileSync(outputPath, JSON.stringify(itemMap, null, 2))
  console.log(`saved to ${outputPath}`)
}

fetchItemData().catch(console.error)