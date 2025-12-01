'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { RecentPlayer } from '@/types/profile'
import { getWinrateColor } from '@/lib/ui'
import ProfileCard from '@/components/ui/ProfileCard'

interface Props {
  players: RecentPlayer[]
  region: string
  ddragonVersion: string
}

export default function RecentlyPlayedWithList({ players, region, ddragonVersion }: Props) {
  if (players.length === 0) {
    return null
  }

  return (
    <ProfileCard title="Recently played with">
      <div className="-mx-2 space-y-1">
        {players.map(player => {
          const winrate = (player.wins / player.games) * 100
          const profileUrl = `/${region}/${encodeURIComponent(player.gameName)}-${encodeURIComponent(player.tagLine)}`

          return (
            <Link
              key={player.puuid}
              href={profileUrl}
              className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gold-light/10 transition-colors"
            >
              {/* profile icon */}
              <div className="w-8 h-8 rounded-full overflow-hidden bg-abyss-700 flex-shrink-0">
                <Image
                  src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${player.profileIconId}.png`}
                  alt={player.gameName}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>

              {/* name and games */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {player.gameName}
                  {player.tagLine && <span className="text-text-muted ml-1">#{player.tagLine}</span>}
                </div>
                <div className="text-xs text-text-muted">{player.games} Games</div>
              </div>

              {/* w/l stats */}
              <div className="text-right flex-shrink-0 w-16">
                <div className="text-sm font-bold" style={{ color: getWinrateColor(winrate) }}>
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
