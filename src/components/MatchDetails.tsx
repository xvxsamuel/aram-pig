"use client"

import type { MatchData } from "../lib/riot-api"
import Image from "next/image"

interface Props {
  match: MatchData
  currentPuuid: string
  ddragonVersion: string
}

export default function MatchDetails({ match, currentPuuid, ddragonVersion }: Props) {

  // separate teams
  const team100 = match.info.participants.filter(p => p.teamId === 100)
  const team200 = match.info.participants.filter(p => p.teamId === 200)
  
  const team100Won = team100[0]?.win || false
  const team200Won = team200[0]?.win || false

  // calculate team totals
  const team100Gold = team100.reduce((sum, p) => sum + p.goldEarned, 0)
  const team200Gold = team200.reduce((sum, p) => sum + p.goldEarned, 0)
  const team100Kills = team100.reduce((sum, p) => sum + p.kills, 0)
  const team200Kills = team200.reduce((sum, p) => sum + p.kills, 0)

  const formatGold = (gold: number) => `${(gold / 1000).toFixed(1)}k`

  const renderPlayer = (p: any, isCurrentPlayer: boolean) => {
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6]
    
    return (
      <div
        key={p.puuid}
        className={`flex items-center gap-3 p-2 rounded ${
          isCurrentPlayer ? 'bg-accent-dark/20' : ''
        }`}
      >
        {/* champion icon */}
        <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
          <Image
            src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${p.championName}.png`}
            alt={p.championName}
            width={40}
            height={40}
            className="object-cover"
          />
          <div className="absolute bottom-0 right-0 bg-neutral-dark text-xs px-1 rounded">
            {p.champLevel}
          </div>
        </div>

        {/* summoner name */}
        <div className="flex-1 min-w-0">
          <div className={`font-medium truncate ${isCurrentPlayer ? 'text-accent-light' : ''}`}>
            {p.riotIdGameName || p.summonerName || 'Unknown'}
            {p.riotIdTagline && <span className="text-neutral-light">#{p.riotIdTagline}</span>}
          </div>
          <div className="text-xs text-neutral-light">
            {p.kills}/{p.deaths}/{p.assists} • {formatGold(p.goldEarned)} • {p.totalMinionsKilled} cs
          </div>
        </div>

        {/* items */}
        <div className="flex gap-1">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="w-7 h-7 rounded bg-neutral-dark border border-neutral-light/20 overflow-hidden flex-shrink-0"
            >
              {item > 0 && (
                <Image
                  src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${item}.png`}
                  alt={`Item ${item}`}
                  width={28}
                  height={28}
                  className="object-cover"
                />
              )}
            </div>
          ))}
        </div>

        {/* damage */}
        <div className="text-right text-sm text-neutral-light flex-shrink-0 w-16">
          {(p.totalDamageDealtToChampions / 1000).toFixed(1)}k
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-neutral-light/10 bg-neutral-dark/30 p-4">
      <div className="space-y-4">
        {/* team 100 */}
          <div className={`border-2 rounded-lg p-3 ${
            team100Won ? 'border-accent-light/50 bg-accent-dark/10' : 'border-red-500/50 bg-red-900/10'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <h3 className={`font-bold ${team100Won ? 'text-accent-light' : 'text-red-400'}`}>
                {team100Won ? '✓ VICTORY' : '✗ DEFEAT'}
              </h3>
              <div className="text-sm text-neutral-light">
                {team100Kills} kills • {formatGold(team100Gold)} gold
              </div>
            </div>
            <div className="space-y-1">
              {team100.map(p => renderPlayer(p, p.puuid === currentPuuid))}
            </div>
          </div>

          {/* team 200 */}
          <div className={`border-2 rounded-lg p-3 ${
            team200Won ? 'border-accent-light/50 bg-accent-dark/10' : 'border-red-500/50 bg-red-900/10'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <h3 className={`font-bold ${team200Won ? 'text-accent-light' : 'text-red-400'}`}>
                {team200Won ? '✓ VICTORY' : '✗ DEFEAT'}
              </h3>
              <div className="text-sm text-neutral-light">
                {team200Kills} kills • {formatGold(team200Gold)} gold
              </div>
            </div>
            <div className="space-y-1">
              {team200.map(p => renderPlayer(p, p.puuid === currentPuuid))}
            </div>
          </div>
        </div>
      </div>
    )
  }