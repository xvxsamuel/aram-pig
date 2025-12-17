'use client'

import Image from 'next/image'
import clsx from 'clsx'

// size presets in pixels (matching ItemIcon)
const SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 32,
  lg: 40,
  xl: 48,
} as const

type SizePreset = keyof typeof SIZE_MAP
type AbilityType = 'P' | 'Q' | 'W' | 'E' | 'R'

interface ChampionAbilityProps {
  /** Champion name (e.g., "Ahri", "MasterYi") */
  championName: string
  /** Ability type */
  ability: AbilityType
  /** size preset or custom pixel size */
  size?: SizePreset | number
  /** additional classes for the container */
  className?: string
  /** border style - 'default' has gold border, 'none' has no border */
  border?: 'default' | 'none'
  /** CDragon patch version (default: 'latest') */
  patch?: string
}

/**
 * Get the CDragon ability icon URL
 * Uses latest patch by default for caching
 */
function getAbilityIconUrl(championName: string, ability: AbilityType, patch: string = 'latest'): string {
  const abilityKey = ability.toLowerCase()
  return `https://cdn.communitydragon.org/${patch}/champion/${championName}/ability-icon/${abilityKey}`
}

export default function ChampionAbility({
  championName,
  ability,
  size = 'lg',
  className = '',
  border = 'default',
  patch = 'latest',
}: ChampionAbilityProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size]
  const abilityUrl = getAbilityIconUrl(championName, ability, patch)

  return (
    <div className="relative inline-block">
      <div
        className={clsx(
          'rounded overflow-hidden bg-abyss-800',
          border === 'default' && 'border border-gold-dark',
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      >
        <Image
          src={abilityUrl}
          alt={`${championName} ${ability}`}
          width={pixelSize}
          height={pixelSize}
          className="w-full h-full object-cover"
          unoptimized
        />
      </div>
      {/* Ability letter badge */}
      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-sm bg-abyss-900 border border-gray-600 flex items-center justify-center">
        <span className="text-[9px] font-bold text-white leading-none">{ability}</span>
      </div>
    </div>
  )
}
