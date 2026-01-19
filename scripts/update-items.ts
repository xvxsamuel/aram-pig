// fetch and update items.json from Community Dragon when new patches are detected
// usage: npx tsx scripts/update-items.ts [--fresh]
//   --fresh: wipe items.json and reimport all items from CDragon (discards wiki data)
import fs from 'fs/promises'
import path from 'path'
import { convertCDragonToTags } from './convert-items-to-tags.js'

const ITEMS_JSON_PATH = path.join(process.cwd(), 'src', 'data', 'items.json')
const FRESH_MODE = process.argv.includes('--fresh')

interface CDragonItem {
  id: number
  name: string
  description: string
  active: boolean
  inStore: boolean
  from: number[]
  to: number[]
  categories: string[]
  maxStacks: number
  requiredChampion: string
  requiredAlly: string
  requiredBuffCurrencyName: string
  requiredBuffCurrencyCost: number
  specialRecipe: number
  isEnchantment: boolean
  price: number
  priceTotal: number
  displayInItemSets: boolean
  iconPath: string
}

interface LocalItem {
  name: string
  description: string // keep full HTML-tagged description for tooltips
  totalCost: number
  itemType: 'component' | 'boots' | 'legendary' | 'mythic' | 'consumable' | 'trinket'
  stats: Record<string, number>
}

// parse stats from description - extract only the numeric values and clean stat names
function parseStats(description: string): Record<string, number> {
  const stats: Record<string, number> = {}
  
  // pattern: <attention>VALUE</attention> STAT_NAME
  // captures both percentage and non-percentage stats
  const pattern = /<attention>\s*([\d.]+)%?\s*<\/attention>\s*([^<]+)/g
  
  let match
  while ((match = pattern.exec(description)) !== null) {
    const value = parseFloat(match[1])
    let statName = match[2].trim()
    
    // clean up stat names - remove "Base" prefix for consistency with old format
    statName = statName.replace(/^Base\s+/i, '')
    
    if (statName && !isNaN(value)) {
      stats[statName] = value
    }
  }
  
  return stats
}

// determine item type based on categories and other properties
function determineItemType(item: CDragonItem): LocalItem['itemType'] {
  const cats = item.categories.map(c => c.toLowerCase())
  
  if (cats.includes('boots')) return 'boots'
  if (cats.includes('trinket')) return 'trinket'
  if (cats.includes('consumable')) return 'consumable'
  
  // check if it's a component (has items that build from it but low cost)
  if (item.to.length > 0 && item.priceTotal < 1200) return 'component'
  
  // mythic items don't exist anymore in current LoL but keep for compatibility
  if (item.description.includes('rarityMythic')) return 'mythic'
  
  // legendary items (high cost, complete items)
  if (item.priceTotal >= 2000 && item.from.length > 0) return 'legendary'
  
  return 'component'
}

// check if description is a CDragon placeholder (not actual content)
function isPlaceholderDescription(desc: string): boolean {
  return desc.startsWith('GeneratedTip_') || desc === ''
}

// convert CDragon item to local format
function convertItem(cdItem: CDragonItem): LocalItem {
  const description = convertCDragonToTags(cdItem.description)
  return {
    name: cdItem.name,
    description: isPlaceholderDescription(description) ? '' : description,
    totalCost: cdItem.priceTotal,
    itemType: determineItemType(cdItem),
    stats: parseStats(cdItem.description),
  }
}

// fetch latest version from ddragon
async function getLatestDDragonVersion(): Promise<string> {
  const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  const versions: string[] = await response.json()
  return versions[0]
}

// fetch items from cdragon
async function fetchCDragonItems(version: string): Promise<CDragonItem[]> {
  // cdragon uses major.minor format (e.g., 16.1 instead of 16.1.1)
  const cdVersion = version.split('.').slice(0, 2).join('.')
  console.log(`Fetching items from Community Dragon (version ${cdVersion})...`)
  const url = `https://raw.communitydragon.org/${cdVersion}/plugins/rcp-be-lol-game-data/global/default/v1/items.json`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch CDragon items: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

async function main() {
  try {
    console.log(FRESH_MODE ? 'Starting FRESH items import from CDragon...' : 'Starting items update check...')
    
    // get latest ddragon version
    const version = await getLatestDDragonVersion()
    console.log(`Latest DDragon version: ${version}`)
    
    // fetch cdragon items
    const cdItems = await fetchCDragonItems(version)
    console.log(`Fetched ${cdItems.length} items from CDragon`)
    
    // filter to only relevant items (in store, not quest items, etc)
    const relevantItems = cdItems.filter(item => 
      (item.inStore || item.displayInItemSets) &&
      !item.requiredChampion &&
      item.price >= 0
    )
    console.log(`Filtered to ${relevantItems.length} relevant items`)
    
    // FRESH MODE: start with empty object, ignore existing data
    // NORMAL MODE: load current items.json and diff against it
    let currentData: Record<string, LocalItem> = {}
    if (!FRESH_MODE) {
      const currentDataRaw = await fs.readFile(ITEMS_JSON_PATH, 'utf-8')
      currentData = JSON.parse(currentDataRaw)
    }
    
    // track changes
    const addedItems: string[] = []
    const updatedItems: string[] = []
    const removedItems: string[] = []
    
    for (const cdItem of relevantItems) {
      const itemId = String(cdItem.id)
      const converted = convertItem(cdItem)
      
      if (FRESH_MODE) {
        // fresh mode: just add all items
        addedItems.push(itemId)
        currentData[itemId] = converted
      } else if (!currentData[itemId]) {
        // new item
        addedItems.push(itemId)
        currentData[itemId] = converted
      } else {
        // check if existing item has changed
        const existing = currentData[itemId]
        const changes: string[] = []
        
        // check name change
        if (existing.name !== converted.name) {
          changes.push(`name: "${existing.name}" -> "${converted.name}"`)
        }
        
        // check description change - only update if CDragon has real content
        // prefer existing description over empty/placeholder
        const shouldUpdateDesc = converted.description !== '' && 
          existing.description !== converted.description
        if (shouldUpdateDesc) {
          changes.push('description updated')
        }
        
        // check cost change
        if (existing.totalCost !== converted.totalCost) {
          changes.push(`cost: ${existing.totalCost} -> ${converted.totalCost}`)
        }
        
        // check stats changes
        const existingStats = JSON.stringify(existing.stats)
        const convertedStats = JSON.stringify(converted.stats)
        if (existingStats !== convertedStats) {
          changes.push('stats updated')
        }
        
        // check item type change
        if (existing.itemType !== converted.itemType) {
          changes.push(`type: ${existing.itemType} -> ${converted.itemType}`)
        }
        
        if (changes.length > 0) {
          // preserve existing description if CDragon has placeholder
          const newItem = { ...converted }
          if (!shouldUpdateDesc && existing.description) {
            newItem.description = existing.description
          }
          updatedItems.push(`${itemId} (${converted.name}): ${changes.join(', ')}`)
          currentData[itemId] = newItem
        }
      }
    }
    
    // check for removed items (skip in fresh mode)
    const currentItemIds = FRESH_MODE ? [] : Object.keys(currentData)
    const cdItemIds = new Set(relevantItems.map(item => String(item.id)))
    
    for (const itemId of currentItemIds) {
      if (!cdItemIds.has(itemId)) {
        removedItems.push(itemId)
        delete currentData[itemId]
      }
    }
    
    // log changes
    console.log('\n=== UPDATE SUMMARY ===')
    if (FRESH_MODE) {
      console.log(`Fresh import: ${addedItems.length} items from CDragon`)
    } else {
      console.log(`Added items: ${addedItems.length}`)
      if (addedItems.length > 0) {
        for (const itemId of addedItems.slice(0, 10)) {
          console.log(`  + ${itemId} (${currentData[itemId].name})`)
        }
        if (addedItems.length > 10) {
          console.log(`  ...and ${addedItems.length - 10} more`)
        }
      }
      
      console.log(`Updated items: ${updatedItems.length}`)
      if (updatedItems.length > 0) {
        for (const change of updatedItems.slice(0, 15)) {
          console.log(`  ~ ${change}`)
        }
        if (updatedItems.length > 15) {
          console.log(`  ...and ${updatedItems.length - 15} more`)
        }
      }
      
      console.log(`Removed items: ${removedItems.length}`)
      if (removedItems.length > 0) {
        console.log(`  - ${removedItems.slice(0, 10).join(', ')}${removedItems.length > 10 ? '...' : ''}`)
      }
    }
    
    // only update if there are changes
    if (addedItems.length > 0 || updatedItems.length > 0 || removedItems.length > 0) {
      console.log('\nWriting updated items.json...')
      await fs.writeFile(ITEMS_JSON_PATH, JSON.stringify(currentData, null, 2), 'utf-8')
      console.log('Done')
      process.exit(0) // exit code 0 = changes made
    } else {
      console.log('\nNo changes detected - items.json is up to date')
      process.exit(1) // exit code 1 = no changes
    }
    
  } catch (error) {
    console.error('Error updating items:', error)
    process.exit(2) // exit code 2 = error
  }
}

main()
