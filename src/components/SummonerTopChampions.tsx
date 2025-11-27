"use client"

import Image from "next/image"
import Link from "next/link"
import { getChampionImageUrl } from "../lib/ddragon-client"
import { getChampionDisplayName, getChampionUrlName } from "../lib/champion-names"
import { getWinrateColor, getKdaColor, getPigScoreColor } from "../lib/winrate-colors"

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
  championStats: ChampionStats[]
  topChampions: ChampionStats[]
  ddragonVersion: string
  championNames: Record<string, string>
  onShowMore: () => void
  onTabChange: (tab: 'overview' | 'champions' | 'performance') => void
}

export default function SummonerTopChampions({ 
  championStats,
  topChampions,
  ddragonVersion, 
  championNames,
  onShowMore,
  onTabChange
}: Props) {
  const formatStat = (num: number, decimals: number = 1): string => {
    const rounded = Number(num.toFixed(decimals))
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(decimals)
  }

  return (
    <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
      <div className="px-4 py-1.5">
        <button 
          onClick={() => onTabChange('champions')}
          className="text-xl font-bold text-left mb-1.5 transition-colors cursor-pointer"
        >
          <h2>Champions</h2>
        </button>
        <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-4 -mx-4" />
        
        <div className="space-y-1">
          {championStats.length === 0 ? (
            // loading skeleton
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
                <div className="w-10 h-10 bg-abyss-500 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 w-20 bg-abyss-500 rounded mb-1"></div>
                  <div className="h-3 w-28 bg-abyss-500 rounded"></div>
                </div>
                <div className="h-5 w-12 bg-abyss-500 rounded"></div>
              </div>
            ))
          ) : (
            topChampions.map((champ) => {
              const kda = champ.deaths > 0 
                ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                : (champ.kills + champ.assists).toFixed(2)
              const winrate = (champ.wins / champ.games) * 100
              
              return (
                <div 
                  key={champ.championName}
                  className="flex items-center gap-3 py-2 rounded-md -mx-1 px-1"
                >
                  <Link
                    href={`/champions/${getChampionUrlName(champ.championName, championNames)}`}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0 flex-1"
                  >
                    <div className="w-8 h-8 rounded overflow-hidden bg-abyss-700 flex-shrink-0">
                      <Image
                        src={getChampionImageUrl(champ.championName, ddragonVersion)}
                        alt={champ.championName}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover scale-110"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold tracking-wide text-white truncate transition-colors">
                        {getChampionDisplayName(champ.championName, championNames)}
                      </div>
                      <div className="text-xs truncate" style={{ color: champ.averagePigScore !== null ? getPigScoreColor(champ.averagePigScore) : 'var(--color-text-muted)' }}>
                        {champ.averagePigScore !== null ? `${Math.round(champ.averagePigScore)} PIG` : '-'}
                      </div>
                    </div>
                  </Link>
                  <div className="text-center flex-shrink-0 w-20">
                    <div className="text-sm font-bold" style={{ color: getKdaColor(parseFloat(kda)) }}>
                      {kda} KDA
                    </div>
                    <div className="text-xs text-text-muted">
                      {formatStat(champ.kills / champ.games)} / {formatStat(champ.deaths / champ.games)} / {formatStat(champ.assists / champ.games)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 w-16">
                    <div 
                      className="text-sm font-bold"
                      style={{ color: getWinrateColor(winrate) }}
                    >
                      {winrate.toFixed(0)}%
                    </div>
                    <div className="text-xs text-text-muted">
                      {champ.games} Games
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
