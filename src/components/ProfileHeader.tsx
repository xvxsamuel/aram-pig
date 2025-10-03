"use client"

import Image from "next/image"
import { useState } from "react"
import UpdateButton from "./UpdateButton"

function getTimeAgo(timestamp: string | null): string {
  if (!timestamp) return ''
  
  const now = new Date()
  const updated = new Date(timestamp)
  const diffMs = now.getTime() - updated.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

interface Props {
  profileIconId: number
  gameName: string
  tagLine: string
  summonerLevel: number
  mostPlayedChampion?: string
  championImageUrl?: string
  profileIconUrl: string
  region: string
  name: string
  puuid: string
  onUpdateStart?: (totalMatches: number, eta: number, showFullScreen: boolean) => void
  onUpdateComplete?: () => void
  hasMatches: boolean
  lastUpdated: string | null
}

export default function ProfileHeader({ 
  profileIconId, 
  gameName, 
  tagLine, 
  summonerLevel,
  mostPlayedChampion,
  championImageUrl,
  profileIconUrl,
  region,
  name,
  puuid,
  onUpdateStart,
  onUpdateComplete,
  hasMatches,
  lastUpdated
}: Props) {
  const [iconError, setIconError] = useState(false)

  return (
    <section className="relative overflow-hidden bg-accent-darker">
      {mostPlayedChampion && championImageUrl && (
        <>
          <div className="absolute inset-0 opacity-50" style={{ right: '-20%' }}>
            <Image 
              src={championImageUrl}
              alt={`${mostPlayedChampion} centered`}
              fill
              className="object-cover"
              style={{ objectPosition: 'center 30%' }}
              unoptimized
              priority
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-accent-darker from-5% via-transparent/50 via-60% to-accent-darker" />
        </>
      )}
      <div className="max-w-7xl mx-auto px-8 py-6 min-h-24">
        <div className="flex items-center gap-4 relative z-10">
        <div className="relative flex-shrink-0">
          <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
            <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
              <Image 
                src={iconError 
                  ? profileIconUrl.replace(/\d+\.png$/, '29.png')
                  : profileIconUrl
                }
                alt="Profile Icon"
                width={96}
                height={96}
                className="w-full h-full object-cover"
                unoptimized
                onError={() => setIconError(true)}
              />
            </div>
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-md p-px bg-gradient-to-b from-gold-light to-gold-dark">
            <div className="px-2 py-[0.5px] rounded-[inherit] bg-accent-darkest">
              <span className="text-[12px] font-bold text-white">{summonerLevel}</span>
            </div>
          </div>
        </div>
        <div className="flex-1 pb-1">
          <h1 className="text-3xl font-bold mb-2 text-white">
            {gameName}
            <span className="text-subtitle"> #{tagLine}</span>
          </h1>
          <div className="flex flex-col gap-1">
            <UpdateButton 
              region={region} 
              name={name} 
              puuid={puuid} 
              onUpdateStart={onUpdateStart} 
              onUpdateComplete={onUpdateComplete}
              hasMatches={hasMatches}
            />
            {lastUpdated && (
              <p className="text-xs text-subtitle">
                Last updated: {getTimeAgo(lastUpdated)}
              </p>
            )}
          </div>
        </div>
        </div>
      </div>
    </section>
  )
}
