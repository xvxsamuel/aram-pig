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

// kda color utility
// <3 = white, 3-4 = kda-3 (green), 4-5 = kda-4 (blue), 5+ = kda-5 (pink/magenta)

export function getKdaColor(kda: number): string {
  if (kda >= 5) return 'var(--color-kda-5)'
  if (kda >= 4) return 'var(--color-kda-4)'
  if (kda >= 3) return 'var(--color-kda-3)'
  return 'white'
}

// pig score color utility
// 100 = accent-light, 0 = negative, 50 = white, interpolated between

export function getPigScoreColor(score: number): string {
  const midpoint = 50
  const topThreshold = 100
  const bottomThreshold = 0

  // clamp score
  const clamped = Math.max(bottomThreshold, Math.min(topThreshold, score))

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

// pig score gradient colors for arc (returns dark and light color pair)
// dynamically interpolates based on score
export function getPigScoreGradientColors(score: number): { dark: string; light: string } {
  const midpoint = 50
  const topThreshold = 100
  const bottomThreshold = 0

  // clamp score
  const clamped = Math.max(bottomThreshold, Math.min(topThreshold, score))

  // at midpoint (50): use neutral gray tones
  // above 50: interpolate from gray toward blue (accent)
  // below 50: interpolate from gray toward red (negative)

  if (clamped >= midpoint) {
    // 50-100: gray -> blue
    const progress = (clamped - midpoint) / (topThreshold - midpoint)
    
    // dark color: gray oklch(0.4 0 0) -> accent-dark oklch(0.45 0.08 223.64)
    const darkL = 0.4 + (0.45 - 0.4) * progress
    const darkC = 0 + (0.08 - 0) * progress
    const darkH = 223.64
    
    // light color: light gray oklch(0.7 0 0) -> accent-light oklch(0.6537 0.118 223.64)
    const lightL = 0.7 + (0.6537 - 0.7) * progress
    const lightC = 0 + (0.118 - 0) * progress
    const lightH = 223.64
    
    return {
      dark: `oklch(${darkL.toFixed(4)} ${darkC.toFixed(4)} ${darkH.toFixed(2)})`,
      light: `oklch(${lightL.toFixed(4)} ${lightC.toFixed(4)} ${lightH.toFixed(2)})`
    }
  } else {
    // 0-50: red -> gray
    const progress = clamped / midpoint // 0 at score=0, 1 at score=50
    
    // dark color: negative-dark oklch(0.45 0.15 17.95) -> gray oklch(0.4 0 0)
    const darkL = 0.45 + (0.4 - 0.45) * progress
    const darkC = 0.15 + (0 - 0.15) * progress
    const darkH = 17.95
    
    // light color: negative oklch(0.62 0.20 17.95) -> light gray oklch(0.7 0 0)
    const lightL = 0.62 + (0.7 - 0.62) * progress
    const lightC = 0.20 + (0 - 0.20) * progress
    const lightH = 17.95
    
    return {
      dark: `oklch(${darkL.toFixed(4)} ${darkC.toFixed(4)} ${darkH.toFixed(2)})`,
      light: `oklch(${lightL.toFixed(4)} ${lightC.toFixed(4)} ${lightH.toFixed(2)})`
    }
  }
}
