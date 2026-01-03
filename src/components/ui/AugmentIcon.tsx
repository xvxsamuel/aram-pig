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

// tier border colors
const TIER_BORDER_COLORS: Record<string, string> = {
  Silver: 'border-gray-400',
  Gold: 'border-yellow-500',
  Prismatic: 'border-purple-400',
}

const TIER_GLOW_COLORS: Record<string, string> = {
  Silver: 'shadow-gray-400/30',
  Gold: 'shadow-yellow-500/30',
  Prismatic: 'shadow-purple-400/40',
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
        border === 'default' && `border ${TIER_BORDER_COLORS[tier] || 'border-gold-dark'}`,
        border === 'default' && `shadow-sm ${TIER_GLOW_COLORS[tier] || ''}`,
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
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
