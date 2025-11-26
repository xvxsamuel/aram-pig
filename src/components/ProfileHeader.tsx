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
  
  if (diffMins < 1) return "just now"
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
  hasActiveJob: boolean
  onUpdateStarted: () => void
  lastUpdated: string | null
  loading?: boolean
  selectedTab?: 'overview' | 'champions' | 'performance'
  onTabChange?: (tab: 'overview' | 'champions' | 'performance') => void
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
  hasActiveJob,
  onUpdateStarted,
  lastUpdated,
  loading = false,
  selectedTab = 'overview',
  onTabChange
}: Props) {
  const [iconError, setIconError] = useState(false)

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'champions' as const, label: 'Champions' },
    { id: 'performance' as const, label: 'Performance' },
  ]

  return (
    <section className="relative overflow-hidden bg-abyss-700">
      {mostPlayedChampion && championImageUrl && (
        <>
          <div className="absolute inset-0 opacity-50" style={{ right: "-20%" }}>
            <Image 
              src={championImageUrl}
              alt={mostPlayedChampion}
              fill
              className="object-cover"
              style={{ objectPosition: "center 25%" }}

              priority
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-abyss-700 from-35% via-transparent/30 via-60% to-abyss-700" />
        </>
      )}
      <div className="max-w-6xl mx-auto px-8 py-6 min-h-40 relative z-10">
        <div className="flex items-start gap-6">
        <div className="relative flex-shrink-0">
          <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
            <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
              <Image 
                src={iconError 
                  ? profileIconUrl.replace(/\d+\.png$/, "29.png")
                  : profileIconUrl
                }
                alt="Profile Icon"
                width={120}
                height={120}
                className="w-full h-full object-cover"

                priority
                onError={() => setIconError(true)}
              />
            </div>
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-md p-px bg-gradient-to-b from-gold-light to-gold-dark">
            <div className="px-2 py-0.5 rounded-[inherit] bg-abyss-500">
              <span className="text-sm font-bold text-white">{summonerLevel}</span>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-between h-26">
          <h1 className="text-3xl font-bold text-white">
            {gameName}
            <span className="text-text-muted"> #{tagLine}</span>
          </h1>
          <div className="flex flex-col gap-2">
            <UpdateButton 
              region={region}
              name={name}
              puuid={puuid}
              hasActiveJob={hasActiveJob}
              onUpdateStarted={onUpdateStarted}
            />
            <p className="text-xs text-text-muted">
              Last updated: {loading ? 'loading...' : lastUpdated ? getTimeAgo(lastUpdated) : 'Never'}
            </p>
          </div>
        </div>
        </div>

        {/* tab navigation */}
        <div className="flex gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={`cursor-pointer px-6 py-2 font-semibold transition-all border-b-2 ${
                selectedTab === tab.id
                  ? 'border-accent-light text-white'
                  : 'border-transparent text-text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
