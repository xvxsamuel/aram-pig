// fetch and update items.json from Community Dragon when new patches are detected
import fs from 'fs/promises'
import path from 'path'

const ITEMS_JSON_PATH = path.join(process.cwd(), 'src', 'data', 'items.json')

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

// convert CDragon item to local format
function convertItem(cdItem: CDragonItem): LocalItem {
  return {
    name: cdItem.name,
    description: cdItem.description, // keep full HTML description for tooltips
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
    console.log('Starting items update check...')
    
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
    
    // load current items.json
    const currentDataRaw = await fs.readFile(ITEMS_JSON_PATH, 'utf-8')
    const currentData: Record<string, LocalItem> = JSON.parse(currentDataRaw)
    
    // only check for new/removed items - preserve existing item data
    const addedItems: string[] = []
    const removedItems: string[] = []
    
    for (const cdItem of relevantItems) {
      const itemId = String(cdItem.id)
      
      if (!currentData[itemId]) {
        // new item - add with converted data
        addedItems.push(itemId)
        currentData[itemId] = convertItem(cdItem)
      }
      // if item exists, keep the existing data (don't update)
    }
    
    // check for removed items
    const currentItemIds = Object.keys(currentData)
    const cdItemIds = new Set(relevantItems.map(item => String(item.id)))
    
    for (const itemId of currentItemIds) {
      if (!cdItemIds.has(itemId)) {
        removedItems.push(itemId)
        delete currentData[itemId]
      }
    }
    
    // log changes
    console.log('\n=== UPDATE SUMMARY ===')
    console.log(`Added items: ${addedItems.length}`)
    if (addedItems.length > 0) {
      for (const itemId of addedItems.slice(0, 10)) {
        console.log(`  ${itemId} (${currentData[itemId].name})`)
      }
      if (addedItems.length > 10) {
        console.log(`  ...and ${addedItems.length - 10} more`)
      }
    }
    
    console.log(`Removed items: ${removedItems.length}`)
    if (removedItems.length > 0) {
      console.log(`  ${removedItems.slice(0, 10).join(', ')}${removedItems.length > 10 ? '...' : ''}`)
    }
    
    // only update if there are changes
    if (addedItems.length > 0 || removedItems.length > 0) {
      console.log('\nWriting updated items.json...')
      await fs.writeFile(ITEMS_JSON_PATH, JSON.stringify(currentData, null, 2), 'utf-8')
      console.log('✓ Items updated successfully')
      process.exit(0) // exit code 0 = changes made
    } else {
      console.log('\n✓ No changes detected - items.json is up to date')
      process.exit(1) // exit code 1 = no changes
    }
    
  } catch (error) {
    console.error('Error updating items:', error)
    process.exit(2) // exit code 2 = error
  }
}

main()
