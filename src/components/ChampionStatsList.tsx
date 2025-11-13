'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { getChampionImageUrl } from '../lib/ddragon-client'
import { getChampionDisplayName } from '../lib/champion-names'

type SortKey = 'games' | 'winrate' | 'kda' | 'damage' | 'pigScore'
type SortDirection = 'asc' | 'desc'

interface ChampionStats {
  championName: string
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  totalDamage: number
  averagePigScore: number | null
}

interface Props {
  matches: any[] // match data from parent
  puuid: string
  ddragonVersion: string
  championNames: Record<string, string>
}

export default function ChampionStatsList({ matches, puuid, ddragonVersion, championNames }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('games')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // calculate champion stats from matches
  const championStats = useMemo(() => {
    const statsMap = new Map<string, ChampionStats>()

    matches.forEach(match => {
      const participant = match.info.participants.find((p: any) => p.puuid === puuid)
      if (!participant || participant.gameEndedInEarlySurrender) return // exclude remakes

      const championName = participant.championName
      const existing = statsMap.get(championName)

      if (existing) {
        existing.games++
        existing.wins += participant.win ? 1 : 0
        existing.losses += participant.win ? 0 : 1
        existing.kills += participant.kills
        existing.deaths += participant.deaths
        existing.assists += participant.assists
        existing.totalDamage += participant.totalDamageDealtToChampions || 0
        
        // update average pig score
        if (participant.pigScore !== null && participant.pigScore !== undefined) {
          const currentTotal = (existing.averagePigScore || 0) * (existing.games - 1)
          existing.averagePigScore = (currentTotal + participant.pigScore) / existing.games
        }
      } else {
        statsMap.set(championName, {
          championName,
          games: 1,
          wins: participant.win ? 1 : 0,
          losses: participant.win ? 0 : 1,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          totalDamage: participant.totalDamageDealtToChampions || 0,
          averagePigScore: participant.pigScore ?? null
        })
      }
    })

    return Array.from(statsMap.values())
  }, [matches, puuid])

  // sorted champion stats based on current sort settings
  const sortedChampionStats = useMemo(() => {
    return [...championStats].sort((a, b) => {
      let comparison = 0

      switch (sortKey) {
        case 'games':
          comparison = a.games - b.games
          break
        case 'winrate':
          const wrA = a.wins / a.games
          const wrB = b.wins / b.games
          comparison = wrA - wrB
          break
        case 'kda':
          const kdaA = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists
          const kdaB = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : b.kills + b.assists
          comparison = kdaA - kdaB
          break
        case 'damage':
          const avgDmgA = a.totalDamage / a.games
          const avgDmgB = b.totalDamage / b.games
          comparison = avgDmgA - avgDmgB
          break
        case 'pigScore':
          const pigA = a.averagePigScore ?? -1
          const pigB = b.averagePigScore ?? -1
          comparison = pigA - pigB
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [championStats, sortKey, sortDirection])

  // handle column header click
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        // first click: desc, second click: asc
        setSortDirection('asc')
      } else {
        // third click: reset to default (games desc)
        setSortKey('games')
        setSortDirection('desc')
      }
    } else {
      // new column, default to descending
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  if (championStats.length === 0) {
    return (
      <div className="w-full bg-abyss-600 rounded-lg border border-gold-dark/40">
        <p className="text-xl">No champion data available</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="bg-abyss-600 rounded-lg border border-gold-dark/40">
        {/* header */}
        <div className="flex items-center gap-2 px-1 py-3 bg-abyss-500 rounded-lg text-sm font-semibold text-gray-400">
          <div className="w-[60px] text-center">Rank</div>
          <div className="w-[80px]">Champion</div>
          <div className="flex-1"></div>
          <button 
            onClick={() => handleSort('games')}
            className="w-[80px] text-center hover:text-white transition-colors"
          >
            Games {sortKey === 'games' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('winrate')}
            className="w-[80px] text-center hover:text-white transition-colors"
          >
            Winrate {sortKey === 'winrate' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('kda')}
            className="w-[120px] text-center hover:text-white transition-colors"
          >
            KDA {sortKey === 'kda' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('damage')}
            className="w-[100px] text-center hover:text-white transition-colors"
          >
            DMG {sortKey === 'damage' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            onClick={() => handleSort('pigScore')}
            className="w-[100px] text-center hover:text-white transition-colors"
          >
            PIG {sortKey === 'pigScore' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
        </div>

        {/* champion rows */}
        <div className="divide-y divide-gold-dark/40" style={{ willChange: 'contents' }}>
          {sortedChampionStats.map((stats, index) => {
            const kda = stats.deaths > 0 
              ? ((stats.kills + stats.assists) / stats.deaths).toFixed(2)
              : (stats.kills + stats.assists).toFixed(2)
            const winRate = ((stats.wins / stats.games) * 100).toFixed(0)
            const avgDamage = Math.round(stats.totalDamage / stats.games)

            return (
              <div 
                key={stats.championName}
                className="flex items-center gap-2 px-1 py-2 hover:bg-abyss-300 transition-colors"
              >
                {/* rank */}
                <div className="w-[60px] text-center text-xl font-bold text-gold-light">
                  <h2 className="text-xl font-bold text-center">{index + 1}</h2>
                </div>

                {/* champion icon */}
                <div className="w-[80px]">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-accent-dark">
                    <Image
                      src={getChampionImageUrl(stats.championName, ddragonVersion)}
                      alt={stats.championName}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>

                {/* champion name */}
                <div className="flex-1 text-white font-medium">
                  {getChampionDisplayName(stats.championName, championNames)}
                </div>

                {/* games */}
                <div className="w-[80px] text-center text-white">
                  {stats.games}
                </div>

                {/* win rate */}
                <div className="w-[80px] text-center">
                  <span className={stats.wins > stats.losses ? 'text-accent-light' : 'text-negative'}>
                    {winRate}%
                  </span>
                </div>

                {/* kda */}
                <div className="w-[120px] text-center">
                  <div className="text-gray-300">
                    <span className="text-white">{stats.kills}</span> / {stats.deaths} / <span className="text-white">{stats.assists}</span>
                  </div>
                  <div className={`text-xs ${parseFloat(kda) >= 3 ? 'text-gold-light' : 'text-gray-400'}`}>
                    {kda} KDA
                  </div>
                </div>

                {/* avg damage */}
                <div className="w-[100px] text-center text-gray-300">
                  {avgDamage.toLocaleString()}
                </div>

                {/* pig score */}
                <div className="w-[100px] text-center">
                  {stats.averagePigScore !== null ? (
                    <span 
                      className={
                        stats.averagePigScore >= 70 
                          ? 'text-accent-light' 
                          : stats.averagePigScore >= 50 
                          ? 'text-yellow-400' 
                          : 'text-negative'
                      }
                    >
                      {stats.averagePigScore.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
