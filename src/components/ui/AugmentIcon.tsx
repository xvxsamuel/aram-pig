'use client'

import Image from 'next/image'
import clsx from 'clsx'
import { getWinrateColor } from '@/lib/ui'
import AugmentTooltip from '@/components/ui/AugmentTooltip'
import augments from '@/data/augments.json'

// size presets in pixels
const SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 32,
  lg: 40,
  xl: 48,
} as const

type SizePreset = keyof typeof SIZE_MAP

// tier border colors using our theme colors
const TIER_BORDER_COLORS: Record<string, string> = {
  Silver: '#94A3B8', // slate-400 approximation
  Gold: 'var(--color-gold-light)',
  Prismatic: '#E879F9', // fuchsia-400 approximation
}

const TIER_GLOW_COLORS: Record<string, string> = {
  Silver: 'rgba(148, 163, 184, 0.3)',
  Gold: 'rgba(237, 197, 63, 0.3)',
  Prismatic: 'rgba(232, 121, 249, 0.4)',
}

interface AugmentIconProps {
  /** augment name from the game */
  augmentName: string
  /** size preset or custom pixel size */
  size?: SizePreset | number
  /** whether to show augment tooltip on hover (default: true) */
  showTooltip?: boolean
  /** optional winrate to display below icon */
  winrate?: number
  /** optional games count to display below icon */
  games?: number
  /** additional classes for the container */
  className?: string
  /** border style - 'default' has tier-colored border, 'none' has no border */
  border?: 'default' | 'none'
}

export default function AugmentIcon({
  augmentName,
  size = 'md',
  showTooltip = true,
  winrate,
  games,
  className = '',
  border = 'default',
}: AugmentIconProps) {
  const augmentData = (augments as Record<string, { description: string; tier: string; icon: string }>)[augmentName]
  const tier = augmentData?.tier || 'Silver'
  const iconName = augmentData?.icon

  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size]
  const showStats = winrate !== undefined || games !== undefined

  // handle missing icon
  if (!iconName) {
    return (
      <div
        className={clsx(
          'rounded bg-abyss-800/50 flex items-center justify-center',
          border === 'default' && 'border border-gold-dark/50',
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      >
        <span className="text-xs text-gray-500">?</span>
      </div>
    )
  }

  const imageElement = (
    <div
      className={clsx(
        'rounded overflow-hidden bg-abyss-800 relative',
        border === 'default' && 'border',
        className
      )}
      style={{ 
        width: pixelSize, 
        height: pixelSize,
        ...(border === 'default' && {
          borderColor: TIER_BORDER_COLORS[tier] || 'var(--color-gold-dark)',
          boxShadow: `0 1px 2px 0 ${TIER_GLOW_COLORS[tier] || 'rgba(0,0,0,0.05)'}`,
        })
      }}
    >
      <Image
        src={`/icons/augments/${iconName}.png`}
        alt={augmentName}
        width={pixelSize}
        height={pixelSize}
        className="w-full h-full object-cover"
        unoptimized
      />
    </div>
  )

  const content = showTooltip ? (
    <AugmentTooltip augmentName={augmentName}>
      {imageElement}
    </AugmentTooltip>
  ) : (
    imageElement
  )

  // wrap with stats if needed
  if (showStats) {
    return (
      <div className="flex flex-col items-center">
        {content}
        {winrate !== undefined && (
          <div className="text-xs font-bold mt-1" style={{ color: getWinrateColor(winrate) }}>
            {winrate.toFixed(1)}%
          </div>
        )}
        {games !== undefined && (
          <div className="text-[10px] text-text-muted">{games.toLocaleString()}</div>
        )}
      </div>
    )
  }

  return content
}

/**
 * placeholder for empty augment slots
 */
export function EmptyAugmentSlot({
  size = 'md',
  className = '',
}: {
  size?: SizePreset | number
  className?: string
}) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size]
  return (
    <div
      className={clsx('rounded bg-abyss-800/50 border border-gold-dark/50', className)}
      style={{ width: pixelSize, height: pixelSize }}
    />
  )
}
