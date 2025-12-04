/**
 * PERFORMANCE SCORING MODULE
 * ==========================
 * 
 * Handles statistical scoring for performance metrics (damage, healing, CC, etc.)
 * Uses sigmoid-based z-score to score conversion for smooth, natural scoring.
 * 
 * KEY CONCEPTS:
 * - Z-Score: How many standard deviations above/below average
 * - Sigmoid: Smooth S-curve that maps z-scores to 0-100 with soft caps
 * - Log Transform: Normalizes right-skewed distributions (damage, healing)
 * - True CDF: Mathematically correct percentile calculation
 */

import type { WelfordState } from '../db/stats-aggregator'
import { getStdDev, getZScore } from '../db/stats-aggregator'

/*
 * SIGMOID-BASED SCORING SYSTEM
 * ============================
 *
 * Uses a sigmoid function for smooth, natural scoring with no hard clamps.
 * Average performance gives 50, excellence approaches 100 asymptotically.
 *
 * SCORE MAPPING:
 * | Z-Score | True CDF% | Score  |
 * |---------|-----------|--------|
 * | +3.0    | 99.87%    | ~95    | (soft cap)
 * | +2.0    | 97.72%    | ~88    |
 * | +1.0    | 84.13%    | ~73    |
 * | 0.0     | 50.00%    | 50     | AVERAGE
 * | -1.0    | 15.87%    | ~27    |
 * | -2.0    | 2.28%     | ~12    |
 * | -3.0    | 0.13%     | ~5     | (soft floor)
 *
 * Formula: score = 100 / (1 + e^(-k * z)), where k ≈ 0.8
 */

// Sigmoid scaling constant - determines steepness of the S-curve
// k=0.8 gives good spread: z=3 → ~95, z=-3 → ~5
const SIGMOID_K = 0.8

/**
 * Convert z-score to a 0-100 score using sigmoid function
 * No hard clamps - smooth S-curve with diminishing returns at extremes
 */
export function zScoreToScore(zScore: number): number {
  // Sigmoid: score = 100 / (1 + e^(-k * z))
  // - At z=0: 100 / (1 + 1) = 50
  // - At z→+∞: approaches 100
  // - At z→-∞: approaches 0 (but never reaches it)
  const score = 100 / (1 + Math.exp(-SIGMOID_K * zScore))
  return score
}

/**
 * Convert z-score to true percentile using standard normal CDF (error function)
 * This is the mathematically correct CDF, not an approximation
 */
export function zScoreToPercentile(zScore: number): number {
  // CDF of standard normal: Φ(z) = (1 + erf(z/√2)) / 2
  // Using approximation of error function (erf) with high accuracy
  const x = zScore / Math.SQRT2
  
  // Horner form of rational approximation for erf(x)
  // Accurate to ~1.5e-7 for all x
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1 / (1 + p * absX)
  const erf = sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX))
  
  // Convert erf to CDF and return as percentage
  return ((1 + erf) / 2) * 100
}

/**
 * Convert a percentile (0-100) to a score (0-100)
 * Uses inverse normal CDF (probit function) to get z-score, then sigmoid scoring
 */
export function percentileToScore(percentile: number): number {
  // Clamp percentile to valid range (avoid infinities)
  const p = Math.max(0.001, Math.min(0.999, percentile / 100))

  // Inverse normal CDF using Abramowitz and Stegun approximation (high accuracy)
  const sign = p < 0.5 ? -1 : 1
  const pAdj = p < 0.5 ? p : 1 - p
  const t = Math.sqrt(-2 * Math.log(pAdj))
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308
  const zScore = sign * (t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t))

  return zScoreToScore(zScore)
}

/**
 * Apply log transform for naturally skewed distributions (healing, damage, etc.)
 * This normalizes right-skewed data before z-score calculation
 */
function logTransform(value: number): number {
  // log1p handles 0 values gracefully: log1p(x) = log(1 + x)
  return Math.log1p(value)
}

/**
 * Calculate z-score using log-transformed values (for skewed distributions)
 */
function getLogZScore(playerValue: number, welfordState: WelfordState): number {
  // Transform both the player value and the distribution parameters
  const logPlayer = logTransform(playerValue)
  const logMean = logTransform(welfordState.mean)
  
  // For log-normal, stddev in log space ≈ coefficient of variation in original space
  // But we can estimate from the Welford stddev
  const stdDev = getStdDev(welfordState)
  const cv = stdDev / welfordState.mean // coefficient of variation
  const logStdDev = Math.sqrt(Math.log1p(cv * cv)) // log-normal sigma approximation
  
  if (logStdDev <= 0.01) return 0 // Too little variance
  
  return (logPlayer - logMean) / logStdDev
}

/**
 * Calculate a percentile score for a stat using Welford stats
 * Returns 0-100 score where 50 = average, higher/lower based on sigmoid curve
 * 
 * @param playerValue - The player's actual value
 * @param avgValue - The champion's average value
 * @param welfordState - Optional Welford running statistics for z-score calculation
 * @param useLogTransform - true for naturally skewed stats (damage, healing, gold)
 */
export function calculateStatScore(
  playerValue: number,
  avgValue: number,
  welfordState?: WelfordState,
  useLogTransform: boolean = false
): number {
  if (avgValue <= 0) return 50 // Default to average if no data

  // If we have Welford stats with enough samples, use z-score
  if (welfordState && welfordState.n >= 30) {
    const stdDev = getStdDev(welfordState)

    // If stddev is meaningful (>5% of mean), use z-score
    if (stdDev > welfordState.mean * 0.05) {
      // Use log transform for skewed distributions
      if (useLogTransform && welfordState.mean > 0) {
        const zScore = getLogZScore(playerValue, welfordState)
        return zScoreToScore(zScore)
      }
      // Standard z-score for normal distributions
      const zScore = getZScore(playerValue, welfordState)
      return zScoreToScore(zScore)
    }
  }

  // Fallback: ratio-based score
  // For log-transformed stats, use log ratio
  if (useLogTransform && avgValue > 0 && playerValue > 0) {
    const logRatio = Math.log(playerValue / avgValue)
    // In log space, 0 = equal, positive = above average
    // Typical CV for damage stats is ~0.3, so logStdDev ≈ 0.29
    const estimatedLogStdDev = 0.29
    const equivalentZScore = logRatio / estimatedLogStdDev
    return zScoreToScore(equivalentZScore)
  }

  // Standard ratio-based fallback
  // Assume 15% of mean ≈ 1 standard deviation
  const performanceRatio = playerValue / avgValue
  // Convert ratio to equivalent z-score: (ratio - 1) / 0.15
  const equivalentZScore = (performanceRatio - 1) / 0.15
  return zScoreToScore(equivalentZScore)
}

/**
 * Special CC time scoring:
 * - Below 0.5 sec/min average: don't count CC at all (neutral score)
 * - 0.5-2 sec/min average: just use ratio (100% of avg = 100 score, too inconsistent for variance)
 * - Above 2 sec/min average: use normal z-score based scoring
 */
export function calculateCCTimeScore(
  playerValue: number,
  avgValue: number,
  welfordState?: WelfordState
): number {
  if (avgValue <= 0) return 50 // Default to average if no data

  // Champions with very low CC (< 0.5 sec/min avg) - don't count CC at all
  if (avgValue < 0.5) {
    return 100 // Neutral score, effectively ignored via weight
  }

  // If champion avg CC 0.5-2 sec/min, CC is too inconsistent - just use ratio scoring
  // Meeting or exceeding average = 100, below average scales down proportionally
  if (avgValue < 2) {
    const ratio = playerValue / avgValue
    if (ratio >= 1) return 100 // At or above average = perfect
    // Below average: scale from 0-100 based on how close to average
    // 0% of avg = 0 score, 100% of avg = 100 score
    return Math.round(ratio * 100)
  }

  // Above 2 sec/min: use normal stat scoring with z-score
  return calculateStatScore(playerValue, avgValue, welfordState)
}

/**
 * Calculate deaths/minute score (0-100)
 * Optimal: 0.4-0.6 deaths/min = 80 (good but not perfect)
 * Very low deaths: 60 (safe play)
 * Too many deaths: penalized harshly
 */
export function calculateDeathsScore(deaths: number, gameDurationMinutes: number): number {
  if (gameDurationMinutes <= 0) return 50

  const deathsPerMin = deaths / gameDurationMinutes

  // Optimal range: 0.4-0.6 deaths/min = score 80 (good, not perfect)
  if (deathsPerMin >= 0.4 && deathsPerMin <= 0.6) return 80

  // Very few deaths (safe play, not necessarily bad)
  // 0 deaths/min = score 60
  if (deathsPerMin < 0.4) {
    const deficit = 0.4 - deathsPerMin
    return Math.max(60, 80 - deficit * 50)
  }

  // Too many deaths - penalize more harshly
  // 1.0 deaths/min = score ~50
  // 1.5 deaths/min = score ~20
  // 2.0 deaths/min = score ~0
  const excess = deathsPerMin - 0.6
  return Math.max(0, 80 - excess * 60)
}

/**
 * Calculate kill participation score (0-100)
 * 95%+ KP = 90, scales down from there
 */
export function calculateKillParticipationScore(killParticipation: number): number {
  const EXCELLENT_KP = 0.95
  const GOOD_KP = 0.8

  if (killParticipation >= EXCELLENT_KP) return 90
  if (killParticipation >= GOOD_KP) {
    // 80% = 70, 95% = 90
    return 70 + ((killParticipation - GOOD_KP) / (EXCELLENT_KP - GOOD_KP)) * 20
  }

  // Linear scale from 0 to good
  // 0% KP = 0 score, 80% KP = 70 score
  return Math.max(0, (killParticipation / GOOD_KP) * 70)
}

/**
 * Calculate build choice score (0-100) based on Bayesian score distance from best option
 * 
 * If your choice has nearly the same Bayesian score as the best, you score nearly 100.
 * Score drops based on how far behind the best your choice is.
 * 
 * Formula: score = 100 - (distance * scaleFactor)
 * where distance = bestBayesian - playerBayesian
 * 
 * A 5% winrate gap from best = ~75 score
 * A 10% winrate gap from best = ~50 score
 */
export function calculateDistanceBasedScore(
  playerBayesian: number,
  bestBayesian: number
): number {
  if (bestBayesian <= 0) return 50 // No data
  
  const distance = Math.max(0, bestBayesian - playerBayesian)
  
  // Scale: 5% gap = 25 point drop, 10% gap = 50 point drop
  // score = 100 - (distance * 5)
  const score = 100 - (distance * 5)
  
  return Math.max(20, Math.min(100, Math.round(score)))
}
