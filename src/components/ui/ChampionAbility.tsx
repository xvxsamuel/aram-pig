'use client'

import Image from 'next/image'
import clsx from 'clsx'
import abilityIcons from '@/data/ability-icons.json'

// size presets in pixels
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

function getDDragonAbilityIconUrl(championName: string, ability: AbilityType, patch: string): string {
  const icons = abilityIcons as Record<string, Record<string, string>>
  
  // 1. Try direct lookup
  let championData = icons[championName]
  
  // 2. Try case-insensitive lookup
  if (!championData) {
    const key = Object.keys(icons).find(k => k.toLowerCase() === championName.toLowerCase())
    if (key) {
      championData = icons[key]
    }
  }
  
  // 3. Try aliases
  if (!championData) {
    if (championName.toLowerCase() === 'wukong') championData = icons['MonkeyKing']
  }
  
  if (!championData) {
    // Fallback to community dragon if map lookup fails
    const abilityKey = ability.toLowerCase()
    return `https://cdn.communitydragon.org/${patch === 'latest' ? 'latest' : patch}/champion/${championName}/ability-icon/${abilityKey}`
  }
  
  const filename = championData[ability]
  if (!filename) {
     // Fallback
     const abilityKey = ability.toLowerCase()
     return `https://cdn.communitydragon.org/${patch === 'latest' ? 'latest' : patch}/champion/${championName}/ability-icon/${abilityKey}`
  }

  const type = ability === 'P' ? 'passive' : 'spell'
  // use a fixed recent version if 'latest' is passed, as DDragon requires specific version
  // ideally this should come from a context or prop, but for now we default to a known working version
  const version = patch === 'latest' ? '15.24.1' : patch
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/${type}/${filename}`
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
  
  const imgSrc = getDDragonAbilityIconUrl(championName, ability, patch)

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
          src={imgSrc}
          alt={`${championName} ${ability}`}
          width={pixelSize}
          height={pixelSize}
          className="w-full h-full object-cover"
          unoptimized
        />
      </div>
      {/* ability letter badge */}
      <div className="absolute bottom-0 right-0 w-4 h-4 rounded-sm bg-abyss-900 border border-gold-dark flex items-center justify-center">
        <span className="text-[9px] font-bold text-white leading-none">{ability}</span>
      </div>
    </div>
  )
}
