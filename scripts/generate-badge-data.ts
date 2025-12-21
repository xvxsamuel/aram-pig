
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const HEARTSTEEL_ID = '3084'
const MALIGNANCE_ID = '3118'

// Items to ignore when calculating rank (Boots, Starters, Potions)
const IGNORED_ITEMS = new Set([
  // Boots
  '1001', '3006', '3009', '3020', '3047', '3111', '3117', '3158', '2422',
  // Guardian Items
  '2501', '2502', '2503', '2504',
  // Potions & Consumables
  '2003', '2031', '2032', '2033', '2055', '2138', '2139', '2140',
  // Components (incomplete list, but common ones)
  '1036', '1037', '1038', '1042', '1043', '1052', '1053', '1054', '1055', '1056', '1057', '1058'
])

async function generateBadgeData() {
  console.log('Fetching champion stats...')
  
  const { data: champions, error } = await supabase
    .from('champion_stats')
    .select('champion_name, data, games, wins')

  if (error) {
    console.error('Error fetching champion stats:', error)
    process.exit(1)
  }

  console.log(`Processing ${champions.length} champions...`)

  const synergies: Record<string, { heartsteel: boolean; malignance: boolean }> = {}

  for (const champ of champions) {
    const totalGames = champ.games
    if (!totalGames || totalGames < 20) continue

    const itemsBySlot = (champ.data as any).items || {}
    const aggregatedItems: Record<string, { games: number; wins: number }> = {}

    // Aggregate items only from the first 2 slots (0 and 1) as these are core items
    // User request: "only look at first 2 slots for heartsteel and malignance viability"
    const slotsToCheck = ['0', '1']
    
    slotsToCheck.forEach(slot => {
      const slotItems = itemsBySlot[slot]
      if (slotItems) {
        Object.entries(slotItems).forEach(([itemId, stats]: [string, any]) => {
          if (!aggregatedItems[itemId]) {
            aggregatedItems[itemId] = { games: 0, wins: 0 }
          }
          aggregatedItems[itemId].games += parseInt(stats.games || '0')
          aggregatedItems[itemId].wins += parseInt(stats.wins || '0')
        })
      }
    })

    // Calculate stats for all valid items
    const validItems = Object.entries(aggregatedItems)
      .filter(([itemId]) => !IGNORED_ITEMS.has(itemId))
      .map(([itemId, stats]) => ({
        id: itemId,
        games: stats.games,
        wins: stats.wins,
        winrate: stats.games > 0 ? stats.wins / stats.games : 0,
        pickrate: stats.games / totalGames
      }))
      .filter(item => item.pickrate >= 0.10) // At least 10% pickrate
      .sort((a, b) => b.winrate - a.winrate) // Sort by winrate desc

    // Check if item is in top 3
    const isTop3 = (targetId: string) => {
      const rank = validItems.findIndex(item => item.id === targetId)
      return rank !== -1 && rank < 3
    }

    synergies[champ.champion_name] = {
      heartsteel: isTop3(HEARTSTEEL_ID),
      malignance: isTop3(MALIGNANCE_ID)
    }
  }

  const outputPath = path.join(process.cwd(), 'src', 'data', 'badges.json')
  await fs.writeFile(outputPath, JSON.stringify(synergies, null, 2))
  
  console.log(`Successfully wrote badge data to ${outputPath}`)
}

generateBadgeData()
