"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState, useEffect } from "react"
import type { MatchData } from "@/lib/riot-api"
import { getWinrateColor } from "@/lib/winrate-colors"
import ProfileCard from "@/components/ui/ProfileCard"

interface Props {
  matches: MatchData[]
  currentPuuid: string
  region: string
  ddragonVersion: string
}

interface PlayerStats {
  puuid: string
  gameName: string
  tagLine: string
  games: number
  wins: number
  losses: number
}

export default function RecentlyPlayedWith({ matches, currentPuuid, region, ddragonVersion }: Props) {
  const [profileIcons, setProfileIcons] = useState<Record<string, number>>({})

  const recentPlayers = useMemo(() => {
    const playerMap = new Map<string, PlayerStats>()

    for (const match of matches) {
      // find current player to know their team
      const currentPlayer = match.info.participants.find(p => p.puuid === currentPuuid)
      if (!currentPlayer) continue

      // get teammates (same team, exclude self)
      const teammates = match.info.participants.filter(
        p => p.teamId === currentPlayer.teamId && p.puuid !== currentPuuid
      )

      for (const teammate of teammates) {
        const existing = playerMap.get(teammate.puuid)
        const won = teammate.win

        if (existing) {
          existing.games++
          if (won) existing.wins++
          else existing.losses++
        } else {
          playerMap.set(teammate.puuid, {
            puuid: teammate.puuid,
            gameName: teammate.riotIdGameName || teammate.summonerName || 'Unknown',
            tagLine: teammate.riotIdTagline || '',
            games: 1,
            wins: won ? 1 : 0,
            losses: won ? 0 : 1
          })
        }
      }
    }

    // sort by games played (descending), then by winrate
    return Array.from(playerMap.values())
      .filter(p => p.games >= 2)
      .sort((a, b) => {
        if (b.games !== a.games) return b.games - a.games
        const winrateA = a.wins / a.games
        const winrateB = b.wins / b.games
        return winrateB - winrateA
      })
      .slice(0, 10)
  }, [matches, currentPuuid])

  // fetch icons
  useEffect(() => {
    if (recentPlayers.length === 0) return

    const puuids = recentPlayers.map(p => p.puuid)
    
    fetch('/api/summoner-icons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puuids, region })
    })
      .then(res => res.ok ? res.json() : {})
      .then(data => setProfileIcons(data))
      .catch(err => console.error('Failed to fetch profile icons:', err))
  }, [recentPlayers, region])

  if (recentPlayers.length === 0) {
    return null
  }

  return (
    <ProfileCard title="Recently played with">
      <div className="-mx-2 space-y-1">
        {recentPlayers.map((player) => {
            const winrate = (player.wins / player.games) * 100
            const profileUrl = `/${region}/${encodeURIComponent(player.gameName)}-${encodeURIComponent(player.tagLine)}`
            const iconId = profileIcons[player.puuid] || 29 // default icon
            
            return (
              <Link 
                key={player.puuid}
                href={profileUrl}
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gold-light/10 transition-colors"
              >
                {/* Profile Icon */}
                <div className="w-8 h-8 rounded-full overflow-hidden bg-abyss-700 flex-shrink-0">
                  <Image
                    src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${iconId}.png`}
                    alt={player.gameName}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Name and Games */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {player.gameName}
                    {player.tagLine && (
                      <span className="text-text-muted ml-1">#{player.tagLine}</span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">
                    {player.games} Games
                  </div>
                </div>
                
                {/* W/L Stats */}
                <div className="text-right flex-shrink-0 w-16">
                  <div 
                    className="text-sm font-bold"
                    style={{ color: getWinrateColor(winrate) }}
                  >
                    {winrate.toFixed(0)}%
                  </div>
                  <div className="text-xs text-text-muted">
                    {player.wins}W / {player.losses}L
                  </div>
                </div>
              </Link>
            )
        })}
      </div>
    </ProfileCard>
  )
}
