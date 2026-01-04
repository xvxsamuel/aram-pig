'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { getTierConfig, shouldShowGlint, type ChampionTier } from '@/lib/ui'

interface Props {
  championName: string
  imageUrl: string
  tier: ChampionTier | null
  size?: 'sm' | 'md' | 'lg'
  showGlint?: boolean
  className?: string
}

export default function ChampionPortrait({
  championName,
  imageUrl,
  tier,
  size = 'md',
  showGlint = true,
  className = '',
}: Props) {
  const [glintKey, setGlintKey] = useState(0)
  const [animateColor, setAnimateColor] = useState(true)

  const config = getTierConfig(tier)
  const hasGlint = showGlint && shouldShowGlint(tier)

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  }

  const borderRadius = {
    sm: 'rounded-md',
    md: 'rounded-lg',
    lg: 'rounded-xl',
  }

  // Default gold border if no tier or low tier (C/D/COAL)
  const defaultBorder = 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))'
  const tierBorder = config
    ? `linear-gradient(to bottom, ${config.borderColors.from}, ${config.borderColors.to})`
    : defaultBorder

  // Only use tier border for S+, S, A tiers
  const shouldUseTierBorder = tier === 'S+' || tier === 'S' || tier === 'A'
  const borderStyle = shouldUseTierBorder ? tierBorder : defaultBorder

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => hasGlint && setGlintKey(k => k + 1)}
    >
      <div className={`${borderRadius[size]} p-px relative overflow-hidden`} style={{ background: borderStyle }}>
        {/* glint effect for S+ and S tiers */}
        {hasGlint && animateColor && (
          <motion.div
            key={glintKey}
            className={`absolute top-0 bottom-0 ${borderRadius[size]} pointer-events-none z-10`}
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
        <div className={`relative ${sizeClasses[size]} rounded-[calc(0.5rem-1px)] overflow-hidden bg-accent-dark`}>
          <Image
            src={imageUrl}
            alt={championName}
            width={size === 'lg' ? 64 : size === 'md' ? 40 : 32}
            height={size === 'lg' ? 64 : size === 'md' ? 40 : 32}
            className="w-full h-full object-cover scale-110"
            unoptimized
          />
          <div className="absolute inset-0 rounded-[calc(0.5rem-1px)] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
        </div>
      </div>
    </div>
  )
}
