'use client'

import { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getChampionImageUrl } from '@/lib/api/ddragon'
import { getChampionDisplayName, getSortedChampionNames, getChampionUrlName } from '@/lib/api/champion-names'
import { getWinrateColor, getKdaColor, getPigScoreColor } from '@/lib/ui'

type SortKey = 'games' | 'winrate' | 'kda' | 'damage' | 'pigScore'
type SortDirection = 'asc' | 'desc'

// helper to format numbers without trailing .0
const formatStat = (num: number, decimals: number = 1): string => {
  const rounded = Number(num.toFixed(decimals))
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(decimals)
}

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
  puuid: string
  ddragonVersion: string
  championNames: Record<string, string>
  profileIconUrl: string
  preloadedStats?: ChampionStats[]
}

export default function ChampionStatsList({ puuid, ddragonVersion, championNames, profileIconUrl, preloadedStats }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('games')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [championStats, setChampionStats] = useState<ChampionStats[]>(preloadedStats || [])
  const [loading, setLoading] = useState(!preloadedStats)
  
  // get all champion names sorted alphabetically for skeleton
  const allChampionNames = useMemo(() => getSortedChampionNames(championNames), [championNames])

  // fetch champion stats from api only if not preloaded
  useEffect(() => {
    if (preloadedStats) return // already have data
    
    async function fetchStats() {
      try {
        const response = await fetch(`/api/player-champion-stats?puuid=${puuid}`)
        if (response.ok) {
          const data = await response.json()
          setChampionStats(data)
        }
      } catch (error) {
        console.error('Failed to fetch champion stats:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
  }, [puuid, preloadedStats])

  // calculate aggregate stats
  const aggregateStats = useMemo(() => {
    if (championStats.length === 0) return null

    const totalGames = championStats.reduce((sum, c) => sum + c.games, 0)
    const totalWins = championStats.reduce((sum, c) => sum + c.wins, 0)
    const totalKills = championStats.reduce((sum, c) => sum + c.kills, 0)
    const totalDeaths = championStats.reduce((sum, c) => sum + c.deaths, 0)
    const totalAssists = championStats.reduce((sum, c) => sum + c.assists, 0)
    const totalDamage = championStats.reduce((sum, c) => sum + c.totalDamage, 0)
    
    const gamesWithPigScore = championStats.filter(c => c.averagePigScore !== null)
    const totalPigScore = gamesWithPigScore.reduce((sum, c) => {
      return sum + (c.averagePigScore! * c.games)
    }, 0)
    const totalPigScoreGames = gamesWithPigScore.reduce((sum, c) => sum + c.games, 0)

    return {
      games: totalGames,
      wins: totalWins,
      losses: totalGames - totalWins,
      kills: totalKills,
      deaths: totalDeaths,
      assists: totalAssists,
      totalDamage,
      averagePigScore: totalPigScoreGames > 0 ? totalPigScore / totalPigScoreGames : null
    }
  }, [championStats])

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

  // column header click
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else {
        setSortKey('games')
        setSortDirection('desc')
      }
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  // create display list - skeleton champions if loading, real data if loaded
  const displayList = useMemo(() => {
    if (loading) {
      // show all champions as skeletons while loading
      return allChampionNames.map(championName => ({
        championName,
        games: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        totalDamage: 0,
        averagePigScore: null,
        isLoading: true
      }))
    }
    return sortedChampionStats.map(stat => ({ ...stat, isLoading: false }))
  }, [loading, allChampionNames, sortedChampionStats])

  if (championStats.length === 0 && !loading) {
    return (
      <div className="w-full bg-abyss-600 rounded-lg border border-gold-dark/40 p-8">
        <p className="text-xl text-center text-gray-400">No champion data available</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[20%]" />
            <col className="w-[28%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr className="text-sm text-text-muted bg-abyss-700 border-b border-abyss-700">
              <th className="py-3 text-center font-normal">Rank</th>
              <th className="py-3 text-center font-normal">Champion</th>
              <th className="py-3 text-center font-normal">
                <button 
                  onClick={() => handleSort('winrate')}
                  className="hover:text-white transition-colors relative"
                >
                  Winrate
                  {sortKey === 'winrate' && <span className={`absolute ${sortDirection === 'desc' ? '-bottom-3' : '-top-3'} left-1/2 -translate-x-1/2 w-[55px] h-0.5 bg-accent-light`} />}
                </button>
              </th>
              <th className="py-3 text-center font-normal">
                <button 
                  onClick={() => handleSort('games')}
                  className="hover:text-white transition-colors relative"
                >
                  Games
                  {sortKey === 'games' && <span className={`absolute ${sortDirection === 'desc' ? '-bottom-3' : '-top-3'} left-1/2 -translate-x-1/2 w-[50px] h-0.5 bg-accent-light`} />}
                </button>
              </th>
              <th className="py-3 text-center font-normal">
                <button 
                  onClick={() => handleSort('kda')}
                  className="hover:text-white transition-colors relative"
                >
                  KDA
                  {sortKey === 'kda' && <span className={`absolute ${sortDirection === 'desc' ? '-bottom-3' : '-top-3'} left-1/2 -translate-x-1/2 w-[35px] h-0.5 bg-accent-light`} />}
                </button>
              </th>
              <th className="py-3 text-center font-normal">
                <button 
                  onClick={() => handleSort('damage')}
                  className="hover:text-white transition-colors relative"
                >
                  DMG
                  {sortKey === 'damage' && <span className={`absolute ${sortDirection === 'desc' ? '-bottom-3' : '-top-3'} left-1/2 -translate-x-1/2 w-[40px] h-0.5 bg-accent-light`} />}
                </button>
              </th>
              <th className="py-3 text-center font-normal">
                <button 
                  onClick={() => handleSort('pigScore')}
                  className="hover:text-white transition-colors relative"
                >
                  PIG
                  {sortKey === 'pigScore' && <span className={`absolute ${sortDirection === 'desc' ? '-bottom-3' : '-top-3'} left-1/2 -translate-x-1/2 w-[30px] h-0.5 bg-accent-light`} />}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-dark/40">
            {/* All Champions aggregate row */}
            {aggregateStats && (
              <tr className="bg-abyss-400">
                <td className="py-2 px-2 text-center"><h2 className="text-xl font-bold text-gray-400">-</h2></td>
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-lg flex-shrink-0">
                      <div className="relative w-full h-full rounded-[calc(0.5rem-1px)] overflow-hidden bg-accent-dark flex items-center justify-center">
                        <Image
                          src={profileIconUrl.replace(/\d+\.png$/, "29.png")}
                          alt="All Champions"
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                        <div className="absolute inset-0 rounded-[calc(0.5rem-1px)] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
                      </div>
                    </div>
                    <span className="text-white font-medium text-sm truncate">All Champions</span>
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-3 justify-center">
                    <div className="w-32 h-5 rounded-sm overflow-hidden flex">
                      {aggregateStats.wins > 0 && (
                        <div 
                          className="h-full bg-accent-light flex items-center justify-start px-1.5 text-white text-xs min-w-[28px]"
                          style={{ width: `${(aggregateStats.wins / aggregateStats.games) * 100}%` }}
                        >
                          {aggregateStats.wins}W
                        </div>
                      )}
                      {aggregateStats.losses > 0 && (
                        <div 
                          className="h-full bg-negative flex items-center justify-end px-1.5 text-white text-xs min-w-[28px]"
                          style={{ width: `${(aggregateStats.losses / aggregateStats.games) * 100}%` }}
                        >
                          {aggregateStats.losses}L
                        </div>
                      )}
                    </div>
                    <span className="text-sm" style={{ color: getWinrateColor((aggregateStats.wins / aggregateStats.games) * 100) }}>
                      {((aggregateStats.wins / aggregateStats.games) * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="py-2 text-center text-white text-sm">{aggregateStats.games}</td>
                <td className="py-2 text-center">
                  <div 
                    className="text-sm font-semibold whitespace-nowrap"
                    style={{ color: getKdaColor(
                      aggregateStats.deaths > 0 
                        ? (aggregateStats.kills + aggregateStats.assists) / aggregateStats.deaths 
                        : aggregateStats.kills + aggregateStats.assists
                    ) }}
                  >
                    {aggregateStats.deaths > 0 
                      ? formatStat((aggregateStats.kills + aggregateStats.assists) / aggregateStats.deaths, 2)
                      : formatStat(aggregateStats.kills + aggregateStats.assists, 2)
                    } KDA
                  </div>
                  <div className="text-white text-sm whitespace-nowrap">
                    {formatStat(aggregateStats.kills / aggregateStats.games)} / {formatStat(aggregateStats.deaths / aggregateStats.games)} / {formatStat(aggregateStats.assists / aggregateStats.games)}
                  </div>
                </td>
                <td className="py-2 text-center text-gray-300 text-sm">
                  {Math.round(aggregateStats.totalDamage / aggregateStats.games).toLocaleString()}
                </td>
                <td className="py-2 text-center text-sm">
                  {aggregateStats.averagePigScore !== null ? (
                    <span style={{ color: getPigScoreColor(aggregateStats.averagePigScore) }}>
                      {aggregateStats.averagePigScore.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
              </tr>
            )}

            {displayList.map((stats, index) => {
              const isLoading = 'isLoading' in stats && stats.isLoading
              const kda = !isLoading && stats.deaths > 0 
                ? ((stats.kills + stats.assists) / stats.deaths).toFixed(1)
                : !isLoading ? (stats.kills + stats.assists).toFixed(1) : '0.0'
              const winRate = !isLoading && stats.games > 0 ? ((stats.wins / stats.games) * 100).toFixed(0) : '0'
              const avgDamage = !isLoading && stats.games > 0 ? Math.round(stats.totalDamage / stats.games) : 0

              return (
                <tr 
                  key={stats.championName}
                  className={isLoading ? 'animate-pulse' : ''}
                >
                  <td className="py-2 px-2 text-center">
                    {isLoading ? (
                      <div className="h-6 w-8 bg-abyss-500 rounded mx-auto"></div>
                    ) : (
                      <h2 className="text-xl font-bold">{index + 1}</h2>
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    {isLoading ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-abyss-500 rounded-lg"></div>
                        <div className="h-4 w-20 bg-abyss-500 rounded"></div>
                      </div>
                    ) : (
                      <Link href={`/champions/${getChampionUrlName(stats.championName, championNames)}`} className="flex items-center gap-3 hover:brightness-125 transition-all">
                        <div className="w-10 h-10 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-lg flex-shrink-0">
                          <div className="relative w-full h-full rounded-[calc(0.5rem-1px)] overflow-hidden bg-accent-dark">
                            <Image
                              src={getChampionImageUrl(stats.championName, ddragonVersion)}
                              alt={stats.championName}
                              width={40}
                              height={40}
                              className="w-full h-full object-cover scale-110"
                              unoptimized
                            />
                            <div className="absolute inset-0 rounded-[calc(0.5rem-1px)] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
                          </div>
                        </div>
                        <span className="text-white font-medium text-sm truncate">{getChampionDisplayName(stats.championName, championNames)}</span>
                      </Link>
                    )}
                  </td>
                  <td className="py-2">
                    {isLoading ? (
                      <div className="flex items-center gap-3 justify-center">
                        <div className="w-32 h-5 bg-abyss-500 rounded-sm"></div>
                        <div className="h-4 w-8 bg-abyss-500 rounded"></div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 justify-center">
                        <div className="w-32 h-5 rounded-sm overflow-hidden flex">
                          {stats.wins > 0 && (
                            <div 
                              className="h-full bg-accent-light flex items-center justify-start px-1.5 text-white text-xs min-w-[28px]"
                              style={{ width: `${(stats.wins / stats.games) * 100}%` }}
                            >
                              {stats.wins}W
                            </div>
                          )}
                          {stats.losses > 0 && (
                            <div 
                              className="h-full bg-negative flex items-center justify-end px-1.5 text-white text-xs min-w-[28px]"
                              style={{ width: `${(stats.losses / stats.games) * 100}%` }}
                            >
                              {stats.losses}L
                            </div>
                          )}
                        </div>
                        <span className="text-sm" style={{ color: getWinrateColor((stats.wins / stats.games) * 100) }}>
                          {winRate}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-center text-white text-sm">
                    {isLoading ? (
                      <div className="h-5 w-8 bg-abyss-500 rounded mx-auto"></div>
                    ) : (
                      stats.games
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {isLoading ? (
                      <div className="h-5 w-16 bg-abyss-500 rounded mx-auto"></div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold whitespace-nowrap" style={{ color: getKdaColor(parseFloat(kda)) }}>
                          {formatStat(parseFloat(kda), 2)} KDA
                        </div>
                        <div className="text-white text-sm whitespace-nowrap">
                          {formatStat(stats.kills / stats.games)} / {formatStat(stats.deaths / stats.games)} / {formatStat(stats.assists / stats.games)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-2 text-center text-gray-300 text-sm">
                    {isLoading ? (
                      <div className="h-5 w-12 bg-abyss-500 rounded mx-auto"></div>
                    ) : (
                      avgDamage.toLocaleString()
                    )}
                  </td>
                  <td className="py-2 text-center text-sm">
                    {isLoading ? (
                      <div className="h-5 w-10 bg-abyss-500 rounded mx-auto"></div>
                    ) : stats.averagePigScore !== null ? (
                      <span style={{ color: getPigScoreColor(stats.averagePigScore) }}>
                        {stats.averagePigScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
