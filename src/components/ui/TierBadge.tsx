'use client'

import { motion } from 'motion/react'
import { getChampionTier, getTierConfig, shouldShowGlint, type ChampionTierStats } from '@/lib/ui'

interface Props {
  stats: ChampionTierStats | null
  allStats?: ChampionTierStats[]
  size?: 'sm' | 'md' | 'lg'
  showGlint?: boolean
  className?: string
}

export default function TierBadge({ stats, allStats = [], size = 'md', showGlint = true, className = '' }: Props) {
  const tier = getChampionTier(stats, allStats)
  const config = getTierConfig(tier)

  if (!tier || !config) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className="text-gray-500 text-sm">-</span>
      </div>
    )
  }

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }

  const hasGlint = showGlint && shouldShowGlint(tier)

  return (
    <div className={`relative ${className}`}>
      <div
        className="p-px rounded-lg overflow-hidden"
        style={{ background: `linear-gradient(to bottom, ${config.borderColors.from}, ${config.borderColors.to})` }}
      >
        {/* glint effect for S+ and S tiers */}
        {hasGlint && (
          <motion.div
            className="absolute top-0 bottom-0 rounded-lg pointer-events-none z-10"
            animate={{
              left: ['-35%', '135%'],
              opacity: [0, 0.3, 0.4, 0.3, 0],
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
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 35%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.15) 65%, transparent)',
              width: '40%',
            }}
          />
        )}
        <div
          className={`${sizeClasses[size]} rounded-[calc(0.5rem-1px)] flex items-center justify-center font-bold relative`}
          style={{
            backgroundColor: config.bgColor,
            color: config.textColor,
            textShadow: 'none',
          }}
        >
          {tier}
        </div>
      </div>
    </div>
  )
}
