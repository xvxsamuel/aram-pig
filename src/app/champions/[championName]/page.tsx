import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { getChampionImageUrl } from '@/lib/ddragon-client'
import { fetchChampionNames, getChampionDisplayName, getApiNameFromUrl } from '@/lib/champion-names'
import { getLatestPatches } from '@/lib/patch-utils'
import { getWinrateColor } from '@/lib/winrate-colors'
import { getLatestVersion } from '@/lib/ddragon-client'
import ChampionDetailTabs from '@/components/ChampionDetailTabs'
import ChampionFilters from '@/components/ChampionFilters'

export const revalidate = 0 // disable cache for patch filter to work

interface Props {
  params: Promise<{ championName: string }>
  searchParams: Promise<{ patch?: string; filter?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { championName } = await params
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)
  const apiName = getApiNameFromUrl(championName, championNames)
  
  if (!apiName) {
    return {
      title: 'Champion Not Found | ARAM PIG',
      description: 'Champion statistics not available',
    }
  }
  
  const displayName = getChampionDisplayName(apiName, championNames)
  
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
  const { patch: selectedPatch, filter = 'patch' } = await searchParams
  const supabase = createAdminClient()
  const ddragonVersion = await getLatestVersion()
  
  // Get latest 3 patches from Riot API
  const availablePatches = await getLatestPatches()
  
  // Determine time filter based on filter parameter
  let timeFilter: number | null = null
  let currentPatch: string | null = null
  
  if (filter === 'patch') {
    // Use selected patch from URL, or fall back to first available patch
    currentPatch = selectedPatch || (availablePatches.length > 0 ? availablePatches[0] : null)
  } else if (filter === '7' || filter === '30') {
    const days = parseInt(filter)
    timeFilter = Date.now() - (days * 24 * 60 * 60 * 1000)
  }
  
  const championNames = await fetchChampionNames(ddragonVersion)
  const apiName = getApiNameFromUrl(championName, championNames)
  
  if (!apiName) {
    console.error(`Could not find champion for URL: ${championName}`)
    notFound()
  }

  // Query champion stats from new JSONB structure
  let championData: any = null
  let totalGames = 0
  let championStatsData: any = null
  
  if (currentPatch) {
    // Patch-specific stats from champion_stats table
    const { data: patchStats, error: patchError } = await supabase
      .from('champion_stats')
      .select('champion_name, patch, data, last_updated')
      .eq('champion_name', apiName)
      .eq('patch', currentPatch)
      .maybeSingle()
    
    if (patchError) {
      console.error(`Patch stats error for ${apiName}:`, patchError)
      notFound()
    }
    
    if (!patchStats || !patchStats.data) {
      championData = null
    } else {
      const data = patchStats.data as any
      championStatsData = data
      console.log(`Champion ${apiName} data keys:`, Object.keys(data))
      console.log(`Has items?`, !!data.items)
      console.log(`Has runes?`, !!data.runes)
      console.log(`Has core?`, !!data.core)
      championData = {
        champion_name: patchStats.champion_name,
        overall_winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
        games_analyzed: data.games || 0,
        wins: data.wins || 0,
        last_calculated_at: patchStats.last_updated || new Date().toISOString()
      }
    }
  } else if (timeFilter) {
    // Time filter not supported with JSONB structure - fall back to showing no data
    championData = null
  } else {
    // All-time stats not supported - fall back to showing no data
    championData = null
  }

  const displayName = championNames[apiName] || apiName
  
  // empty state
  if (!championData) {
    return (
      <main className="min-h-screen bg-accent-darker text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* champion header */}
          <div className="bg-abyss-600 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-6">
              <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
                <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
                  <Image
                    src={getChampionImageUrl(apiName, ddragonVersion)}
                    alt={displayName}
                    width={96}
                    height={96}
                    className="w-full h-full object-cover scale-110"
                    unoptimized
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-4xl font-bold mb-2">{displayName}</h1>
                    <div className="text-subtitle">No data available</div>
                  </div>
                  
                  {/* patch & date range filters */}
                  <ChampionFilters availablePatches={availablePatches} />
                </div>
              </div>
            </div>
          </div>

          {/* empty state */}
          <div className="bg-abyss-600 rounded-lg p-12 text-center">
            <p className="text-2xl text-subtitle mb-2">No statistics available yet</p>
            <p className="text-sm text-text-muted">
              {filter === 'patch' && currentPatch
                ? `No matches found for ${displayName} on patch ${currentPatch}. Try selecting a different patch.`
                : `No matches found for ${displayName}. Data will appear once matches are scraped.`}
            </p>
          </div>
        </div>
      </main>
    )
  }
  
  totalGames = championData.games_analyzed

  // Load items data to check item types
  const itemsDataImport = await import('@/data/items.json')
  const itemsData = itemsDataImport.default as Record<string, any>
  
  // Helper functions
  const isBootsItem = (itemId: number): boolean => {
    return itemsData[itemId.toString()]?.itemType === 'boots'
  }
  
  const isFinishedItem = (itemId: number): boolean => {
    const item = itemsData[itemId.toString()]
    if (!item) return false
    const type = item.itemType
    return type === 'legendary' || type === 'boots'
  }

  // Parse JSONB data structure
  const itemsBySlot: Record<number, Array<ItemStat & { winrate: number; pickrate: number }>> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: []
  }
  
  // Extract items by slot from JSONB (slots 1-6 in data, map to 0-5 in UI)
  if (championStatsData?.items) {
    for (let slot = 1; slot <= 6; slot++) {
      const slotData = championStatsData.items[slot.toString()]
      if (slotData && typeof slotData === 'object') {
        const items = Object.entries(slotData)
          .map(([itemId, stats]: [string, any]) => ({
            item_id: parseInt(itemId),
            games: stats.games || 0,
            wins: stats.wins || 0,
            winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
            pickrate: totalGames > 0 ? (stats.games / totalGames) * 100 : 0,
          }))
          .filter(item => isFinishedItem(item.item_id))
          .sort((a, b) => b.pickrate - a.pickrate)
        
        itemsBySlot[slot - 1] = items
      }
    }
  }

  // Extract starter items from JSONB
  const starterItems = championStatsData?.starting 
    ? Object.entries(championStatsData.starting)
        .map(([starterBuild, stats]: [string, any]) => ({
          starter_build: starterBuild,
          items: starterBuild.split(',').map((id: string) => parseInt(id)),
          games: stats.games || 0,
          wins: stats.wins || 0,
          winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
          pickrate: totalGames > 0 ? (stats.games / totalGames) * 100 : 0,
        }))
        .sort((a, b) => b.pickrate - a.pickrate)
    : []
  
  // Extract boots stats - aggregate across all slots
  const bootsMap: Map<number, { games: number; wins: number }> = new Map()
  let totalBootsGames = 0
  let totalBootsWins = 0
  
  if (championStatsData?.items) {
    for (let slot = 1; slot <= 6; slot++) {
      const slotData = championStatsData.items[slot.toString()]
      if (slotData && typeof slotData === 'object') {
        Object.entries(slotData).forEach(([itemId, stats]: [string, any]) => {
          const id = parseInt(itemId)
          if (isBootsItem(id)) {
            const existing = bootsMap.get(id) || { games: 0, wins: 0 }
            bootsMap.set(id, {
              games: existing.games + (stats.games || 0),
              wins: existing.wins + (stats.wins || 0)
            })
            totalBootsGames += stats.games || 0
            totalBootsWins += stats.wins || 0
          }
        })
      }
    }
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
  const noBootsGames = totalGames - totalBootsGames
  const noBootsWins = championData.wins - totalBootsWins
  const noBootsItem = noBootsGames > 0 ? {
    item_id: -2, // special ID for no boots (different from -1 which is "any boots")
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
  
  // Extract rune stats from JSONB
  // Slots 0-3: All runes from primary tree (keystone + 3 others)
  // Slots 4-5: Two runes from secondary tree
  const runeStats: Record<number, Array<{ rune_id: number; games: number; wins: number; winrate: number; pickrate: number }>> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: []
  }
  
  // Slots 0-3: All primary tree runes from runes.primary
  if (championStatsData?.runes?.primary) {
    const allPrimaryRunes = Object.entries(championStatsData.runes.primary)
      .map(([runeId, stats]: [string, any]) => ({
        rune_id: parseInt(runeId),
        games: stats.games || 0,
        wins: stats.wins || 0,
        winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
        pickrate: totalGames > 0 ? (stats.games / totalGames) * 100 : 0
      }))
      .sort((a, b) => b.pickrate - a.pickrate)
    
    // Distribute across slots 0-3 (all primary runes show in all slots for now)
    // In reality, slot 0 is keystones only, slots 1-3 are the other primary runes
    // But we can't distinguish them in aggregated data, so show all in each slot
    runeStats[0] = allPrimaryRunes
    runeStats[1] = allPrimaryRunes  
    runeStats[2] = allPrimaryRunes
    runeStats[3] = allPrimaryRunes
  }
  
  // Slots 4-5: Secondary runes
  if (championStatsData?.runes?.secondary) {
    const secondaryRunes = Object.entries(championStatsData.runes.secondary)
      .map(([runeId, stats]: [string, any]) => ({
        rune_id: parseInt(runeId),
        games: stats.games || 0,
        wins: stats.wins || 0,
        winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
        pickrate: totalGames > 0 ? (stats.games / totalGames) * 100 : 0
      }))
      .sort((a, b) => b.pickrate - a.pickrate)
    
    // Split into two slots (4 and 5)
    runeStats[4] = secondaryRunes
    runeStats[5] = secondaryRunes
  }

  // Extract ability leveling from JSONB
  const abilityLevelingStats = championStatsData?.skills
    ? Object.entries(championStatsData.skills)
        .map(([ability_order, stats]: [string, any]) => ({
          ability_order,
          games: stats.games || 0,
          wins: stats.wins || 0,
          winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
          pickrate: totalGames > 0 ? (stats.games / totalGames) * 100 : 0
        }))
        .sort((a, b) => b.pickrate - a.pickrate)
        .slice(0, 5)
    : []

  // extract summoner spell stats from JSONB
  const summonerSpellStats = championStatsData?.spells
    ? Object.entries(championStatsData.spells)
        .map(([spell_key, stats]: [string, any]) => {
          // parse spell key like "4_32" into spell IDs
          const spellIds = spell_key.split('_').map(id => parseInt(id))
          return {
            spell1_id: spellIds[0],
            spell2_id: spellIds[1],
            games: stats.games || 0,
            wins: stats.wins || 0,
            winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
            pickrate: totalGames > 0 ? (stats.games / totalGames) * 100 : 0
          }
        })
        .sort((a, b) => b.pickrate - a.pickrate)
    : []

  // extract core build combinations from JSONB
  console.log('[DEBUG] championStatsData.core:', championStatsData?.core ? Object.keys(championStatsData.core).length + ' combinations' : 'null/undefined')
  
  const allBuildData = championStatsData?.core
    ? Object.entries(championStatsData.core)
        .map(([comboKey, comboData]: [string, any]) => {
          // parse combo key like "10010_3161_6610" into item IDs
          const normalizedItems = comboKey.split('_').map(id => parseInt(id))
          
          // extract actual boots from the combo's item data
          const actualBoots: number[] = []
          if (comboData.items && typeof comboData.items === 'object') {
            Object.keys(comboData.items).forEach(itemId => {
              const id = parseInt(itemId)
              if (isBootsItem(id)) {
                actualBoots.push(id)
              }
            })
          }
          
          // extract item stats with position data for this combo
          // structure: items -> {item_id} -> {slot} -> {games, wins}
          const comboItemStats: Record<number, { 
            positions: Record<number, { games: number; wins: number }>
          }> = {}
          
          if (comboData.items && typeof comboData.items === 'object') {
            Object.entries(comboData.items).forEach(([itemId, stats]: [string, any]) => {
              const positions: Record<number, { games: number; wins: number }> = {}
              
              // each item has slots as direct children (not nested under 'positions')
              Object.entries(stats).forEach(([key, slotStats]: [string, any]) => {
                const slotNum = parseInt(key)
                // only process numeric keys (slots 1-6), skip 'games'/'wins' if present
                if (!isNaN(slotNum) && slotNum >= 1 && slotNum <= 6 && typeof slotStats === 'object') {
                  positions[slotNum] = {
                    games: slotStats.games || 0,
                    wins: slotStats.wins || 0
                  }
                }
              })
              
              comboItemStats[parseInt(itemId)] = { positions }
            })
          }
          
          return {
            normalizedItems,
            actualBoots,
            games: comboData.games || 0,
            wins: comboData.wins || 0,
            itemStats: comboItemStats,
            runes: comboData.runes || undefined,
            spells: comboData.spells || undefined,
            starting: comboData.starting || undefined
          }
        })
        .sort((a, b) => b.games - a.games)
    : []
  
  console.log('[DEBUG] allBuildData length:', allBuildData.length)

  // For backwards compatibility with build order filtering (if still needed)
  const buildOrders: string[] = []

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
      <div className="max-w-6xl mx-auto px-12 py-8">
        {/* champion header */}
        <div className="bg-abyss-600 rounded-lg p-6 mb-6 border border-gold-dark/40">
          <div className="flex items-center gap-6">
            <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
              <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
                <Image
                  src={getChampionImageUrl(apiName, ddragonVersion)}
                  alt={displayName}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover scale-110"
                  unoptimized
                />
              </div>
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
                <ChampionFilters availablePatches={availablePatches} />
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content with Items and Runes */}
        <div className="bg-abyss-600 rounded-lg p-6 border border-gold-dark/40">
          <ChampionDetailTabs
            itemsBySlot={itemsBySlot}
            bootsItems={bootsItems}
            starterItems={starterItems}
            runeStats={runeStats}
            abilityLevelingStats={abilityLevelingStats}
            summonerSpellStats={summonerSpellStats}
            ddragonVersion={ddragonVersion}
            totalGames={totalGames}
            buildOrders={buildOrders}
            allBuildData={allBuildData}
          />
        </div>
      </div>
    </main>
  )
}
