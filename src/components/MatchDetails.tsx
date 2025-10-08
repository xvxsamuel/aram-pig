"use client"

import type { MatchData } from "../lib/riot-api"
import Image from "next/image"
import Link from "next/link"
import clsx from "clsx"
import { getChampionImageUrl, getItemImageUrl } from "../lib/ddragon-client"

interface Props {
  match: MatchData
  currentPuuid: string
  ddragonVersion: string
  region: string
  isWin: boolean
  isRemake: boolean
}

export default function MatchDetails({ match, currentPuuid, ddragonVersion, region, isWin, isRemake }: Props) {

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
  const formatDamage = (dmg: number) => `${(dmg / 1000).toFixed(0)}k`

  const renderPlayer = (p: any, isCurrentPlayer: boolean) => {
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6]
    const kda = p.deaths === 0 ? "Perfect" : ((p.kills + p.assists) / p.deaths).toFixed(2)
    const dpm = ((p.totalDamageDealtToChampions || 0) / (match.info.gameDuration / 60)).toFixed(0)
    const playerName = p.riotIdGameName || p.summonerName
    const playerTag = p.riotIdTagline || "EUW"
    const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
    
    return (
      <div
        key={p.puuid}
        className={clsx(
          "flex items-center gap-3 py-1 px-2 rounded text-xs",
          isCurrentPlayer && "bg-gold-dark/10 ring-1 ring-gold-light/20"
        )}
      >
        {/* champion icon + level */}
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded overflow-hidden bg-accent-dark border border-gray-600">
            <Image
              src={getChampionImageUrl(p.championName, ddragonVersion)}
              alt={p.championName}
              width={32}
              height={32}
              className="w-full h-full scale-110 object-cover"
            />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 bg-gray-800 border border-gray-600 rounded px-0.5 text-[9px] font-bold leading-none">
            {p.champLevel}
          </div>
        </div>

        {/* name - clickable */}
        <Link 
          href={profileUrl}
          className={clsx(
            "flex-1 min-w-0 font-medium truncate hover:text-gold-light transition-colors",
            isCurrentPlayer ? "text-gold-light" : "text-white"
          )}
        >
          {playerName}
          {p.riotIdTagline && <span className="text-subtitle">#{p.riotIdTagline}</span>}
        </Link>

        {/* damage */}
        <div className="flex flex-col items-center w-12 flex-shrink-0">
          <div className="text-xs text-white font-medium leading-tight">
            {formatDamage(p.totalDamageDealtToChampions || 0)}
          </div>
          <div className="text-[9px] text-gray-400 leading-tight">
            {dpm} DPM
          </div>
        </div>

        {/* kda */}
        <div className="flex flex-col items-center w-12 flex-shrink-0">
          <div className="text-xs text-white font-medium leading-tight">
            {p.kills}/{p.deaths}/{p.assists}
          </div>
          <div className="text-[9px] text-gray-400 leading-tight">
            {kda} KDA
          </div>
        </div>

        {/* gold */}
        <div className="flex flex-col items-center w-12 flex-shrink-0">
          <div className="text-xs text-white font-medium leading-tight">
            {formatGold(p.goldEarned)}
          </div>
          <div className="text-[9px] text-gray-400 leading-tight">
            {p.totalMinionsKilled} CS
          </div>
        </div>

        {/* items */}
        <div className="flex gap-0.5">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="w-5 h-5 rounded bg-gray-800 border border-gray-700 overflow-hidden"
            >
              {item > 0 && (
                <Image
                  src={getItemImageUrl(item, ddragonVersion)}
                  alt={`Item ${item}`}
                  width={20}
                  height={20}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={clsx(
      "p-4 rounded-b-lg",
      isRemake 
        ? "bg-[#2A2A2A]"
        : isWin 
          ? "bg-[#1a2339]"
          : "bg-[#3d2329]"
    )}>
      <div className="space-y-4">
        {/* team 100 */}
          <div className={`border-2 rounded-lg p-3 ${
            team100Won ? 'border-accent-light/50 bg-accent-dark/10' : 'border-red-500/50 bg-red-900/10'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <h3 className={`font-bold ${team100Won ? 'text-accent-light' : 'text-red-400'}`}>
                {team100Won ? 'VICTORY' : 'DEFEAT'}
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
                {team200Won ? 'VICTORY' : 'DEFEAT'}
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
