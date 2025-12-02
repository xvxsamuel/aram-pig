// Scoring module types - standardized stats extraction and comparison

import type { WelfordState } from '../db/stats-aggregator'

// ============================================================================
// MATCH STATS EXTRACTION TYPES
// ============================================================================

/**
 * Stats extracted from a single match for one participant
 */
export interface MatchStats {
  /** Kill/Death/Assist counts */
  kda: {
    kills: number
    deaths: number
    assists: number
  }
  /** Per-minute efficiency metrics */
  efficiency: {
    csPerMin: number
    goldPerMin: number
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  }
  /** Build information */
  items: {
    /** Comma-separated item IDs in purchase order from timeline */
    buildOrder: string | null
    /** Comma-separated starter item IDs (sorted for order-independence) */
    firstBuy: string | null
    /** Normalized core key: first 3 completed items, boots normalized to 99999, sorted */
    coreKey: string | null
    /** Final item slots [item0-item5] */
    finalItems: number[]
  }
  /** Ability order string (e.g., "Q W Q E Q R ...") */
  abilityOrder: string | null
  /** Skill max abbreviation (e.g., "qwe" for Q>W>E) */
  skillOrder: string | null
  /** Rune selections */
  runes: {
    keystoneId: number
    primaryTreeId: number
    secondaryTreeId: number
    primaryPerks: number[]
    secondaryPerks: number[]
    statPerks: number[]
  }
  /** Summoner spell IDs [spell1, spell2] */
  spells: [number, number]
  /** Game metadata */
  gameDuration: number
  teamId: number
  isRemake: boolean
}

/**
 * Minimal match stats for quick extraction (without timeline data)
 */
export interface BasicMatchStats {
  kda: MatchStats['kda']
  efficiency: MatchStats['efficiency']
  finalItems: number[]
  runes: MatchStats['runes']
  spells: MatchStats['spells']
  gameDuration: number
  teamId: number
  isRemake: boolean
}

// ============================================================================
// PROFILE STATS TYPES (for comparison)
// ============================================================================

/**
 * Champion stats snapshot from database for comparison
 */
export interface ProfileStatsSnapshot {
  championName: string
  patch: string
  games: number
  wins: number
  /** Champion performance averages */
  championStats: {
    sumDamageToChampions: number
    sumTotalDamage: number
    sumHealing: number
    sumShielding: number
    sumCCTime: number
    sumGameDuration: number
    sumDeaths: number
    /** Welford stats for per-minute values (for stddev calculation) */
    welford?: {
      damageToChampionsPerMin?: WelfordState
      totalDamagePerMin?: WelfordState
      healingShieldingPerMin?: WelfordState
      ccTimePerMin?: WelfordState
      deathsPerMin?: WelfordState
    }
  }
  /** Item stats by position */
  items?: Record<string, Record<string, GameStats>>
  /** Rune stats */
  runes?: {
    primary: Record<string, GameStats>
    secondary: Record<string, GameStats>
    tertiary: {
      offense: Record<string, GameStats>
      flex: Record<string, GameStats>
      defense: Record<string, GameStats>
    }
  }
  /** Spell combo stats */
  spells?: Record<string, GameStats>
  /** Starting items stats */
  starting?: Record<string, GameStats>
  /** Skill order stats */
  skills?: Record<string, GameStats>
  /** Core build stats with nested data */
  core?: Record<string, CoreBuildStats>
}

/**
 * Game stats with wins/games for calculating winrate
 */
export interface GameStats {
  games: number
  wins: number
}

/**
 * Core build specific stats
 */
export interface CoreBuildStats extends GameStats {
  items?: Record<string, Record<string, GameStats>>
  runes?: {
    primary: Record<string, GameStats>
    secondary: Record<string, GameStats>
    tertiary: {
      offense: Record<string, GameStats>
      flex: Record<string, GameStats>
      defense: Record<string, GameStats>
    }
  }
  spells?: Record<string, GameStats>
  starting?: Record<string, GameStats>
}

// ============================================================================
// COMPARISON RESULT TYPES
// ============================================================================

/**
 * Result of comparing a player metric against profile averages
 */
export interface ComparisonResult {
  /** Name of the metric being compared */
  metric: string
  /** Player's actual value */
  playerValue: number
  /** Average value from profile stats */
  profileAvg: number
  /** Standard deviation from profile stats (0 if unavailable) */
  profileStddev: number
  /** Z-score: (playerValue - avg) / stddev */
  zScore: number
  /** Whether the z-score indicates an outlier (|z| > 2) */
  isOutlier: boolean
  /** Score 0-100 derived from z-score */
  score: number
}

/**
 * Result of comparing a build choice against ranked options
 */
export interface BuildChoiceResult {
  /** Name of the choice category (e.g., "Keystone", "Spell Combo") */
  category: string
  /** Player's choice key */
  playerChoice: string
  /** Player's choice winrate (if found) */
  playerWinrate: number | null
  /** Top choice winrate */
  topWinrate: number
  /** Player's rank among options (1 = best, -1 = not found) */
  rank: number
  /** Total number of viable options */
  totalOptions: number
  /** Whether in top 5 */
  isInTopN: boolean
  /** Score 0-100 based on rank */
  score: number
  /** Confidence level 0-1 based on sample size */
  confidence: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** All boot item IDs (tier 1 + tier 2) */
export const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158])

/** Normalized boot ID for core key grouping */
export const BOOTS_NORMALIZED = 99999

/** Minimum games threshold for confident stats */
export const MIN_GAMES_THRESHOLD = 10

/** Games needed for full confidence in penalty calculation */
export const FULL_CONFIDENCE_GAMES = 30

// ============================================================================
// UTILITY TYPE HELPERS
// ============================================================================

/**
 * Check if an item ID is a boot
 */
export function isBootItem(itemId: number): boolean {
  return BOOT_IDS.has(itemId)
}

/**
 * Normalize a boot ID to the standard value (99999)
 */
export function normalizeBootId(itemId: number): number {
  return isBootItem(itemId) ? BOOTS_NORMALIZED : itemId
}

/**
 * Create a sorted spell key from two spell IDs
 */
export function createSpellKey(spell1: number, spell2: number): string {
  return `${Math.min(spell1, spell2)}_${Math.max(spell1, spell2)}`
}

/**
 * Calculate winrate from games stats
 */
export function getWinrate(stats: GameStats): number {
  return stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
}

/**
 * Calculate confidence level based on sample size
 */
export function getConfidence(games: number): number {
  if (games < MIN_GAMES_THRESHOLD) {
    return Math.min(0.5, games / MIN_GAMES_THRESHOLD)
  }
  return Math.min(1, 0.5 + (0.5 * (games - MIN_GAMES_THRESHOLD)) / (FULL_CONFIDENCE_GAMES - MIN_GAMES_THRESHOLD))
}
