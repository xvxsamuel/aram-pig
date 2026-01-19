"use client"

import Image, { ImageProps } from 'next/image'
import { useState } from 'react'

interface DDragonImageProps extends Omit<ImageProps, 'src' | 'unoptimized'> {
  src: string
  fallback?: string
}

/**
 * Image component for DDragon assets with loading states and error handling.
 * Use with URL functions from @/lib/ddragon (e.g., getChampionImageUrl, getItemImageUrl).
 * 
 * @example
 * import { getChampionImageUrl, getLatestVersion } from '@/lib/ddragon'
 * 
 * <DDragonImage
 *   src={getChampionImageUrl('Ahri', await getLatestVersion())}
 *   alt="Ahri"
 *   width={64}
 *   height={64}
 * />
 */
export default function DDragonImage({ src, alt, fallback, className = '', ...props }: DDragonImageProps) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // use fallback if error occurred
  const imageSrc = error && fallback ? fallback : src

  // don't render if no src
  if (!imageSrc) return null

  return (
    <Image
      src={imageSrc}
      alt={alt}
      className={`${className} ${loaded ? '' : 'opacity-0'} transition-opacity duration-150`}
      unoptimized // ddragon imgs are already somewhat optimized
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
