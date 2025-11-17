'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getChampionImageUrl } from '@/lib/ddragon-client'
import { getChampionDisplayName } from '@/lib/champion-names'
import { getWinrateColor } from '@/lib/winrate-colors'
import clsx from 'clsx'

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
  const [sortKey, setSortKey] = useState<SortKey>('winrate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const totalGames = useMemo(() => {
    return champions.reduce((sum, c) => sum + c.games_analyzed, 0)
  }, [champions])

  // sorted champions
  const sortedChampions = useMemo(() => {
    return [...champions].sort((a, b) => {
      let comparison = 0

      switch (sortKey) {
        case 'rank':
          // rank is based on winrate desc by default
          comparison = b.overall_winrate - a.overall_winrate
          break
        case 'champion':
          const displayA = getChampionDisplayName(a.champion_name, championNames)
          const displayB = getChampionDisplayName(b.champion_name, championNames)
          comparison = displayB.localeCompare(displayA)
          break
        case 'winrate':
          comparison = a.overall_winrate - b.overall_winrate
          break
        case 'pickrate':
          const prA = (a.games_analyzed / totalGames) * 100
          const prB = (b.games_analyzed / totalGames) * 100
          comparison = prA - prB
          break
        case 'matches':
          comparison = a.games_analyzed - b.games_analyzed
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [champions, sortKey, sortDirection])

  // handle column click
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else {
        // reset to default
        setSortKey('winrate')
        setSortDirection('desc')
      }
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  // get border element for sort indicator
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null
    const borderClass = sortDirection === 'desc' ? 'bottom-0' : 'top-0'
    return <span className={`absolute ${borderClass} left-1/2 -translate-x-1/2 h-0.5 bg-accent-light`} style={{ width: 'max-content' }} />
  }

  return (
    <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
      {/* table header */}
      <div className="grid grid-cols-[80px_80px_1fr_120px_120px_120px] gap-4 px-4 border-b border-abyss-700 bg-abyss-700 text-sm text-text-muted">
        <button
          onClick={() => handleSort('rank')}
          className="text-center hover:text-white transition-colors cursor-pointer relative py-4"
        >
          Rank
          {sortKey === 'rank' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[40px] h-0.5 bg-accent-light`} />}
        </button>
        <div className="py-4"></div>
        <button
          onClick={() => handleSort('champion')}
          className="hover:text-white transition-colors cursor-pointer text-left relative py-4"
        >
          Champion
          {sortKey === 'champion' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-0 w-[70px] h-0.5 bg-accent-light`} />}
        </button>
        <button
          onClick={() => handleSort('winrate')}
          className="text-center hover:text-white transition-colors cursor-pointer relative py-4"
        >
          Win Rate
          {sortKey === 'winrate' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-accent-light`} />}
        </button>
        <button
          onClick={() => handleSort('pickrate')}
          className="text-center hover:text-white transition-colors cursor-pointer relative py-4"
        >
          Pick Rate
          {sortKey === 'pickrate' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[65px] h-0.5 bg-accent-light`} />}
        </button>
        <button
          onClick={() => handleSort('matches')}
          className="text-center hover:text-white transition-colors cursor-pointer relative py-4"
        >
          Matches
          {sortKey === 'matches' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-accent-light`} />}
        </button>
      </div>

      {/* table rows */}
      <div>
        {sortedChampions.map((champion, index) => {
          const pickRate = totalGames > 0 ? (champion.games_analyzed / totalGames) * 100 : 0
          
          return (
            <Link
              key={champion.champion_name}
              href={`/champions/${champion.champion_name.toLowerCase()}`}
              className="grid grid-cols-[80px_80px_1fr_120px_120px_120px] gap-4 p-4 border-b border-abyss-800 hover:bg-abyss-700 transition-colors group"
            >
              {/* rank */}
              <div className="text-center font-bold text-subtitle flex items-center justify-center">
                  <h2 className="text-xl font-bold text-center">{index + 1}</h2>
              </div>
              
              {/* champion image */}
              <div className="w-12 h-12 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-xl">
                <div className="w-full h-full rounded-[inherit] overflow-hidden bg-accent-dark">
                  <Image
                    src={getChampionImageUrl(champion.champion_name, ddragonVersion)}
                    alt={champion.champion_name}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              </div>
              
              {/* champion name */}
              <div className="font-semibold flex items-center">
                {getChampionDisplayName(champion.champion_name, championNames)}
              </div>
              
              {/* win rate */}
              <div className="text-center flex items-center justify-center">
                <span 
                  className="text-lg font-bold"
                  style={{ color: getWinrateColor(champion.overall_winrate) }}
                >
                  {champion.overall_winrate.toFixed(2)}%
                </span>
              </div>
              
              {/* pick rate */}
              <div className="text-center flex items-center justify-center text-subtitle">
                {pickRate.toFixed(1)}%
              </div>
              
              {/* matches */}
              <div className="text-center flex items-center justify-center text-subtitle">
                {champion.games_analyzed.toLocaleString()}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
