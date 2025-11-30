"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { motion } from "motion/react"
import UpdateButton from "./UpdateButton"
import SimpleTooltip from "@/components/ui/SimpleTooltip"

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
  longestWinStreak?: number
  cooldownUntil?: string | null
  statusMessage?: string | null
}

export default function ProfileHeader({ 
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
  onTabChange,
  longestWinStreak = 0,
  cooldownUntil,
  statusMessage
}: Props) {
  const [iconError, setIconError] = useState(false)
  const [animateColor, setAnimateColor] = useState(false)
  const [glintKey, setGlintKey] = useState(0)

  // trigger animation when borderColors changes from null to a value
  useEffect(() => {
    if (longestWinStreak >= 10) {
      // small delay to ensure initial render happens first
      const timer = setTimeout(() => setAnimateColor(true), 100)
      return () => clearTimeout(timer)
    }
  }, [longestWinStreak])

  // get border gradient colors based on longest win streak
  const getBorderColors = (streak: number): { from: string; to: string } | null => {
    if (streak >= 50) return { from: 'var(--color-kda-5)', to: 'var(--color-kda-5-dark)' }
    if (streak >= 20) return { from: 'var(--color-kda-4)', to: 'var(--color-kda-4-dark)' }
    if (streak >= 10) return { from: 'var(--color-kda-3)', to: 'var(--color-kda-3-dark)' }
    return null // default gold
  }

  const borderColors = getBorderColors(longestWinStreak)
  const isHighestTier = longestWinStreak >= 20

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
              unoptimized
              priority
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-abyss-700 from-35% via-transparent/30 via-60% to-abyss-700" />
        </>
      )}
      <div className="max-w-6xl mx-auto px-8 py-6 pb-8 min-h-40 relative z-10">
        <div className="flex items-start gap-6">
        <SimpleTooltip
          content={
            <span className="flex items-center gap-1">
              <span 
                className={`text-sm font-bold ${
                  longestWinStreak >= 50 ? 'text-kda-5' :
                  longestWinStreak >= 20 ? 'text-kda-4' :
                  longestWinStreak >= 10 ? 'text-kda-3' :
                  'text-gold-light'
                }`}
              >
                {longestWinStreak}
              </span>
              <span className="text-white text-sm font-light"> Winstreak</span>
            </span>
          }
        >
          <div 
            className="relative flex-shrink-0 cursor-help"
            onMouseEnter={() => setGlintKey(k => k + 1)}
          >
            <div 
              className="rounded-xl p-px relative overflow-hidden"
              style={{ background: 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))' }}
            >
              {/* animated color overlay */}
              {borderColors && (
                <div 
                  className="absolute inset-0 rounded-xl transition-transform duration-500 ease-out"
                  style={{ 
                    background: `linear-gradient(to bottom, ${borderColors.from}, ${borderColors.to})`,
                    transform: animateColor ? 'translateY(0)' : 'translateY(100%)'
                  }}
                />
              )}
              {/* glint effect for highest tier */}
              {isHighestTier && animateColor && (
                <motion.div
                  key={glintKey}
                  className="absolute top-0 bottom-0 rounded-xl pointer-events-none"
                  animate={{ 
                    left: ['-35%', '135%'],
                    opacity: [0, 0.5, 0.6, 0.5, 0]
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    repeatDelay: 3,
                    ease: 'easeInOut',
                    times: [0, 0.2, 0.5, 0.8, 1]
                  }}
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 35%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.2) 65%, transparent)',
                    width: '40%'
                  }}
                />
              )}
              <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden relative">
                <Image 
                  src={iconError 
                    ? profileIconUrl.replace(/\d+\.png$/, "29.png")
                    : profileIconUrl
                  }
                  alt="Profile Icon"
                  width={120}
                  height={120}
                  className="w-full h-full object-cover"
                  unoptimized
                  priority
                  onError={() => setIconError(true)}
                />
              </div>
            </div>
            <div 
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-lg p-px overflow-hidden"
              style={{ background: 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))' }}
            >
              {/* animated color overlay for level badge */}
              {borderColors && (
                <div 
                  className="absolute inset-0 rounded-lg transition-transform duration-150"
                  style={{ 
                    background: `linear-gradient(to bottom, ${borderColors.from}, ${borderColors.to})`,
                    transform: animateColor ? 'translateY(0)' : 'translateY(100%)'
                  }}
                />
              )}
              {/* glint effect for level badge */}
              {isHighestTier && animateColor && (
                <motion.div
                  key={`badge-${glintKey}`}
                  className="absolute top-0 bottom-0 rounded-lg pointer-events-none"
                  animate={{ 
                    left: ['-45%', '145%'],
                    opacity: [0, 0.4, 0.5, 0.4, 0]
                  }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    repeatDelay: 3.3,
                    ease: 'easeInOut',
                    times: [0, 0.2, 0.5, 0.8, 1]
                  }}
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 35%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.15) 65%, transparent)',
                    width: '45%'
                  }}
                />
              )}
              <div className="px-2 rounded-[inherit] bg-abyss-500 relative">
                <span className="text-sm font-bold text-white">{summonerLevel}</span>
              </div>
            </div>
          </div>
        </SimpleTooltip>
        <div className="flex-1 flex flex-col justify-between h-28">
          <h1 className="text-3xl font-semibold text-white">
            {gameName}
            <span className="text-text-muted font-normal"> #{tagLine}</span>
          </h1>
          <div className="flex flex-col gap-2">
            <UpdateButton 
              region={region}
              name={name}
              puuid={puuid}
              hasActiveJob={hasActiveJob}
              onUpdateStarted={onUpdateStarted}
              cooldownUntil={cooldownUntil}
              statusMessage={statusMessage}
            />
            <p className="text-xs font-light text-text-muted">
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
              className={`cursor-pointer px-6 py-2 font-semibold tracking-wide transition-all border-b-2 ${
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
