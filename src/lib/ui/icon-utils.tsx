// shared utilities for icon components
// used by ItemIcon, AugmentIcon, etc.

import React from 'react'
import { getWinrateColor } from './colors'

// size presets in pixels - shared across all icon components
export const ICON_SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 32,
  lg: 40,
  xl: 48,
} as const

export type IconSizePreset = keyof typeof ICON_SIZE_MAP

/**
 * convert size preset or custom number to pixel size
 */
export function getPixelSize(size: IconSizePreset | number): number {
  return typeof size === 'number' ? size : ICON_SIZE_MAP[size]
}

/**
 * render winrate and games count below an icon
 */
export function IconStats({ winrate, games }: { winrate?: number; games?: number }) {
  if (winrate === undefined && games === undefined) return null

  return (
    <>
      {winrate !== undefined && (
        <div className="text-xs font-bold mt-1" style={{ color: getWinrateColor(winrate) }}>
          {winrate.toFixed(1)}%
        </div>
      )}
      {games !== undefined && <div className="text-[10px] text-text-muted">{games.toLocaleString()}</div>}
    </>
  )
}

/**
 * wrap icon with stats if needed
 */
export function withIconStats(
  content: React.ReactNode,
  options: { winrate?: number; games?: number }
): React.ReactNode {
  const showStats = options.winrate !== undefined || options.games !== undefined

  if (!showStats) return content

  return (
    <div className="flex flex-col items-center">
      {content}
      <IconStats winrate={options.winrate} games={options.games} />
    </div>
  )
}
