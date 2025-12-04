'use client'

import useSWR from 'swr'
import Image from 'next/image'
import { getChampionImageUrl } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'
import ChampionDetailTabs from './ChampionDetailTabs'
import PatchFilter from '@/components/filters/PatchFilter'
import itemsData from '@/data/items.json'

// SWR fetcher
const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (res.status === 404) return null
    if (!res.ok) throw new Error('Failed to fetch champion data')
    return res.json()
  })

interface ChampionStatsResponse {
  championName: string
  apiName: string
  patch: string
  lastUpdated: string
  overview: {
    games: number
    wins: number
    winrate: number
  }
  averages: {
    damageToChampions: number
    totalDamage: number
    healing: number
    shielding: number
    healingShielding: number
    ccTime: number
    deaths: number
    gameDuration: number
  }
  perMinuteStats: {
    damageToChampionsPerMin: { mean: number; stdDev: number; variance: number; sampleSize: number }
    totalDamagePerMin: { mean: number; stdDev: number; variance: number; sampleSize: number }
    healingShieldingPerMin: { mean: number; stdDev: number; variance: number; sampleSize: number }
    ccTimePerMin: { mean: number; stdDev: number; variance: number; sampleSize: number }
    deathsPerMin: { mean: number; stdDev: number; variance: number; sampleSize: number }
  }
  topItems: Record<string, Array<{ key: string; games: number; wins: number; winrate: number }>>
  topRunes: {
    primary: Array<{ key: string; games: number; wins: number; winrate: number }>
    secondary: Array<{ key: string; games: number; wins: number; winrate: number }>
    statPerks: {
      offense: Array<{ key: string; games: number; wins: number; winrate: number }>
      flex: Array<{ key: string; games: number; wins: number; winrate: number }>
      defense: Array<{ key: string; games: number; wins: number; winrate: number }>
    }
  }
  topSpells: Array<{ key: string; games: number; wins: number; winrate: number }>
  topStarters: Array<{ key: string; games: number; wins: number; winrate: number }>
  topSkillOrders: Array<{ key: string; games: number; wins: number; winrate: number }>
  topCoreBuilds: Array<{ itemCombo: string; items: number[]; games: number; wins: number; winrate: number }>
  raw: any
}

interface Props {
  championName: string
  displayName: string
  apiName: string
  ddragonVersion: string
  availablePatches: string[]
  selectedPatch?: string
}

const items = itemsData as Record<string, any>

const isBootsItem = (itemId: number): boolean => {
  return items[itemId.toString()]?.itemType === 'boots'
}

const isFinishedItem = (itemId: number): boolean => {
  const item = items[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
}

export default function ChampionPageClient({
  championName,
  displayName,
  apiName,
  ddragonVersion,
  availablePatches,
  selectedPatch,
}: Props) {
  const currentPatch = selectedPatch || availablePatches[0]

  // swr with stale-while-revalidate caching
  const { data, error, isLoading } = useSWR<ChampionStatsResponse | null>(
    `/api/champion-stats/${championName}?patch=${currentPatch}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  // loading state
  if (isLoading && !data) {
    return (
      <main className="min-h-screen bg-accent-darker text-white">
        <div className="max-w-6xl mx-auto px-12 py-8">
          <div className="bg-abyss-600 rounded-lg p-6 mb-6 border border-gold-dark/40">
            <div className="flex items-center gap-6">
              <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
                <div className="relative w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="h-10 w-48 bg-abyss-800 rounded animate-pulse mb-4" />
                <div className="h-6 w-32 bg-abyss-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="bg-abyss-600 rounded-lg p-6 border border-gold-dark/40 h-96 animate-pulse" />
        </div>
      </main>
    )
  }

  // error state
  if (error) {
    return (
      <main className="min-h-screen bg-accent-darker text-white">
        <div className="max-w-6xl mx-auto px-12 py-8">
          <div className="bg-red-900/50 rounded-lg p-6 text-center">
            <p className="text-xl">Error loading champion data</p>
            <p className="text-sm text-red-300 mt-2">{error.message}</p>
          </div>
        </div>
      </main>
    )
  }

  // no data state
  if (!data) {
    return (
      <main className="min-h-screen bg-accent-darker text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-abyss-600 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-6">
              <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
                <div className="relative w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
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
                  <div className="bg-abyss-800 border border-gold-dark/40 rounded-lg p-4">
                    <PatchFilter availablePatches={availablePatches} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-abyss-600 rounded-lg p-12 text-center">
            <p className="text-2xl text-subtitle mb-2">No statistics available yet</p>
            <p className="text-sm text-text-muted">
              No matches found for {displayName} on patch {currentPatch}. Try selecting a different patch.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const totalGames = data.overview.games

  // transform API response to component props format
  const itemsBySlot: Record<
    number,
    Array<{ item_id: number; games: number; wins: number; winrate: number; pickrate: number }>
  > = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  }

  // map slot1-slot6 to 0-5
  for (let slot = 1; slot <= 6; slot++) {
    const slotKey = `slot${slot}` as keyof typeof data.topItems
    const slotData = data.topItems[slotKey]
    if (slotData) {
      itemsBySlot[slot - 1] = slotData
        .filter(item => isFinishedItem(parseInt(item.key)))
        .map(item => ({
          item_id: parseInt(item.key),
          games: item.games,
          wins: item.wins,
          winrate: item.winrate,
          pickrate: totalGames > 0 ? (item.games / totalGames) * 100 : 0,
        }))
    }
  }

  // aggregate boots across all slots
  const bootsMap = new Map<number, { games: number; wins: number }>()
  let totalBootsGames = 0
  let totalBootsWins = 0

  if (data.raw?.items) {
    for (let slot = 1; slot <= 6; slot++) {
      const slotData = data.raw.items[slot.toString()]
      if (slotData && typeof slotData === 'object') {
        Object.entries(slotData).forEach(([itemId, stats]: [string, any]) => {
          const id = parseInt(itemId)
          if (isBootsItem(id)) {
            const existing = bootsMap.get(id) || { games: 0, wins: 0 }
            bootsMap.set(id, {
              games: existing.games + (stats.games || 0),
              wins: existing.wins + (stats.wins || 0),
            })
            totalBootsGames += stats.games || 0
            totalBootsWins += stats.wins || 0
          }
        })
      }
    }
  }

  const bootsItems = Array.from(bootsMap.entries()).map(([item_id, d]) => ({
    item_id,
    games: d.games,
    wins: d.wins,
    winrate: d.games > 0 ? (d.wins / d.games) * 100 : 0,
    pickrate: totalGames > 0 ? (d.games / totalGames) * 100 : 0,
  }))

  // "no boots" stat
  const noBootsGames = totalGames - totalBootsGames
  const noBootsWins = data.overview.wins - totalBootsWins
  if (noBootsGames > 0) {
    bootsItems.push({
      item_id: -2,
      games: noBootsGames,
      wins: noBootsWins,
      winrate: (noBootsWins / noBootsGames) * 100,
      pickrate: (noBootsGames / totalGames) * 100,
    })
  }
  bootsItems.sort((a, b) => b.pickrate - a.pickrate)

  // starter items
  const starterItems = data.topStarters.map(s => ({
    starter_build: s.key,
    items: s.key.split(',').map(id => parseInt(id)),
    games: s.games,
    wins: s.wins,
    winrate: s.winrate,
    pickrate: totalGames > 0 ? (s.games / totalGames) * 100 : 0,
  }))

  // rune stats (simplified - same for all primary slots)
  const runeStats: Record<
    number,
    Array<{ rune_id: number; games: number; wins: number; winrate: number; pickrate: number }>
  > = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  }

  const primaryRunes = data.topRunes.primary.map(r => ({
    rune_id: parseInt(r.key),
    games: r.games,
    wins: r.wins,
    winrate: r.winrate,
    pickrate: totalGames > 0 ? (r.games / totalGames) * 100 : 0,
  }))

  runeStats[0] = primaryRunes
  runeStats[1] = primaryRunes
  runeStats[2] = primaryRunes
  runeStats[3] = primaryRunes

  const secondaryRunes = data.topRunes.secondary.map(r => ({
    rune_id: parseInt(r.key),
    games: r.games,
    wins: r.wins,
    winrate: r.winrate,
    pickrate: totalGames > 0 ? (r.games / totalGames) * 100 : 0,
  }))

  runeStats[4] = secondaryRunes
  runeStats[5] = secondaryRunes

  // ability leveling
  const abilityLevelingStats = data.topSkillOrders.slice(0, 5).map(s => ({
    ability_order: s.key,
    games: s.games,
    wins: s.wins,
    winrate: s.winrate,
    pickrate: totalGames > 0 ? (s.games / totalGames) * 100 : 0,
  }))

  // summoner spells
  const summonerSpellStats = data.topSpells.map(s => {
    const spellIds = s.key.split('_').map(id => parseInt(id))
    return {
      spell1_id: spellIds[0],
      spell2_id: spellIds[1],
      games: s.games,
      wins: s.wins,
      winrate: s.winrate,
      pickrate: totalGames > 0 ? (s.games / totalGames) * 100 : 0,
    }
  })

  // core builds (from raw data for full item position info)
  // Sort by Lower Bound Wilson Score - balances winrate with statistical confidence
  // This naturally penalizes low-sample builds AND low-winrate builds
  const MIN_CORE_GAMES = 50 // Fixed minimum games to show a core
  const allBuildData = data.raw?.core
    ? (() => {
        const coreEntries = Object.entries(data.raw.core as Record<string, any>)
        
        // Calculate champion's overall winrate as baseline
        const totalCoreGames = coreEntries.reduce((sum, [, d]: [string, any]) => sum + (d.games || 0), 0)
        const totalCoreWins = coreEntries.reduce((sum, [, d]: [string, any]) => sum + (d.wins || 0), 0)
        const championWinrate = totalCoreGames > 0 ? (totalCoreWins / totalCoreGames) * 100 : 50
        
        return coreEntries
          .map(([comboKey, comboData]: [string, any]) => {
            const normalizedItems = comboKey.split('_').map(id => parseInt(id))
            const games = comboData.games || 0
            const wins = comboData.wins || 0
            const winrate = games > 0 ? (wins / games) * 100 : 0
            
            // Wilson Score Lower Bound (95% confidence)
            // This gives us the lower bound of what the "true" winrate likely is
            // Low sample sizes get pulled down heavily, high samples stay close to actual WR
            // Formula: (p + z²/2n - z*sqrt(p(1-p)/n + z²/4n²)) / (1 + z²/n)
            // where p = winrate (0-1), n = games, z = 1.96 for 95% confidence
            const p = winrate / 100
            const n = games
            const z = 1.96
            const z2 = z * z
            
            let wilsonLowerBound: number
            if (n === 0) {
              wilsonLowerBound = 0
            } else {
              const denominator = 1 + z2 / n
              const centerAdjusted = p + z2 / (2 * n)
              const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
              wilsonLowerBound = (centerAdjusted - spread) / denominator
            }
            
            // Convert back to percentage
            const wilsonScore = wilsonLowerBound * 100

            const actualBoots: number[] = []
            if (comboData.items && typeof comboData.items === 'object') {
              Object.keys(comboData.items).forEach(itemId => {
                const id = parseInt(itemId)
                if (isBootsItem(id)) actualBoots.push(id)
              })
            }

            const comboItemStats: Record<number, { positions: Record<number, { games: number; wins: number }> }> = {}

            if (comboData.items && typeof comboData.items === 'object') {
              Object.entries(comboData.items).forEach(([itemId, stats]: [string, any]) => {
                const positions: Record<number, { games: number; wins: number }> = {}
                Object.entries(stats).forEach(([key, slotStats]: [string, any]) => {
                  const slotNum = parseInt(key)
                  if (!isNaN(slotNum) && slotNum >= 1 && slotNum <= 6 && typeof slotStats === 'object') {
                    positions[slotNum] = {
                      games: slotStats.games || 0,
                      wins: slotStats.wins || 0,
                    }
                  }
                })
                comboItemStats[parseInt(itemId)] = { positions }
              })
            }

            return {
              normalizedItems,
              actualBoots,
              games,
              wins,
              winrate,
              wilsonScore,
              championWinrate,
              itemStats: comboItemStats,
              runes: comboData.runes || undefined,
              spells: comboData.spells || undefined,
              starting: comboData.starting || undefined,
            }
          })
          // Filter: must have exactly 3 core items, minimum 100 games, AND winrate at least (champion average - 5%)
          // normalizedItems uses 99999 for boots, so we count actual items
          .filter(c => c.normalizedItems.length === 3 && c.games >= MIN_CORE_GAMES && c.winrate >= (c.championWinrate - 5))
          .sort((a, b) => b.wilsonScore - a.wilsonScore)
      })()
    : []

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-6xl mx-auto px-12 py-8">
        {/* champion header */}
        <div className="bg-abyss-600 rounded-lg p-6 mb-6 border border-gold-dark/40">
          <div className="flex items-center gap-6">
            <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
              <div className="relative w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
                <Image
                  src={getChampionImageUrl(apiName, ddragonVersion)}
                  alt={displayName}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover scale-110"
                  unoptimized
                />
                <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-4xl font-bold mb-2">{displayName}</h1>
                  <div className="flex gap-6 text-lg">
                    <div>
                      <span className="text-subtitle">Winrate: </span>
                      <span className="font-bold" style={{ color: getWinrateColor(data.overview.winrate) }}>
                        {data.overview.winrate.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-subtitle">Games: </span>
                      <span className="font-bold">{data.overview.games.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-sm text-subtitle mt-2">
                    Last updated: {new Date(data.lastUpdated).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-abyss-800 border border-gold-dark/40 rounded-lg p-4">
                  <PatchFilter availablePatches={availablePatches} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content */}
        <div className="bg-abyss-600 rounded-lg p-6 border border-gold-dark/40">
          <ChampionDetailTabs
            itemsBySlot={itemsBySlot}
            bootsItems={bootsItems}
            starterItems={starterItems}
            runeStats={runeStats}
            statPerks={data.topRunes.statPerks}
            abilityLevelingStats={abilityLevelingStats}
            summonerSpellStats={summonerSpellStats}
            ddragonVersion={ddragonVersion}
            totalGames={totalGames}
            buildOrders={[]}
            allBuildData={allBuildData}
            championWinrate={data.overview.winrate}
          />
        </div>
      </div>
    </main>
  )
}
