/**
 * DDragonImage - Wrapper for Next.js Image optimized for DDragon assets
 * 
 * DDragon images are already optimized PNGs from Riot, so we:
 * - Always use unoptimized={true} to skip Next.js image optimization
 * - Provide consistent defaults for common use cases
 * - Handle loading states and errors gracefully
 */
'use client'

import Image, { ImageProps } from 'next/image'
import { useState } from 'react'

// All DDragon image functions consolidated here for easy import
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com'

// Champion name normalization for DDragon URLs
function normalizeChampionName(championName: string): string {
  const nameMap: Record<string, string> = {
    'FiddleSticks': 'Fiddlesticks',
    'MonkeyKing': 'MonkeyKing',
    'Renata': 'Renata',
  }
  return nameMap[championName] || championName
}

// URL builders
export const ddragonUrls = {
  champion: (name: string, version: string) => 
    `${DDRAGON_BASE}/cdn/${version}/img/champion/${normalizeChampionName(name)}.png`,
  
  championCentered: (name: string, skinNum = 0) => 
    `${DDRAGON_BASE}/cdn/img/champion/centered/${normalizeChampionName(name)}_${skinNum}.jpg`,
  
  profileIcon: (iconId: number, version: string) => 
    `${DDRAGON_BASE}/cdn/${version}/img/profileicon/${iconId}.png`,
  
  item: (itemId: number, version: string) => 
    `${DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`,
  
  spell: (spellId: number, version: string) => {
    const spellMap: Record<number, string> = {
      1: 'Boost', 3: 'Exhaust', 4: 'Flash', 6: 'Haste', 7: 'Heal',
      11: 'Smite', 12: 'Teleport', 13: 'Mana', 14: 'Dot', 21: 'Barrier',
      30: 'PoroRecall', 31: 'PoroThrow', 32: 'Snowball', 39: 'Snowball',
    }
    return `${DDRAGON_BASE}/cdn/${version}/img/spell/Summoner${spellMap[spellId] || 'Flash'}.png`
  },
  
  rune: (iconPath: string) => 
    iconPath ? `${DDRAGON_BASE}/cdn/img/${iconPath}` : '',
}

interface DDragonImageProps extends Omit<ImageProps, 'src' | 'unoptimized'> {
  src: string
  fallback?: string
}

/**
 * DDragonImage component - use this for all DDragon (Riot) images
 * 
 * Benefits:
 * - Always skips Next.js image optimization (DDragon images are pre-optimized)
 * - Handles load errors gracefully with optional fallback
 * - Consistent props across the app
 * 
 * @example
 * <DDragonImage 
 *   src={ddragonUrls.champion('Ahri', '14.1.1')} 
 *   alt="Ahri" 
 *   width={64} 
 *   height={64} 
 * />
 */
export default function DDragonImage({ 
  src, 
  alt, 
  fallback,
  className = '',
  ...props 
}: DDragonImageProps) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  // Use fallback if error occurred
  const imageSrc = error && fallback ? fallback : src
  
  // Don't render if no src
  if (!imageSrc) return null
  
  return (
    <Image
      src={imageSrc}
      alt={alt}
      className={`${className} ${loaded ? '' : 'opacity-0'} transition-opacity duration-150`}
      unoptimized // DDragon images are already optimized
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (!error && fallback) {
          setError(true)
        }
      }}
      {...props}
    />
  )
}

// Specialized components for common use cases

interface ChampionImageProps {
  championName: string
  version: string
  size?: number
  className?: string
}

export function ChampionImage({ championName, version, size = 48, className = '' }: ChampionImageProps) {
  return (
    <DDragonImage
      src={ddragonUrls.champion(championName, version)}
      alt={championName}
      width={size}
      height={size}
      className={className}
    />
  )
}

interface ItemImageProps {
  itemId: number
  version: string
  size?: number
  className?: string
}

export function ItemImage({ itemId, version, size = 32, className = '' }: ItemImageProps) {
  if (!itemId || itemId <= 0) return null
  
  return (
    <DDragonImage
      src={ddragonUrls.item(itemId, version)}
      alt={`Item ${itemId}`}
      width={size}
      height={size}
      className={className}
    />
  )
}

interface SpellImageProps {
  spellId: number
  version: string
  size?: number
  className?: string
}

export function SpellImage({ spellId, version, size = 24, className = '' }: SpellImageProps) {
  return (
    <DDragonImage
      src={ddragonUrls.spell(spellId, version)}
      alt={`Spell ${spellId}`}
      width={size}
      height={size}
      className={className}
    />
  )
}

interface RuneImageProps {
  iconPath: string
  size?: number
  className?: string
}

export function RuneImage({ iconPath, size = 24, className = '' }: RuneImageProps) {
  if (!iconPath) return null
  
  return (
    <DDragonImage
      src={ddragonUrls.rune(iconPath)}
      alt="Rune"
      width={size}
      height={size}
      className={className}
    />
  )
}

interface ProfileIconImageProps {
  iconId: number
  version: string
  size?: number
  className?: string
}

export function ProfileIconImage({ iconId, version, size = 64, className = '' }: ProfileIconImageProps) {
  return (
    <DDragonImage
      src={ddragonUrls.profileIcon(iconId, version)}
      alt="Profile Icon"
      width={size}
      height={size}
      className={className}
    />
  )
}
