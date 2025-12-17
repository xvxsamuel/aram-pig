'use client'

import Image from 'next/image'
import clsx from 'clsx'
import { getItemImageUrl } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'
import ItemTooltip from '@/components/ui/ItemTooltip'

// size presets in pixels
const SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 32,
  lg: 40,
  xl: 48,
} as const

type SizePreset = keyof typeof SIZE_MAP

interface ItemIconProps {
  /** item ID from Riot API */
  itemId: number
  /** DDragon version for image URL */
  ddragonVersion: string
  /** size preset or custom pixel size */
  size?: SizePreset | number
  /** whether to show item tooltip on hover (default: true) */
  showTooltip?: boolean
  /** optional winrate to display below icon */
  winrate?: number
  /** optional games count to display below icon */
  games?: number
  /** additional classes for the container */
  className?: string
  /** border style - 'default' has gold border, 'none' has no border */
  border?: 'default' | 'none'
}

export default function ItemIcon({
  itemId,
  ddragonVersion,
  size = 'md',
  showTooltip = true,
  winrate,
  games,
  className = '',
  border = 'default',
}: ItemIconProps) {
  // handle invalid item IDs
  if (!itemId || itemId <= 0) {
    const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size]
    return (
      <div
        className={clsx(
          'rounded bg-abyss-800/50',
          border === 'default' && 'border border-gold-dark/50',
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      />
    )
  }

  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size]
  const showStats = winrate !== undefined || games !== undefined

  const imageElement = (
    <div
      className={clsx(
        'rounded overflow-hidden bg-abyss-800',
        border === 'default' && 'border border-gold-dark',
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <Image
        src={getItemImageUrl(itemId, ddragonVersion)}
        alt={`Item ${itemId}`}
        width={pixelSize}
        height={pixelSize}
        className="w-full h-full object-cover"
        unoptimized
      />
    </div>
  )

  const content = showTooltip ? (
    <ItemTooltip itemId={itemId}>
      {imageElement}
    </ItemTooltip>
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
 * placeholder for empty item slots
 */
export function EmptyItemSlot({
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
