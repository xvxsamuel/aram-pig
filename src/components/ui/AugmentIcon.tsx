'use client'

import Image from 'next/image'
import clsx from 'clsx'
import { getPixelSize, withIconStats, type IconSizePreset } from '@/lib/ui'
import Tooltip from '@/components/ui/Tooltip'
import augments from '@/data/augments.json'

// tier border colors using our theme colors
const TIER_BORDER_COLORS: Record<string, string> = {
  Silver: 'var(--color-augment-silver)',
  Gold: 'var(--color-gold-light)',
  Prismatic: 'var(--color-augment-prismatic)',
}

interface AugmentIconProps {
  /** augment name from the game */
  augmentName: string
  /** size preset or custom pixel size */
  size?: IconSizePreset | number
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

  const pixelSize = getPixelSize(size)

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
    <Tooltip id={augmentName} type="augment">
      {imageElement}
    </Tooltip>
  ) : (
    imageElement
  )

  return withIconStats(content, { winrate, games })
}

/**
 * placeholder for empty augment slots
 */
export function EmptyAugmentSlot({
  size = 'md',
  className = '',
}: {
  size?: IconSizePreset | number
  className?: string
}) {
  const pixelSize = getPixelSize(size)
  return (
    <div
      className={clsx('rounded bg-abyss-800/50 border border-gold-dark/50', className)}
      style={{ width: pixelSize, height: pixelSize }}
    />
  )
}
