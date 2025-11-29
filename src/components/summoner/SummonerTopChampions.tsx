"use client"

import Image from "next/image"
import Link from "next/link"
import { getChampionImageUrl } from "@/lib/api/ddragon"
import { getChampionDisplayName, getChampionUrlName } from "@/lib/api/champion-names"
import { getWinrateColor, getKdaColor, getPigScoreColor } from "@/lib/ui"
import ProfileCard from "@/components/ui/ProfileCard"

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
  onTabChange: (tab: 'overview' | 'champions' | 'performance') => void
}

export default function SummonerTopChampions({ 
  championStats,
  topChampions,
  ddragonVersion, 
  championNames,
  onTabChange
}: Props) {
  const formatStat = (num: number, decimals: number = 1): string => {
    const rounded = Number(num.toFixed(decimals))
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(decimals)
  }

  return (
    <ProfileCard 
      title="Champions" 
      onTitleClick={() => onTabChange('champions')}
    >
      <div className="-mx-2 space-y-1">
          {championStats.length === 0 ? (
            // loading skeleton
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-2 animate-pulse">
                <div className="w-8 h-8 bg-abyss-500 rounded"></div>
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
                  className="flex items-center gap-3 py-2 px-2 rounded-lg"
                >
                  <Link
                    href={`/champions/${getChampionUrlName(champ.championName, championNames)}`}
                    className="flex items-center gap-3 min-w-0 flex-1 hover:brightness-75 transition-all"
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
                      <div className="text-sm font-medium text-white truncate">
                        {getChampionDisplayName(champ.championName, championNames)}
                      </div>
                      <div className="text-xs" style={{ color: champ.averagePigScore !== null ? getPigScoreColor(champ.averagePigScore) : 'var(--color-text-muted)' }}>
                        {champ.averagePigScore !== null ? `${Math.round(champ.averagePigScore)} PIG` : '-'}
                      </div>
                    </div>
                  </Link>
                  <div className="text-center flex-shrink-0 w-24">
                    <div className="text-sm font-bold" style={{ color: getKdaColor(parseFloat(kda)) }}>
                      {kda} KDA
                    </div>
                    <div className="text-xs text-text-muted whitespace-nowrap">
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
    </ProfileCard>
  )
}
