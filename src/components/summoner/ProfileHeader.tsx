'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import UpdateButton from './UpdateButton'
import SimpleTooltip from '@/components/ui/SimpleTooltip'

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
  statusMessage,
}: Props) {
  const [iconError, setIconError] = useState(false)
  const [animateColor, setAnimateColor] = useState(false)
  const [glintKey, setGlintKey] = useState(0)

  // trigger animation on mount
  useEffect(() => {
    // small delay to ensure initial render happens first
    const timer = setTimeout(() => setAnimateColor(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // get border gradient colors based on longest win streak
  const getBorderColors = (streak: number): { from: string; to: string } | null => {
    if (streak >= 50) return { from: 'var(--color-kda-5)', to: 'var(--color-kda-5-dark)' }
    if (streak >= 30) return { from: 'var(--color-kda-4)', to: 'var(--color-kda-4-dark)' }
    if (streak >= 10) return { from: 'var(--color-kda-3)', to: 'var(--color-kda-3-dark)' }
    return null // default gold
  }

  const borderColors = getBorderColors(longestWinStreak)
  const shouldShowGlint = longestWinStreak >= 30

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'champions' as const, label: 'Champions' },
    // { id: 'performance' as const, label: 'Performance' },
  ]

  const profileIconElement = (
    <SimpleTooltip
      content={
        <span className="flex items-center gap-1">
          <span
            className="text-sm font-bold"
            style={{
              color: longestWinStreak >= 50
                ? 'var(--color-tier-splus)'
                : longestWinStreak >= 30
                  ? 'var(--color-kda-4)'
                  : longestWinStreak >= 10
                    ? 'var(--color-kda-3)'
                    : 'var(--color-gold-light)',
            }}
          >
            {longestWinStreak}
          </span>
          <span className="text-white text-sm font-light"> Winstreak</span>
        </span>
      }
    >
      <div className="relative flex-shrink-0 cursor-help" onMouseEnter={() => setGlintKey(k => k + 1)}>
        {/* S+ tier effects for 50+ winstreak (gold border with blue accents) */}
        {longestWinStreak >= 50 && (
          <>
            {/* subtle halo glow */}
            <motion.div
              className="absolute -inset-2 rounded-xl pointer-events-none"
              animate={{
                opacity: [0.3, 0.5, 0.4, 0.5, 0.3],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                background: 'radial-gradient(ellipse at center, rgba(74, 158, 255, 0.4) 0%, rgba(74, 158, 255, 0.2) 50%, transparent 80%)',
                filter: 'blur(16px)',
              }}
            />
            {/* sharp blue glint tracing outer edge */}
            <motion.div
              className="absolute -inset-1 rounded-xl pointer-events-none"
              animate={{
                background: [
                  'conic-gradient(from 0deg at 50% 50%, rgba(74, 158, 255, 1) 0deg, rgba(74, 158, 255, 1) 3deg, rgba(74, 158, 255, 0.7) 6deg, transparent 10deg, transparent 360deg)',
                  'conic-gradient(from 90deg at 50% 50%, rgba(74, 158, 255, 1) 0deg, rgba(74, 158, 255, 1) 3deg, rgba(74, 158, 255, 0.7) 6deg, transparent 10deg, transparent 360deg)',
                  'conic-gradient(from 180deg at 50% 50%, rgba(74, 158, 255, 1) 0deg, rgba(74, 158, 255, 1) 3deg, rgba(74, 158, 255, 0.7) 6deg, transparent 10deg, transparent 360deg)',
                  'conic-gradient(from 270deg at 50% 50%, rgba(74, 158, 255, 1) 0deg, rgba(74, 158, 255, 1) 3deg, rgba(74, 158, 255, 0.7) 6deg, transparent 10deg, transparent 360deg)',
                  'conic-gradient(from 360deg at 50% 50%, rgba(74, 158, 255, 1) 0deg, rgba(74, 158, 255, 1) 3deg, rgba(74, 158, 255, 0.7) 6deg, transparent 10deg, transparent 360deg)',
                ],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'linear',
              }}
              style={{
                filter: 'blur(3px)',
              }}
            />
            {/* persistent base glow */}
            <div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{
                boxShadow: '0 0 8px 2px rgba(74, 158, 255, 0.4), 0 0 16px 4px rgba(74, 158, 255, 0.2)',
              }}
            />
            {/* animated glow variation */}
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              animate={{
                boxShadow: [
                  '0 0 6px 1px rgba(74, 158, 255, 0.3), 0 0 12px 2px rgba(74, 158, 255, 0.15)',
                  '0 0 10px 2px rgba(74, 158, 255, 0.45), 0 0 18px 4px rgba(74, 158, 255, 0.25)',
                  '0 0 6px 1px rgba(74, 158, 255, 0.3), 0 0 12px 2px rgba(74, 158, 255, 0.15)',
                ],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            {/* particle streaks emanating outward */}
            <>
              {[0, 72, 144, 216, 288].map((angle, i) => (
                <motion.div
                  key={angle}
                  className="absolute top-1/2 left-1/2 w-0.5 origin-left pointer-events-none"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                    background: 'linear-gradient(90deg, rgba(74, 158, 255, 0.6), rgba(74, 158, 255, 0))',
                  }}
                  animate={{
                    height: ['8px', '16px', '8px'],
                    opacity: [0.4, 0.7, 0.4],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.2,
                  }}
                />
              ))}
            </>
          </>
        )}
        <div
          className="rounded-xl p-px relative overflow-hidden"
          style={{ 
            background: 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))'
          }}
        >
          {/* animated color overlay for winstreaks with different colors */}
          {longestWinStreak >= 50 ? (
            // 50+ winstreak: S+ gold border with animation
            <div
              className="absolute inset-0 rounded-xl transition-transform duration-500 ease-out"
              style={{
                background: 'linear-gradient(to bottom, var(--color-tier-splus), var(--color-tier-splus-dark))',
                transform: animateColor ? 'translateY(0)' : 'translateY(100%)',
              }}
            />
          ) : borderColors ? (
            // 10-49 winstreak: colored overlay (green or purple) - animates
            <div
              className="absolute inset-0 rounded-xl transition-transform duration-500 ease-out"
              style={{
                background: `linear-gradient(to bottom, ${borderColors.from}, ${borderColors.to})`,
                transform: animateColor ? 'translateY(0)' : 'translateY(100%)',
              }}
            />
          ) : null /* <10 winstreak: no animation, already default gold */}
          {/* glint effect for purple and red winstreaks (30-49, not 50+ as it has S+ effects) */}
          {shouldShowGlint && longestWinStreak < 50 && animateColor && (
            <motion.div
              key={glintKey}
              className="absolute top-0 bottom-0 rounded-xl pointer-events-none"
              animate={{
                left: ['-35%', '135%'],
                opacity: [0, 0.5, 0.6, 0.5, 0],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                repeatDelay: 3,
                ease: 'easeInOut',
                times: [0, 0.2, 0.5, 0.8, 1],
              }}
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 35%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.2) 65%, transparent)',
                width: '40%',
              }}
            />
          )}
          <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden relative">
            <Image
              src={iconError ? profileIconUrl.replace(/\d+\.png$/, '29.png') : profileIconUrl}
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
          style={{
            background: longestWinStreak >= 50
              ? 'linear-gradient(to bottom, var(--color-tier-splus), var(--color-tier-splus-dark))'
              : borderColors
              ? `linear-gradient(to bottom, ${borderColors.from}, ${borderColors.to})`
              : 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))',
          }}
        >
          {/* animated color overlay for level badge (only for 10-49 winstreaks, not 50+ as it uses gold) */}
          {borderColors && longestWinStreak < 50 && (
            <div
              className="absolute inset-0 rounded-lg transition-transform duration-150"
              style={{
                background: `linear-gradient(to bottom, ${borderColors.from}, ${borderColors.to})`,
                transform: animateColor ? 'translateY(0)' : 'translateY(100%)',
              }}
            />
          )}
          {/* glint effect for level badge (50+ winstreak only) */}
          {longestWinStreak >= 50 && animateColor && (
            <motion.div
              key={`badge-${glintKey}`}
              className="absolute top-0 bottom-0 rounded-lg pointer-events-none"
              animate={{
                left: ['-45%', '145%'],
                opacity: [0, 0.4, 0.5, 0.4, 0],
              }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                repeatDelay: 3.3,
                ease: 'easeInOut',
                times: [0, 0.2, 0.5, 0.8, 1],
              }}
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 35%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.15) 65%, transparent)',
                width: '45%',
              }}
            />
          )}
          <div className="px-2 rounded-[inherit] bg-abyss-500 relative">
            <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
            <span className="text-sm font-bold text-white relative z-10">{summonerLevel}</span>
          </div>
        </div>
      </div>
    </SimpleTooltip>
  )

  return (
    <section className="relative overflow-hidden bg-abyss-700">
      {mostPlayedChampion && championImageUrl && (
        <>
          <div className="absolute inset-0 flex justify-center overflow-hidden">
            <div className="w-full max-w-6xl relative h-full">
              <div className="absolute right-[-2%] top-[-20%] bottom-[-80%] w-[80%] opacity-50">
                <Image
                  src={championImageUrl}
                  alt={mostPlayedChampion}
                  fill
                  className="object-cover"
                  style={{ objectPosition: 'center 20%' }}
                  unoptimized
                  priority
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-abyss-700)_70%)]" />
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-abyss-700 from-30% via-transparent to-transparent" />
        </>
      )}
      <div className="max-w-6xl mx-auto px-8 py-6 pb-8 min-h-40 relative z-10">
        <div className="flex items-center gap-6">
          {profileIconElement}
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
        <div className="flex gap-4 mt-4">
          {tabs.map(tab => (
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
