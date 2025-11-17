import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { getChampionImageUrl } from '@/lib/ddragon-client'
import { fetchChampionNames, getChampionDisplayName } from '@/lib/champion-names'
import { getWinrateColor } from '@/lib/winrate-colors'
import clsx from 'clsx'
import ChampionDetailTabs from '@/components/ChampionDetailTabs'
import PatchSelector from '@/components/PatchSelector'

export const revalidate = 0 // disable cache for patch filter to work

interface Props {
  params: Promise<{ championName: string }>
  searchParams: Promise<{ patch?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { championName } = await params
  const championNames = await fetchChampionNames('14.23.1')
  const displayName = getChampionDisplayName(championName, championNames)
  
  // Capitalize first letter of each word
  const capitalizedName = displayName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  
  return {
    title: `${capitalizedName} Stats | ARAM PIG`,
    description: `Detailed ARAM statistics for ${capitalizedName}`,
  }
}

interface ItemStat {
  item_id: number
  games: number
  wins: number
}

interface KeystoneStat {
  keystone_id: number
  games: number
  wins: number
}

export default async function ChampionDetailPage({ params, searchParams }: Props) {
  const { championName } = await params
  const { patch: selectedPatch } = await searchParams
  const supabase = createAdminClient()
  const ddragonVersion = '14.23.1'
  
  // Get available patches from database
  const { data: patchData } = await supabase
    .from('matches')
    .select('patch')
    .not('patch', 'is', null)
    .order('game_creation', { ascending: false })
    .limit(1000)
  
  const uniquePatches = [...new Set((patchData || []).map(m => m.patch).filter(Boolean))]
  const availablePatches = uniquePatches.slice(0, 3) // Last 3 patches
  
  // Default to current patch if no filter specified
  const currentPatch = selectedPatch || (availablePatches.length > 0 ? availablePatches[0] : null)
  
  const championNames = await fetchChampionNames(ddragonVersion)
  
  // convert URL to API name - URL can be display name (wukong) or API name (aatrox)
  const urlNormalized = championName.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  // first, try to match against display names
  let apiName: string | null = null
  for (const [api, display] of Object.entries(championNames)) {
    if (display.toLowerCase().replace(/[^a-z0-9]/g, '') === urlNormalized) {
      apiName = api
      break
    }
  }
  
  // if not found, try matching API names directly
  if (!apiName) {
    for (const api of Object.keys(championNames)) {
      if (api.toLowerCase() === urlNormalized) {
        apiName = api
        break
      }
    }
  }
  
  if (!apiName) {
    console.error(`Could not find champion for URL: ${championName}`)
    notFound()
  }

  // Query patch-specific champion stats
  let championData
  let totalGames = 0
  
  if (currentPatch) {
    const { data: patchStats, error: patchError } = await supabase
      .from('champion_stats_by_patch')
      .select('champion_name, games, wins, last_game_time')
      .eq('champion_name', apiName)
      .eq('patch', currentPatch)
      .single()
    
    if (patchError) {
      console.error(`Patch stats error for ${apiName}:`, patchError)
      notFound()
    }
    
    championData = patchStats ? {
      champion_name: patchStats.champion_name,
      overall_winrate: patchStats.games > 0 ? (patchStats.wins / patchStats.games) * 100 : 0,
      games_analyzed: patchStats.games,
      wins: patchStats.wins,
      last_calculated_at: new Date(patchStats.last_game_time).toISOString()
    } : null
  } else {
    // Fall back to all-time stats if no patch
    const { data: allTimeStats, error: championError } = await supabase
      .from('aram_stats')
      .select('champion_name, overall_winrate, games_analyzed, wins, last_calculated_at')
      .eq('champion_name', apiName)
      .single()

    if (championError) {
      console.error(`Database error for ${apiName}:`, championError)
      notFound()
    }
    
    championData = allTimeStats
  }
  
  if (!championData) {
    console.error(`No data found for ${apiName}`)
    notFound()
  }

  const displayName = championNames[apiName] || apiName
  totalGames = championData.games_analyzed

  // query item stats from materialized view
  const itemQuery = currentPatch
    ? supabase
        .from('item_stats_by_patch')
        .select('item_id, slot, games, wins, winrate')
        .eq('champion_name', apiName)
        .eq('patch', currentPatch)
    : supabase
        .from('item_stats_by_patch')
        .select('item_id, slot, games, wins, winrate')
        .eq('champion_name', apiName)
  
  const { data: itemData, error: itemError } = await itemQuery

  if (itemError) {
    console.error(`Item stats error for ${apiName}:`, itemError)
  }

  // check if item is boots
  const itemsDataImport = await import('@/data/items.json')
  const isBootsItem = (itemId: number): boolean => {
    const item = (itemsDataImport.default as Record<string, any>)[itemId.toString()]
    return item?.itemType === 'boots'
  }
  
  // check if item is finished (legendary or boots)
  const isFinishedItem = (itemId: number): boolean => {
    const item = (itemsDataImport.default as Record<string, any>)[itemId.toString()]
    if (!item) return false
    const type = item.itemType
    return type === 'legendary' || type === 'boots'
  }

  // separate boots from regular items and group by slot
  const itemsBySlot: Record<number, Array<ItemStat & { winrate: number; pickrate: number }>> = {}
  const bootsMap: Map<number, { games: number; wins: number }> = new Map()
  let totalGamesWithBoots = 0
  let winsWithBoots = 0
  
  if (itemData) {
    itemData.forEach((item) => {
      // skip component items - only show finished items
      if (!isFinishedItem(item.item_id)) {
        return
      }
      
      if (isBootsItem(item.item_id)) {
        // aggregate boots across all slots
        const existing = bootsMap.get(item.item_id) || { games: 0, wins: 0 }
        bootsMap.set(item.item_id, {
          games: existing.games + item.games,
          wins: existing.wins + item.wins
        })
        totalGamesWithBoots += item.games
        winsWithBoots += item.wins
      } else {
        // regular items stay separated by slot
        const statItem = {
          item_id: item.item_id,
          games: item.games,
          wins: item.wins,
          winrate: item.winrate, // already calculated in materialized view
          pickrate: totalGames > 0 ? (item.games / totalGames) * 100 : 0,
        }
        
        if (!itemsBySlot[item.slot]) {
          itemsBySlot[item.slot] = []
        }
        itemsBySlot[item.slot].push(statItem)
      }
    })
    
    // sort each slot by pickrate descending
    Object.keys(itemsBySlot).forEach((slot) => {
      itemsBySlot[parseInt(slot)].sort((a, b) => b.pickrate - a.pickrate)
    })
  }
  
  // convert boots map to array with stats
  const bootsItems = Array.from(bootsMap.entries())
    .map(([item_id, data]) => ({
      item_id,
      games: data.games,
      wins: data.wins,
      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
      pickrate: totalGames > 0 ? (data.games / totalGames) * 100 : 0,
    }))
  
  // calculate "no boots" stats
  const noBootsGames = totalGames - totalGamesWithBoots
  const noBootsWins = championData.wins - winsWithBoots
  const noBootsItem = noBootsGames > 0 ? {
    item_id: -1, // special ID for no boots
    games: noBootsGames,
    wins: noBootsWins,
    winrate: (noBootsWins / noBootsGames) * 100,
    pickrate: (noBootsGames / totalGames) * 100,
  } : null
  
  // add no boots to array if it exists, then sort all by pickrate
  if (noBootsItem) {
    bootsItems.push(noBootsItem)
  }
  bootsItems.sort((a, b) => b.pickrate - a.pickrate)
  
  // query rune stats from materialized view
  const runeQuery = currentPatch
    ? supabase
        .from('rune_stats_by_patch')
        .select('rune_id, slot, games, wins, winrate')
        .eq('champion_name', apiName)
        .eq('patch', currentPatch)
    : supabase
        .from('rune_stats_by_patch')
        .select('rune_id, slot, games, wins, winrate')
        .eq('champion_name', apiName)
  
  const { data: runeDataRaw, error: runeError } = await runeQuery

  if (runeError) {
    console.error(`Rune stats error for ${apiName}:`, runeError)
  }

  // convert to slot-based structure with pickrate
  const runeStats: Record<number, Array<{ rune_id: number; games: number; wins: number; winrate: number; pickrate: number }>> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: []
  }
  
  runeDataRaw?.forEach(rune => {
    runeStats[rune.slot].push({
      rune_id: rune.rune_id,
      games: rune.games,
      wins: rune.wins,
      winrate: rune.winrate,
      pickrate: totalGames > 0 ? (rune.games / totalGames) * 100 : 0
    })
  })
  
  // sort each slot by pickrate
  for (let slot = 0; slot < 6; slot++) {
    runeStats[slot].sort((a, b) => b.pickrate - a.pickrate)
  }

  // query ability leveling order from summoner_matches (patch-filtered)
  // note: ability stats don't have a materialized view yet, so using raw data with join
  const abilityQuery = currentPatch
    ? supabase
        .from('summoner_matches')
        .select('ability_order, win, matches!inner(patch)')
        .eq('champion_name', apiName)
        .eq('matches.patch', currentPatch)
        .not('ability_order', 'is', null)
    : supabase
        .from('summoner_matches')
        .select('ability_order, win')
        .eq('champion_name', apiName)
        .not('ability_order', 'is', null)
  
  const { data: abilityData, error: abilityError } = await abilityQuery

  if (abilityError) {
    console.error(`Ability leveling error for ${apiName}:`, abilityError)
  }

  console.log(`[${apiName}] Ability data count:`, abilityData?.length || 0)

  // aggregate ability leveling patterns
  const abilityOrderMap: Map<string, { games: number; wins: number }> = new Map()
  
  abilityData?.forEach(match => {
    const orderString = match.ability_order!
    const existing = abilityOrderMap.get(orderString) || { games: 0, wins: 0 }
    abilityOrderMap.set(orderString, {
      games: existing.games + 1,
      wins: existing.wins + (match.win ? 1 : 0)
    })
  })

  const abilityLevelingStats = Array.from(abilityOrderMap.entries())
    .map(([ability_order, data]) => ({
      ability_order,
      games: data.games,
      wins: data.wins,
      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
      pickrate: totalGames > 0 ? (data.games / totalGames) * 100 : 0
    }))
    .sort((a, b) => b.pickrate - a.pickrate)
    .slice(0, 5) // Top 5 most popular leveling orders

  console.log(`[${apiName}] Ability leveling stats:`, abilityLevelingStats.length, 'patterns found')

  // for backwards compatibility, extract keystone stats (slot 0)
  const keystoneStats = runeStats[0].map(r => ({
    keystone_id: r.rune_id,
    games: r.games,
    wins: r.wins,
    winrate: r.winrate,
    pickrate: r.pickrate
  }))

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* back button */}
        <Link href="/champions" className="inline-flex items-center gap-2 text-gold-light hover:text-gold-dark mb-6 transition-colors">
          <span>←</span>
          <span>Back to Tier List</span>
        </Link>

        {/* champion header */}
        <div className="bg-abyss-600 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-gold-light">
              <Image
                src={getChampionImageUrl(apiName, ddragonVersion)}
                alt={displayName}
                width={96}
                height={96}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-4xl font-bold mb-2">{displayName}</h1>
                  <div className="flex gap-6 text-lg">
                    <div>
                      <span className="text-subtitle">Winrate: </span>
                      <span className="font-bold" style={{ color: getWinrateColor(championData.overall_winrate) }}>
                        {championData.overall_winrate.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-subtitle">Games: </span>
                      <span className="font-bold">{championData.games_analyzed.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-sm text-subtitle mt-2">
                    Last updated: {new Date(championData.last_calculated_at).toLocaleDateString()}
                  </div>
                </div>
                
                {/* Patch Filter Dropdown */}
                <PatchSelector availablePatches={availablePatches} currentPatch={currentPatch} />
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content with Items and Runes */}
        <div className="bg-abyss-600 rounded-lg p-6">
          <ChampionDetailTabs
            itemsBySlot={itemsBySlot}
            bootsItems={bootsItems}
            runeStats={runeStats}
            abilityLevelingStats={abilityLevelingStats}
            ddragonVersion={ddragonVersion}
          />
        </div>
      </div>
    </main>
  )
}
