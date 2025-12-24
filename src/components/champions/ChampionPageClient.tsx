'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import Image from 'next/image'
import clsx from 'clsx'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getChampionImageUrl } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'
import ChampionDetailTabs from './ChampionDetailTabs'
import PatchFilter from '@/components/filters/PatchFilter'
import itemsData from '@/data/items.json'

// swr fetcher
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
  overview: {
    games: number
    wins: number
    winrate: number
    pickrate?: number
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
  const [selectedTab, setSelectedTab] = useState<'overview' | 'items' | 'runes' | 'leveling'>('overview')
  const [championImageUrl, setChampionImageUrl] = useState<string | undefined>(undefined)

  // handle hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash === 'items') setSelectedTab('items')
      else if (hash === 'runes') setSelectedTab('runes')
      else if (hash === 'leveling') setSelectedTab('leveling')
      else if (hash === 'overview' || hash === '' || hash.startsWith('overview-')) setSelectedTab('overview')
      else if (hash === 'best' || hash === 'worst') setSelectedTab('overview')
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleTabChange = (tab: 'overview' | 'items' | 'runes' | 'leveling') => {
    setSelectedTab(tab)
    window.location.hash = tab === 'overview' ? 'best' : tab
  }

  useEffect(() => {
    if (apiName) {
      const url = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${apiName}_0.jpg`
      fetch(url)
        .then(res => (res.ok ? setChampionImageUrl(res.url) : null))
        .catch(() => {})
    }
  }, [apiName])

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
      <>
        <section className="relative overflow-hidden bg-abyss-700">
          <div className="max-w-6xl mx-auto px-8 py-6 pb-8 relative z-10">
            <div className="flex items-start gap-6">
              <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark flex-shrink-0">
                <div className="relative w-24 h-24 rounded-[inherit] bg-abyss-800 overflow-hidden">
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
              
              <div className="flex-1 flex flex-col justify-between h-28">
                <h1 className="text-3xl font-semibold text-white">{displayName}</h1>
                <div className="flex items-end gap-12">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="h-3 w-16 bg-abyss-500 rounded animate-pulse" />
                      <div className="h-8 w-24 bg-abyss-500 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex-shrink-0">
                <PatchFilter availablePatches={availablePatches} />
              </div>
            </div>

            <div className="flex gap-6 mt-4">
              {['Overview', 'Items', 'Runes', 'More Stats'].map((tab) => (
                <div
                  key={tab}
                  className="px-6 py-2 font-semibold tracking-wide border-b-2 border-transparent text-text-muted opacity-50 cursor-default"
                >
                  {tab}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-8 py-12 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </>
    )
  }

  // error state
  if (error) {
    return (
      <>
        <div className="max-w-6xl mx-auto px-8 py-8">
          <div className="bg-red-900/50 rounded-lg p-6 text-center">
            <p className="text-xl">Error loading champion data</p>
            <p className="text-sm text-red-300 mt-2">{error.message}</p>
          </div>
        </div>
      </>
    )
  }

  // no data state
  if (!data) {
    return (
      <>
        <section className="relative overflow-hidden bg-abyss-700">
          <div className="max-w-6xl mx-auto px-8 py-6 pb-8 relative z-10">
            <div className="flex items-start gap-6">
              <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark flex-shrink-0">
                <div className="relative w-24 h-24 rounded-[inherit] bg-abyss-800 overflow-hidden">
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
              
              <div className="flex-1 flex flex-col justify-between h-28">
                <h1 className="text-3xl font-semibold text-white">{displayName}</h1>
                <div className="flex items-end gap-12">
                  <div className="flex flex-col">
                    <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Winrate</span>
                    <span className="text-2xl font-semibold text-text-muted">-</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Pickrate</span>
                    <span className="text-2xl font-semibold text-text-muted">-</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Games</span>
                    <span className="text-2xl font-semibold text-text-muted">0</span>
                  </div>
                </div>
              </div>
              
              <div className="flex-shrink-0">
                <PatchFilter availablePatches={availablePatches} />
              </div>
            </div>

            <div className="flex gap-6 mt-4">
              {['Overview', 'Items', 'Runes', 'More Stats'].map((tab) => (
                <div
                  key={tab}
                  className="px-6 py-2 font-semibold tracking-wide border-b-2 border-transparent text-text-muted opacity-50 cursor-default"
                >
                  {tab}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-8 py-12 text-center">
          <p className="text-2xl text-subtitle mb-2">No statistics available yet</p>
          <p className="text-sm text-text-muted">
            No matches found for {displayName} on patch {currentPatch}. Try selecting a different patch.
          </p>
        </div>
      </>
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

  // core builds - sort by lower bound wilson score
  const MIN_CORE_GAMES = 50 // fixed minimum games to show a core build
  const allBuildData = data.raw?.core
    ? (() => {
        const coreEntries = Object.entries(data.raw.core as Record<string, any>)
        
        // calculate champion's overall winrate as baseline
        const totalCoreGames = coreEntries.reduce((sum, [, d]: [string, any]) => sum + (d.games || 0), 0)
        const totalCoreWins = coreEntries.reduce((sum, [, d]: [string, any]) => sum + (d.wins || 0), 0)
        const championWinrate = totalCoreGames > 0 ? (totalCoreWins / totalCoreGames) * 100 : 50
        
        return coreEntries
          .map(([comboKey, comboData]: [string, any]) => {
            const normalizedItems = comboKey.split('_').map(id => parseInt(id))
            const games = comboData.games || 0
            const wins = comboData.wins || 0
            const winrate = games > 0 ? (wins / games) * 100 : 0
            
            // wilson score lower bound (95% confidence)
            // this gives us the lower bound of what the "true" winrate likely is
            // low sample sizes get pulled down heavily, high samples stay close to actual WR
            // formula: (p + z²/2n - z*sqrt(p(1-p)/n + z²/4n²)) / (1 + z²/n)
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
            
            // convert back to percentage
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
              Object.entries(comboData.items).forEach(([itemIdStr, stats]: [string, any]) => {
                const itemId = parseInt(itemIdStr)
                if (isNaN(itemId)) return

                const positions: Record<number, { games: number; wins: number }> = {}
                if (stats && typeof stats === 'object') {
                  Object.entries(stats).forEach(([posStr, slotStats]: [string, any]) => {
                    const slotNum = parseInt(posStr)
                    if (!isNaN(slotNum) && slotNum >= 1 && slotNum <= 6) {
                      positions[slotNum] = {
                        games: slotStats.games || 0,
                        wins: slotStats.wins || 0,
                      }
                    }
                  })
                }
                
                if (Object.keys(positions).length > 0) {
                  comboItemStats[itemId] = { positions }
                }
              })
            }

            const welford = comboData.welford
            const damageStats = welford?.damageToChampionsPerMin && welford.damageToChampionsPerMin.n > 1 ? {
                stdDev: Math.sqrt(welford.damageToChampionsPerMin.m2 / welford.damageToChampionsPerMin.n),
                variance: welford.damageToChampionsPerMin.m2 / welford.damageToChampionsPerMin.n
            } : undefined

            return {
              normalizedItems,
              actualBoots,
              games,
              wins,
              winrate,
              wilsonScore,
              pickrate: totalGames > 0 ? (games / totalGames) * 100 : 0,
              stdDev: damageStats?.stdDev,
              variance: damageStats?.variance,
              championWinrate,
              itemStats: comboItemStats,
              runes: comboData.runes || undefined,
              spells: comboData.spells || undefined,
              starting: comboData.starting || undefined,
              skills: comboData.skills || undefined,
            }
          })
          // filter: must have exactly 3 core items, minimum games
          // normalizedItems uses 99999 for boots, so we count actual items
          .filter(c => c.normalizedItems.length === 3 && c.games >= MIN_CORE_GAMES)
          .sort((a, b) => b.wilsonScore - a.wilsonScore)
      })()
    : []

  return (
    <>
      {/* champion header */}
      <section className="relative overflow-hidden bg-abyss-700">
        {championImageUrl && (
          <>
            <div className="absolute inset-0 flex justify-center overflow-hidden">
              <div className="w-full max-w-6xl relative h-full">
                <div className="absolute right-[-2%] top-[-20%] bottom-[-80%] w-[80%] opacity-50">
                  <Image
                    src={championImageUrl}
                    alt={displayName}
                    fill
                    className="object-cover"
                    style={{ objectPosition: 'center 20%' }}
                    unoptimized
                    priority
                  />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-abyss-700)_70%)]" />
                </div>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-abyss-700 from-30% via-transparent to-transparent" />
          </>
        )}
        <div className="max-w-6xl mx-auto px-8 py-6 pb-8 relative z-10">
          <div className="flex items-start gap-6">
            {/* champion icon*/}
            <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark flex-shrink-0">
              <div className="relative w-24 h-24 rounded-[inherit] bg-abyss-800 overflow-hidden">
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
            
            <div className="flex-1 flex flex-col justify-between h-28">
              <h1 className="text-3xl font-semibold text-white">{displayName}</h1>
              <div className="flex items-end gap-12">
                <div className="flex flex-col">
                  <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Winrate</span>
                  <span className="text-2xl font-semibold" style={{ color: getWinrateColor(data.overview.winrate) }}>
                    {data.overview.winrate.toFixed(2)}%
                  </span>
                </div>
                
                {data.overview.pickrate !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Pickrate</span>
                    <span className="text-2xl font-semibold text-white">
                      {data.overview.pickrate.toFixed(1)}%
                    </span>
                  </div>
                )}

                <div className="flex flex-col">
                  <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Games</span>
                  <span className="text-2xl font-semibold text-white">{data.overview.games.toLocaleString()}</span>
                </div>

                {data.perMinuteStats.damageToChampionsPerMin && (
                  <>
                    <div className="flex flex-col">
                      <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Mean DPM</span>
                      <span className="text-2xl font-semibold text-white">{Math.round(data.perMinuteStats.damageToChampionsPerMin.mean).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-0.5">Std Dev</span>
                      <span className="text-2xl font-semibold text-white">±{Math.round(data.perMinuteStats.damageToChampionsPerMin.stdDev).toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* patch filter */}
            <div className="flex-shrink-0">
              <PatchFilter availablePatches={availablePatches} />
            </div>
          </div>

          {/* tab navigation */}
          <div className="flex gap-6 mt-4">
            <button
              onClick={() => handleTabChange('overview')}
              className={clsx(
                'cursor-pointer px-6 py-2 font-semibold tracking-wide transition-all border-b-2',
                selectedTab === 'overview'
                  ? 'border-accent-light text-white'
                  : 'border-transparent text-text-muted hover:text-white'
              )}
            >
              Overview
            </button>
            <button
              onClick={() => handleTabChange('items')}
              className={clsx(
                'cursor-pointer px-4 py-2 font-semibold tracking-wide transition-all border-b-2',
                selectedTab === 'items'
                  ? 'border-accent-light text-white'
                  : 'border-transparent text-text-muted hover:text-white'
              )}
            >
              Items
            </button>
            <button
              onClick={() => handleTabChange('runes')}
              className={clsx(
                'cursor-pointer px-4 py-2 font-semibold tracking-wide transition-all border-b-2',
                selectedTab === 'runes'
                  ? 'border-accent-light text-white'
                  : 'border-transparent text-text-muted hover:text-white'
              )}
            >
              Runes
            </button>
            <button
              onClick={() => handleTabChange('leveling')}
              className={clsx(
                'cursor-pointer px-6 py-2 font-semibold tracking-wide transition-all border-b-2',
                selectedTab === 'leveling'
                  ? 'border-accent-light text-white'
                  : 'border-transparent text-text-muted hover:text-white'
              )}
            >
              More Stats
            </button>
          </div>
        </div>
      </section>

      {/* main content */}
      <div className="max-w-6xl mx-auto px-8">
        <ChampionDetailTabs
          selectedTab={selectedTab}
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
          championName={championName}
        />
      </div>
    </>
  )
}
