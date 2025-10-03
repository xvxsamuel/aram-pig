"use client"

import Image from "next/image"
import UpdateButton from "./UpdateButton"

interface Props {
  profileIconId: number
  gameName: string
  tagLine: string
  summonerLevel: number
  mostPlayedChampion?: string
  region: string
  name: string
  puuid: string
  onUpdateStart?: (totalMatches: number, eta: number, showFullScreen: boolean) => void
  onUpdateComplete?: () => void
  hasMatches: boolean
}

export default function ProfileHeader({ 
  profileIconId, 
  gameName, 
  tagLine, 
  summonerLevel,
  mostPlayedChampion,
  region,
  name,
  puuid,
  onUpdateStart,
  onUpdateComplete,
  hasMatches
}: Props) {
  return (
    <section className="px-6 py-6 min-h-24 relative overflow-hidden">
      {/* Background Champion Image */}
      {mostPlayedChampion && (
        <div className="absolute inset-0 opacity-20">
          <Image 
            src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${mostPlayedChampion}_0.jpg`}
            alt={`${mostPlayedChampion} splash`}
            fill
            className="object-cover object-center scale-50"
            unoptimized
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-accent-darker via-accent-darker/80 to-transparent" />
        </div>
      )}
      
      {/* Content */}
      <div className="flex items-center gap-4 relative z-10">
        <div className="w-24 h-24 rounded-xl bg-accent-dark border-2 border-gold-dark/40 overflow-hidden flex-shrink-0">
          <Image 
            src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/profileicon/${profileIconId}.png`}
            alt="Profile Icon"
            width={96}
            height={96}
            className="w-full h-full object-cover"
            unoptimized
          />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-1">
            {gameName}
            <span className="text-subtitle"> #{tagLine}</span>
          </h1>
          <p className="text-subtitle">
            Level {summonerLevel}
          </p>
        </div>
        <UpdateButton 
          region={region} 
          name={name} 
          puuid={puuid} 
          onUpdateStart={onUpdateStart} 
          onUpdateComplete={onUpdateComplete}
          hasMatches={hasMatches}
        />
      </div>
    </section>
  )
}
