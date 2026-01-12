'use client'

import Image from 'next/image'
import clsx from 'clsx'
import { getItemImageUrl } from '@/lib/ddragon'
import { getPixelSize, withIconStats, type IconSizePreset } from '@/lib/ui'
import Tooltip from '@/components/ui/Tooltip'

interface ItemIconProps {
  /** item ID from Riot API */
  itemId: number
  /** DDragon version for image URL */
  ddragonVersion: string
  /** size preset or custom pixel size */
  size?: IconSizePreset | number
  /** whether to show item tooltip on hover (default: true) */
  showTooltip?: boolean
  /** optional winrate to display below icon */
  winrate?: number
  /** optional games count to display below icon */
  games?: number
  /** react classes */
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
    const pixelSize = getPixelSize(size)
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

  const pixelSize = getPixelSize(size)

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
    <Tooltip id={itemId} type="item">
      {imageElement}
    </Tooltip>
  ) : (
    imageElement
  )

  return withIconStats(content, { winrate, games })
}

/**
 * placeholder for empty item slots
 */
export function EmptyItemSlot({
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
