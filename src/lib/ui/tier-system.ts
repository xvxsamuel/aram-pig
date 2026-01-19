// Champion tier system based on winrate, games played, damage, and consistency
// S+ (90+), S (80-89), A (65-79), B (50-64), C (35-49), D (15-34), COAL (0-14)

export type ChampionTier = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D' | 'COAL'

export interface TierConfig {
  tier: ChampionTier
  minScore: number
  maxScore: number
  borderColors: { from: string; to: string }
  textColor: string
  bgColor: string
  glowColor?: string
}

export interface ChampionTierStats {
  winrate: number // 0-100
  games: number
  avgDamage: number
  kda: number
}

// tier thresholds and styling
export const TIER_CONFIGS: Record<ChampionTier, TierConfig> = {
  'S+': {
    tier: 'S+',
    minScore: 90,
    maxScore: 100,
    // Bright gold border - matches winstreak 50+
    borderColors: { from: 'var(--color-tier-splus)', to: 'var(--color-tier-splus-dark)' },
    textColor: 'white',
    bgColor: 'rgba(255, 215, 0, 0.15)',
    glowColor: 'rgba(135, 206, 250, 0.6)',
  },
  S: {
    tier: 'S',
    minScore: 80,
    maxScore: 89.99,
    // Red/orange - matches winstreak 50+ (kda-5)
    borderColors: { from: 'var(--color-kda-5)', to: 'var(--color-kda-5-dark)' },
    textColor: 'white',
    bgColor: 'rgba(255, 105, 105, 0.15)',
    glowColor: 'var(--color-kda-5)',
  },
  A: {
    tier: 'A',
    minScore: 65,
    maxScore: 79.99,
    // Purple - matches winstreak 20+ (kda-4)
    borderColors: { from: 'var(--color-kda-4)', to: 'var(--color-kda-4-dark)' },
    textColor: 'white',
    bgColor: 'rgba(100, 149, 237, 0.15)',
  },
  B: {
    tier: 'B',
    minScore: 50,
    maxScore: 64.99,
    // Green - matches winstreak 10+ (kda-3)
    borderColors: { from: 'var(--color-kda-3)', to: 'var(--color-kda-3-dark)' },
    textColor: 'white',
    bgColor: 'rgba(76, 175, 80, 0.15)',
  },
  C: {
    tier: 'C',
    minScore: 35,
    maxScore: 49.99,
    // Default gold
    borderColors: { from: 'var(--color-gold-light)', to: 'var(--color-gold-dark)' },
    textColor: 'white',
    bgColor: 'rgba(255, 215, 0, 0.1)',
  },
  D: {
    tier: 'D',
    minScore: 15,
    maxScore: 34.99,
    // Darker brown
    borderColors: { from: 'var(--color-tier-d)', to: 'var(--color-tier-d-dark)' },
    textColor: 'white',
    bgColor: 'rgba(107, 68, 35, 0.1)',
  },
  COAL: {
    tier: 'COAL',
    minScore: 0,
    maxScore: 14.99,
    // Darker black
    borderColors: { from: 'var(--color-tier-coal)', to: 'var(--color-tier-coal-dark)' },
    textColor: 'white',
    bgColor: 'rgba(0, 0, 0, 0.3)',
  },
}

/**
 * Calculate champion tier score based on performance metrics
 * 
 * Weights:
 * - Winrate: 70% (primary factor)
 * - Games played: 10% (reliability adjustment)
 * - Avg damage: 15% (performance relative to others)
 * - KDA consistency: 5% (skill consistency)
 */
function calculateTierScore(stats: ChampionTierStats, allChampionStats: ChampionTierStats[]): number {
  // Winrate component (0-70 points)
  // 60% WR = 70 points, 50% = 50 points, 40% = 30 points
  const winrateScore = Math.min(70, Math.max(0, (stats.winrate - 30) * 2))

  // Games component (0-10 points)
  // More games = more reliable, diminishing returns after 50 games
  const gamesScore = Math.min(10, (stats.games / 50) * 10)

  // Damage component (0-15 points)
  // Normalized against all champions in the list
  const avgDamages = allChampionStats.map(c => c.avgDamage)
  const maxDamage = Math.max(...avgDamages)
  const minDamage = Math.min(...avgDamages)
  const damageRange = maxDamage - minDamage
  const normalizedDamage = damageRange > 0 ? (stats.avgDamage - minDamage) / damageRange : 0.5
  const damageScore = normalizedDamage * 15

  // KDA consistency component (0-5 points)
  // Higher KDA = more consistent performance
  // Cap at 5.0 KDA for scoring purposes
  const kdaCapped = Math.min(5, stats.kda)
  const kdaScore = (kdaCapped / 5) * 5

  return winrateScore + gamesScore + damageScore + kdaScore
}

/**
 * Get champion tier based on stats
 * Requires all champion stats for relative comparisons
 */
export function getChampionTier(
  stats: ChampionTierStats | null,
  allChampionStats?: ChampionTierStats[]
): ChampionTier | null {
  if (!stats || !allChampionStats || allChampionStats.length === 0) return null

  const score = calculateTierScore(stats, allChampionStats)

  if (score >= TIER_CONFIGS['S+'].minScore) return 'S+'
  if (score >= TIER_CONFIGS.S.minScore) return 'S'
  if (score >= TIER_CONFIGS.A.minScore) return 'A'
  if (score >= TIER_CONFIGS.B.minScore) return 'B'
  if (score >= TIER_CONFIGS.C.minScore) return 'C'
  if (score >= TIER_CONFIGS.D.minScore) return 'D'
  return 'COAL'
}

/**
 * Calculate overall tier from multiple champion stats (weighted by games)
 */
export function calculateOverallTier(allChampionStats: ChampionTierStats[]): ChampionTier | null {
  if (allChampionStats.length === 0) return null

  // Calculate weighted average score
  const totalGames = allChampionStats.reduce((sum, c) => sum + c.games, 0)
  if (totalGames === 0) return null

  const weightedScore = allChampionStats.reduce((sum, stats) => {
    const score = calculateTierScore(stats, allChampionStats)
    return sum + score * (stats.games / totalGames)
  }, 0)

  if (weightedScore >= TIER_CONFIGS['S+'].minScore) return 'S+'
  if (weightedScore >= TIER_CONFIGS.S.minScore) return 'S'
  if (weightedScore >= TIER_CONFIGS.A.minScore) return 'A'
  if (weightedScore >= TIER_CONFIGS.B.minScore) return 'B'
  if (weightedScore >= TIER_CONFIGS.C.minScore) return 'C'
  if (weightedScore >= TIER_CONFIGS.D.minScore) return 'D'
  return 'COAL'
}

/**
 * Get tier configuration
 */
export function getTierConfig(tier: ChampionTier | null): TierConfig | null {
  if (!tier) return null
  return TIER_CONFIGS[tier]
}

/**
 * Get tier border gradient for champion icons
 * Returns gradient colors object for all tiers
 */
export function getTierBorderGradient(tier: ChampionTier | null): { from: string; to: string } | null {
  if (!tier) return null
  const config = TIER_CONFIGS[tier]
  return config.borderColors
}

/**
 * Check if tier should have glint effect (S+, S, and A tiers)
 * A tier matches the purple winstreak border (20+ streak)
 */
export function shouldShowGlint(tier: ChampionTier | null): boolean {
  return tier === 'S+' || tier === 'S' || tier === 'A'
}

/**
 * Get tier sort value (for sorting champions by tier)
 * Higher is better
 */
export function getTierSortValue(tier: ChampionTier | null): number {
  if (!tier) return -1
  const order: Record<ChampionTier, number> = {
    'S+': 7,
    S: 6,
    A: 5,
    B: 4,
    C: 3,
    D: 2,
    COAL: 1,
  }
  return order[tier]
}
