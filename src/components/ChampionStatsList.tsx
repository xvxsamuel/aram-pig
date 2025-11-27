'use client'

import { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getChampionImageUrl } from '../lib/ddragon-client'
import { getChampionDisplayName, getSortedChampionNames, getChampionUrlName } from '../lib/champion-names'
import { getWinrateColor, getKdaColor, getPigScoreColor } from '../lib/winrate-colors'

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
      <div className="bg-abyss-600 rounded-lg border border-gold-dark/40">
        {/* header */}
        <div className="flex items-stretch gap-2 px-1 border-abyss-700 bg-abyss-700 rounded-lg text-sm text-text-muted">
          <div className="w-[60px] text-center flex items-center justify-center py-3">Rank</div>
          <div className="w-[80px] flex items-center py-3">Champion</div>
          <div className="w-[200px] flex items-center py-3">Name</div>
          <button 
            onClick={() => handleSort('winrate')}
            className="w-[260px] text-center hover:text-white transition-colors relative py-3"
          >
            Winrate
            {sortKey === 'winrate' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[55px] h-0.5 bg-accent-light`} />}
          </button>
          <button 
            onClick={() => handleSort('games')}
            className="w-[80px] text-center hover:text-white transition-colors relative py-3"
          >
            Games
            {sortKey === 'games' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[50px] h-0.5 bg-accent-light`} />}
          </button>
          <button 
            onClick={() => handleSort('kda')}
            className="w-[120px] text-center hover:text-white transition-colors relative py-3"
          >
            KDA
            {sortKey === 'kda' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[35px] h-0.5 bg-accent-light`} />}
          </button>
          <button 
            onClick={() => handleSort('damage')}
            className="w-[100px] text-center hover:text-white transition-colors relative py-3"
          >
            DMG
            {sortKey === 'damage' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[40px] h-0.5 bg-accent-light`} />}
          </button>
          <button 
            onClick={() => handleSort('pigScore')}
            className="w-[100px] text-center hover:text-white transition-colors relative py-3"
          >
            PIG
            {sortKey === 'pigScore' && <span className={`absolute ${sortDirection === 'desc' ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-[30px] h-0.5 bg-accent-light`} />}
          </button>
        </div>

        {/* champion rows */}
        <div className="divide-y divide-gold-dark/40" style={{ willChange: 'contents' }}>
          {/* All Champions aggregate row */}
          {aggregateStats && (
            <div className="flex items-center gap-2 px-1 py-2 bg-abyss-400">
              {/* rank */}
              <div className="w-[60px] text-center text-xl font-bold text-gray-400">
                -
              </div>

              {/* champion icon */}
              <div className="w-[80px] flex items-center">
                <div className="w-12 h-12 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-xl">
                  <div className="w-full h-full rounded-[inherit] overflow-hidden bg-accent-dark flex items-center justify-center">
                    <Image
                      src={profileIconUrl.replace(/\d+\.png$/, "29.png")}
                      alt="All Champions"
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>
              </div>

              {/* champion name */}
              <div className="w-[200px] text-white font-medium">
                All Champions
              </div>

              {/* win rate pill with W/L text inside */}
              <div className="w-[260px] flex items-center gap-2">
                <div className="w-[200px] h-6 rounded-sm overflow-hidden flex">
                  {aggregateStats.wins > 0 && (
                    <div 
                      className="h-full bg-accent-light flex items-center justify-start px-2 text-white text-xs"
                      style={{ width: `${(aggregateStats.wins / aggregateStats.games) * 100}%` }}
                    >
                      {aggregateStats.wins}W
                    </div>
                  )}
                  {aggregateStats.losses > 0 && (
                    <div 
                      className="h-full bg-negative flex items-center justify-end px-2 text-white text-xs"
                      style={{ width: `${(aggregateStats.losses / aggregateStats.games) * 100}%` }}
                    >
                      {aggregateStats.losses}L
                    </div>
                  )}
                </div>
                <span style={{ color: getWinrateColor((aggregateStats.wins / aggregateStats.games) * 100) }}>
                  {((aggregateStats.wins / aggregateStats.games) * 100).toFixed(0)}%
                </span>
              </div>

              {/* games */}
              <div className="w-[80px] text-center text-white">
                {aggregateStats.games}
              </div>

              {/* kda */}
              <div className="w-[120px] text-center">
                <div className="text-gray-300">
                  <span className="text-white">{formatStat(aggregateStats.kills / aggregateStats.games)}</span> / {formatStat(aggregateStats.deaths / aggregateStats.games)} / <span className="text-white">{formatStat(aggregateStats.assists / aggregateStats.games)}</span>
                </div>
                <div 
                  className="text-xs font-semibold"
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
              </div>

              {/* avg damage */}
              <div className="w-[100px] text-center text-gray-300">
                {Math.round(aggregateStats.totalDamage / aggregateStats.games).toLocaleString()}
              </div>

              {/* pig score */}
              <div className="w-[100px] text-center">
                {aggregateStats.averagePigScore !== null ? (
                  <span style={{ color: getPigScoreColor(aggregateStats.averagePigScore) }}>
                    {aggregateStats.averagePigScore.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
            </div>
          )}

          {displayList.map((stats, index) => {
            const isLoading = 'isLoading' in stats && stats.isLoading
            const kda = !isLoading && stats.deaths > 0 
              ? ((stats.kills + stats.assists) / stats.deaths).toFixed(2)
              : !isLoading ? (stats.kills + stats.assists).toFixed(2) : '0.00'
            const winRate = !isLoading && stats.games > 0 ? ((stats.wins / stats.games) * 100).toFixed(0) : '0'
            const avgDamage = !isLoading && stats.games > 0 ? Math.round(stats.totalDamage / stats.games) : 0

            return (
              <div 
                key={stats.championName}
                className={`flex items-center gap-2 px-1 py-2 transition-colors ${isLoading ? 'animate-pulse' : 'hover:bg-gold-light/20 cursor-pointer'}`}
              >
                {/* rank */}
                <div className="w-[60px] text-center text-xl font-bold text-gold-light">
                  {isLoading ? (
                    <div className="h-6 w-8 bg-abyss-500 rounded mx-auto"></div>
                  ) : (
                    <h2 className="text-xl font-bold text-center">{index + 1}</h2>
                  )}
                </div>

                {/* champion icon */}
                <div className="w-[80px] flex items-center">
                  {isLoading ? (
                    <div className="w-12 h-12 bg-abyss-500 rounded-xl"></div>
                  ) : (
                    <Link href={`/champions/${getChampionUrlName(stats.championName, championNames)}`}>
                      <div className="w-12 h-12 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-xl cursor-pointer">
                        <div className="w-full h-full rounded-[inherit] overflow-hidden bg-accent-dark">
                          <Image
                            src={getChampionImageUrl(stats.championName, ddragonVersion)}
                            alt={stats.championName}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover scale-110"
                            unoptimized
                          />
                        </div>
                      </div>
                    </Link>
                  )}
                </div>

                {/* champion name */}
                <div className="w-[200px] text-white font-medium">
                  {isLoading ? (
                    <div className="h-5 w-32 bg-abyss-500 rounded"></div>
                  ) : (
                    getChampionDisplayName(stats.championName, championNames)
                  )}
                </div>

                {/* win rate pill */}
                <div className="w-[260px] flex items-center gap-2">
                  {isLoading ? (
                    <>
                      <div className="w-[200px] h-6 bg-abyss-500 rounded-sm"></div>
                      <div className="h-4 w-10 bg-abyss-500 rounded"></div>
                    </>
                  ) : (
                    <>
                      <div className="w-[200px] h-6 rounded-sm overflow-hidden flex">
                        {stats.wins > 0 && (
                          <div 
                            className="h-full bg-accent-light flex items-center justify-start px-2 text-white text-xs"
                            style={{ width: `${(stats.wins / stats.games) * 100}%` }}
                          >
                            {stats.wins}W
                          </div>
                        )}
                        {stats.losses > 0 && (
                          <div 
                            className="h-full bg-negative flex items-center justify-end px-2 text-white text-xs"
                            style={{ width: `${(stats.losses / stats.games) * 100}%` }}
                          >
                            {stats.losses}L
                          </div>
                        )}
                      </div>
                      <span style={{ color: getWinrateColor((stats.wins / stats.games) * 100) }}>
                        {winRate}%
                      </span>
                    </>
                  )}
                </div>

                {/* games */}
                <div className="w-[80px] text-center text-white">
                  {isLoading ? (
                    <div className="h-5 w-12 bg-abyss-500 rounded mx-auto"></div>
                  ) : (
                    stats.games
                  )}
                </div>

                {/* kda */}
                <div className="w-[120px] text-center">
                  {isLoading ? (
                    <div className="h-5 w-20 bg-abyss-500 rounded mx-auto"></div>
                  ) : (
                    <>
                      <div className="text-white">
                        <span className="text-white">{formatStat(stats.kills / stats.games)}</span> / {formatStat(stats.deaths / stats.games)} / <span className="text-white">{formatStat(stats.assists / stats.games)}</span>
                      </div>
                      <div className="text-xs font-semibold" style={{ color: getKdaColor(parseFloat(kda)) }}>
                        {formatStat(parseFloat(kda), 2)} KDA
                      </div>
                    </>
                  )}
                </div>

                {/* avg damage */}
                <div className="w-[100px] text-center text-gray-300">
                  {isLoading ? (
                    <div className="h-5 w-16 bg-abyss-500 rounded mx-auto"></div>
                  ) : (
                    avgDamage.toLocaleString()
                  )}
                </div>

                {/* pig score */}
                <div className="w-[100px] text-center">
                  {isLoading ? (
                    <div className="h-5 w-12 bg-abyss-500 rounded mx-auto"></div>
                  ) : stats.averagePigScore !== null ? (
                    <span style={{ color: getPigScoreColor(stats.averagePigScore) }}>
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
