'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getChampionImageUrl, getChampionDisplayName, getChampionUrlName } from '@/lib/ddragon'
import { getWinrateColor, getTierSortValue, getTierBorderGradient, type ChampionTier } from '@/lib/ui'

type SortKey = 'rank' | 'champion' | 'winrate' | 'pickrate' | 'matches' | 'tier'
type SortDirection = 'asc' | 'desc'

interface ChampionStats {
  champion_name: string
  overall_winrate: number
  games_analyzed: number
  tier: ChampionTier | null
}

interface Props {
  champions: ChampionStats[]
  ddragonVersion: string
  championNames: Record<string, string>
}

export default function ChampionTable({ champions, ddragonVersion, championNames }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>('tier')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const totalGames = useMemo(() => champions.reduce((sum, c) => sum + c.games_analyzed, 0), [champions])

  const sortedChampions = useMemo(() => {
    if (sortKey === null) return champions

    return [...champions].sort((a, b) => {
      let comparison = 0

      switch (sortKey) {
        case 'rank':
          comparison = b.overall_winrate - a.overall_winrate
          break
        case 'champion': {
          const displayA = getChampionDisplayName(a.champion_name, championNames)
          const displayB = getChampionDisplayName(b.champion_name, championNames)
          comparison = displayA.localeCompare(displayB)
          break
        }
        case 'winrate':
          comparison = a.overall_winrate - b.overall_winrate
          break
        case 'pickrate': {
          const prA = (a.games_analyzed / totalGames) * 100
          const prB = (b.games_analyzed / totalGames) * 100
          comparison = prA - prB
          break
        }
        case 'matches':
          comparison = a.games_analyzed - b.games_analyzed
          break
        case 'tier':
          comparison = getTierSortValue(a.tier) - getTierSortValue(b.tier)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [champions, sortKey, sortDirection, totalGames, championNames])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else {
        setSortKey('tier')
        setSortDirection('desc')
      }
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  return (
    <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
      {/* table header */}
      <div className="flex items-stretch gap-3 px-3 border-b border-abyss-700 bg-abyss-700 text-sm text-subtitle">
        <div className="w-14 flex items-center justify-center py-3">Rank</div>
        <SortButton label="Champion" sortKey="champion" currentKey={sortKey} direction={sortDirection} onClick={handleSort} className="w-44" />
        <div className="flex-1" />
        <SortButton label="Tier" sortKey="tier" currentKey={sortKey} direction={sortDirection} onClick={handleSort} isDefault className="w-16" />
        <SortButton label="Win Rate" shortLabel="WR" sortKey="winrate" currentKey={sortKey} direction={sortDirection} onClick={handleSort} className="w-20 sm:w-24" />
        <SortButton label="Pick Rate" shortLabel="PR" sortKey="pickrate" currentKey={sortKey} direction={sortDirection} onClick={handleSort} className="w-20 sm:w-24" />
        <SortButton label="Matches" shortLabel="#" sortKey="matches" currentKey={sortKey} direction={sortDirection} onClick={handleSort} className="w-20 sm:w-24" />
      </div>

      {/* table rows */}
      <div>
        {sortedChampions.map((champion, index) => {
          const pickRate = totalGames > 0 ? (champion.games_analyzed / totalGames) * 100 : 0
          const tier = champion.tier
          const tierBorder = getTierBorderGradient(tier)

          return (
            <Link
              key={champion.champion_name}
              href={`/champions/${getChampionUrlName(champion.champion_name, championNames)}`}
              className="flex items-center gap-3 py-2 px-3 border-b border-abyss-800 hover:bg-gold-light/10 transition-colors"
            >
              <div className="w-14 text-center">
                <h2 className="text-lg font-bold">{index + 1}</h2>
              </div>

              <div className="w-44 flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-accent-dark border border-gold-dark/40">
                  <Image
                    src={getChampionImageUrl(champion.champion_name, ddragonVersion)}
                    alt={champion.champion_name}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover scale-110"
                    unoptimized
                  />
                  <div className="absolute inset-0 rounded-lg shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
                </div>
                <span className="font-medium text-sm truncate">
                  {getChampionDisplayName(champion.champion_name, championNames)}
                </span>
              </div>

              <div className="flex-1" />

              <div className="w-16 flex items-center justify-center">
                <div
                  className="p-px rounded-full overflow-hidden"
                  style={{ 
                    background: tierBorder ? `linear-gradient(to bottom, ${tierBorder.from}, ${tierBorder.to})` : 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))',
                    boxShadow: tier === 'S+' ? '0 0 15px rgba(74, 158, 255, 0.9), 0 0 25px rgba(58, 131, 230, 0.7), 0 0 35px rgba(74, 158, 255, 0.5)' : 'none'
                  }}
                >
                  <div className="px-2 py-0.5 rounded-[inherit] bg-abyss-900 flex items-center justify-center">
                    <span 
                      className="text-xs font-bold text-white"
                      style={{
                        textShadow: tier === 'S+' ? '0 0 10px rgba(74, 158, 255, 1), 0 0 20px rgba(58, 131, 230, 0.8), 0 0 30px rgba(74, 158, 255, 0.6)' : 'none',
                      }}
                    >
                      {tier}
                    </span>
                  </div>
                </div>
              </div>

              <div className="w-20 sm:w-24 text-center">
                <span className="font-bold" style={{ color: getWinrateColor(champion.overall_winrate) }}>
                  {Number(champion.overall_winrate).toFixed(2).replace(/\.?0+$/, '')}%
                </span>
              </div>

              <div className="w-20 sm:w-24 text-center text-subtitle text-sm">{pickRate.toFixed(1)}%</div>

              <div className="w-20 sm:w-24 text-center text-subtitle text-sm">
                {champion.games_analyzed.toLocaleString()}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// extracted sort button component
function SortButton({
  label,
  shortLabel,
  sortKey,
  currentKey,
  direction,
  onClick,
  isDefault,
  className,
}: {
  label: string
  shortLabel?: string
  sortKey: SortKey
  currentKey: SortKey | null
  direction: SortDirection
  onClick: (key: SortKey) => void
  isDefault?: boolean
  className?: string
}) {
  const isActive = currentKey === sortKey || (isDefault && currentKey === null)

  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center justify-center hover:text-white transition-colors cursor-pointer py-3 relative ${isActive ? 'text-white' : ''} ${className}`}
    >
      {shortLabel ? (
        <>
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </>
      ) : (
        label
      )}
      {isActive && (
        <span className={`absolute left-0 right-0 h-0.5 bg-accent-light ${direction === 'desc' ? 'bottom-0' : 'top-0'}`} />
      )}
    </button>
  )
}
