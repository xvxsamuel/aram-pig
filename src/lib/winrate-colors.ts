// winrate color utility
// 60% = accent-light, 40% = negative, 50% = white, interpolated between

export function getWinrateColor(winrate: number): string {
  const midpoint = 50
  const topThreshold = 60
  const bottomThreshold = 40

  // clamp winrate
  const clamped = Math.max(bottomThreshold, Math.min(topThreshold, winrate))

  if (Math.abs(clamped - midpoint) < 0.01) {
    return 'oklch(1 0 0)' // white in oklch
  }

  // above midpoint: interpolate from white to accent-light
  if (clamped > midpoint) {
    const progress = (clamped - midpoint) / (topThreshold - midpoint)
    // white: oklch(1 0 0) -> accent-light: oklch(0.6537 0.118 223.64)
    const l = 1 + (0.6537 - 1) * progress
    const c = 0 + (0.118 - 0) * progress
    const h = 223.64
    return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`
  }

  // below midpoint: interpolate from negative to white
  const progress = (clamped - bottomThreshold) / (midpoint - bottomThreshold)
  // negative ≈ oklch(0.61 0.19 16) -> white: oklch(1 0 0)
  const l = 0.61 + (1 - 0.61) * progress
  const c = 0.19 + (0 - 0.19) * progress
  const h = 16
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`
}
