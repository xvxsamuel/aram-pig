'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getChampionImageUrl, getChampionDisplayName, getChampionUrlName } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'

type SortKey = 'rank' | 'champion' | 'winrate' | 'pickrate' | 'matches'
type SortDirection = 'asc' | 'desc'

interface ChampionStats {
  champion_name: string
  overall_winrate: number
  games_analyzed: number
}

interface Props {
  champions: ChampionStats[]
  ddragonVersion: string
  championNames: Record<string, string>
}

export default function ChampionTable({ champions, ddragonVersion, championNames }: Props) {
  const [allChampions, setAllChampions] = useState<ChampionStats[]>(champions)

  // update when champions prop changes
  useEffect(() => {
    setAllChampions(champions)
  }, [champions])

  const [sortKey, setSortKey] = useState<SortKey | null>(null) // null means use server sort
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const totalGames = useMemo(() => {
    return allChampions.reduce((sum, c) => sum + c.games_analyzed, 0)
  }, [allChampions])

  // sorted champions
  const sortedChampions = useMemo(() => {
    // pre-sorted by wr in server
    if (sortKey === null) {
      return allChampions
    }

    return [...allChampions].sort((a, b) => {
      let comparison = 0

      switch (sortKey) {
        case 'rank':
          comparison = b.overall_winrate - a.overall_winrate
          break
        case 'champion': {
          const displayA = getChampionDisplayName(a.champion_name, championNames)
          const displayB = getChampionDisplayName(b.champion_name, championNames)
          comparison = displayB.localeCompare(displayA)
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
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [allChampions, sortKey, sortDirection, totalGames, championNames])

  // handle column click
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else {
        // default
        setSortKey('winrate')
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
        <button
          onClick={() => handleSort('champion')}
          className={`w-44 flex items-center justify-center hover:text-white transition-colors cursor-pointer py-3 relative ${sortKey === 'champion' ? 'text-white' : ''}`}
        >
          Champion
          {sortKey === 'champion' && (
            <span
              className={`absolute left-0 right-0 h-0.5 bg-accent-light ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'}`}
            />
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => handleSort('winrate')}
          className={`w-20 sm:w-24 flex items-center justify-center hover:text-white transition-colors cursor-pointer py-3 relative ${sortKey === 'winrate' || sortKey === null ? 'text-white' : ''}`}
        >
          <span className="hidden sm:inline">Win Rate</span>
          <span className="sm:hidden">WR</span>
          {(sortKey === 'winrate' || sortKey === null) && (
            <span
              className={`absolute left-0 right-0 h-0.5 bg-accent-light ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'}`}
            />
          )}
        </button>
        <button
          onClick={() => handleSort('pickrate')}
          className={`w-20 sm:w-24 flex items-center justify-center hover:text-white transition-colors cursor-pointer py-3 relative ${sortKey === 'pickrate' ? 'text-white' : ''}`}
        >
          <span className="hidden sm:inline">Pick Rate</span>
          <span className="sm:hidden">PR</span>
          {sortKey === 'pickrate' && (
            <span
              className={`absolute left-0 right-0 h-0.5 bg-accent-light ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'}`}
            />
          )}
        </button>
        <button
          onClick={() => handleSort('matches')}
          className={`w-20 sm:w-24 flex items-center justify-center hover:text-white transition-colors cursor-pointer py-3 relative ${sortKey === 'matches' ? 'text-white' : ''}`}
        >
          <span className="hidden sm:inline">Matches</span>
          <span className="sm:hidden">#</span>
          {sortKey === 'matches' && (
            <span
              className={`absolute left-0 right-0 h-0.5 bg-accent-light ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'}`}
            />
          )}
        </button>
      </div>

      {/* table rows */}
      <div>
        {sortedChampions.map((champion, index) => {
          const pickRate = totalGames > 0 ? (champion.games_analyzed / totalGames) * 100 : 0

          return (
            <Link
              key={`${champion.champion_name}-${index}`}
              href={`/champions/${getChampionUrlName(champion.champion_name, championNames)}`}
              className="flex items-center gap-3 py-2 px-3 border-b border-abyss-800 hover:bg-gold-light/10 transition-colors"
            >
              {/* rank */}
              <div className="w-14 text-center">
                <h2 className="text-lg font-bold">{index + 1}</h2>
              </div>

              {/* champion icon + name */}
              <div className="w-44 flex items-center gap-3">
                <div className="w-10 h-10 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-lg flex-shrink-0">
                  <div className="relative w-full h-full rounded-[inherit] overflow-hidden bg-accent-dark">
                    <Image
                      src={getChampionImageUrl(champion.champion_name, ddragonVersion)}
                      alt={champion.champion_name}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover scale-110"
                      unoptimized
                    />
                    <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
                  </div>
                </div>
                <span className="font-medium text-sm truncate">
                  {getChampionDisplayName(champion.champion_name, championNames)}
                </span>
              </div>

              {/* spacer */}
              <div className="flex-1" />

              {/* win rate */}
              <div className="w-20 sm:w-24 text-center">
                <span className="font-bold" style={{ color: getWinrateColor(champion.overall_winrate) }}>
                  {Number(champion.overall_winrate)
                    .toFixed(2)
                    .replace(/\.?0+$/, '')}
                  %
                </span>
              </div>

              {/* pick rate */}
              <div className="w-20 sm:w-24 text-center text-subtitle text-sm">{pickRate.toFixed(1)}%</div>

              {/* matches */}
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
