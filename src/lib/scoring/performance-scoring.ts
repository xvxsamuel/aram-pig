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
 * SCORE MAPPING (with k=1.6):
 * | Z-Score | True CDF% | Score  | % of Avg  |
 * |---------|-----------|--------|-----------|
 * | +2.0    | 97.72%    | ~96    | ~150%     |
 * | +1.5    | 93.32%    | ~92    | ~130%     |
 * | +1.0    | 84.13%    | ~86    | ~115%     |
 * | 0.0     | 50.00%    | 50     | 100% AVG  |
 * | -1.0    | 15.87%    | ~14    | ~85%      |
 * | -1.5    | 6.68%     | ~8     | ~75%      |
 * | -2.0    | 2.28%     | ~4     | ~70%      |
 *
 * Formula: score = 100 / (1 + e^(-k * z)), where k ≈ 1.6
 * Higher k = more generous scoring for above-average performance
 */

// Sigmoid scaling constant - determines steepness of the S-curve
// k=1.7 gives a balanced spread: 150% of avg (~z=1.8 with low variance) → ~96
// This makes high scores achievable but keeps the 0-100 range meaningful
const SIGMOID_K = 1.7

// Pre-computed constants for optimization
const INV_SQRT2 = 1 / Math.SQRT2
const LOG_1P_CV_CAP_SQUARED = Math.log1p(0.22 * 0.22) // Pre-compute for CV cap of 0.22

/**
 * Convert z-score to a 0-100 score using sigmoid function
 * No hard clamps - smooth S-curve with diminishing returns at extremes
 */
export function zScoreToScore(zScore: number): number {
  // Sigmoid: score = 100 / (1 + e^(-k * z))
  // - At z=0: 100 / (1 + 1) = 50
  // - At z→+∞: approaches 100
  // - At z→-∞: approaches 0 (but never reaches it)
  return 100 / (1 + Math.exp(-SIGMOID_K * zScore))
}

/**
 * Convert z-score to true percentile using standard normal CDF (error function)
 * This is the mathematically correct CDF, not an approximation
 */
export function zScoreToPercentile(zScore: number): number {
  // CDF of standard normal: Φ(z) = (1 + erf(z/√2)) / 2
  // Using approximation of error function (erf) with high accuracy
  const x = zScore * INV_SQRT2
  
  // Horner form of rational approximation for erf(x)
  // Accurate to ~1.5e-7 for all x
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * absX)
  const t2 = t * t
  const t3 = t2 * t
  const t4 = t3 * t
  const t5 = t4 * t
  
  // Optimized Horner form - reduce multiplications by computing powers once
  const erf = sign * (1 - (1.061405429 * t5 - 1.453152027 * t4 + 1.421413741 * t3 - 0.284496736 * t2 + 0.254829592 * t) * Math.exp(-absX * absX))
  
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
 * Caps CV to make scoring more generous - high variance shouldn't punish good performance
 */
function getLogZScore(playerValue: number, welfordState: WelfordState): number {
  // Transform both the player value and the distribution parameters
  const logPlayer = logTransform(playerValue)
  const logMean = logTransform(welfordState.mean)
  
  // For log-normal, stddev in log space ≈ coefficient of variation in original space
  const cv = getStdDev(welfordState) / welfordState.mean // coefficient of variation
  
  // Cap CV at 0.22 to prevent overly harsh scoring
  // Most damage distributions have CV ~0.20-0.30, capping prevents outliers from skewing scores
  // Lower cap (0.22) assumes tighter distribution, rewarding high performance more
  const logStdDev = cv <= 0.22 
    ? Math.sqrt(Math.log1p(cv * cv))
    : Math.sqrt(LOG_1P_CV_CAP_SQUARED) // Use pre-computed constant
  
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
 * @param gameDurationMinutes - Optional game duration to adjust expectations for short games
 */
export function calculateStatScore(
  playerValue: number,
  avgValue: number,
  welfordState?: WelfordState,
  useLogTransform: boolean = false,
  gameDurationMinutes?: number
): number {
  if (avgValue <= 0) return 50 // Default to average if no data

  // Calculate duration factor once if needed
  const needsAdjustment = gameDurationMinutes && gameDurationMinutes < 15
  const durationFactor = needsAdjustment ? Math.pow(gameDurationMinutes / 15, 0.5) : 1

  // If we have Welford stats with enough samples, use z-score
  if (welfordState && welfordState.n >= 30) {
    const stdDev = getStdDev(welfordState)

    // If stddev is meaningful (>5% of mean), use z-score
    if (stdDev > welfordState.mean * 0.05) {
      // Adjust player value for short games (inverse of lowering mean)
      const adjustedPlayerValue = playerValue / durationFactor

      // Use log transform for skewed distributions
      if (useLogTransform && welfordState.mean > 0) {
        return zScoreToScore(getLogZScore(adjustedPlayerValue, welfordState))
      }
      // Standard z-score for normal distributions
      return zScoreToScore(getZScore(adjustedPlayerValue, welfordState))
    }
  }

  // Short game adjustment for fallback scoring
  const adjustedAvg = avgValue * durationFactor

  // Fallback: ratio-based score
  // For log-transformed stats, use log ratio
  if (useLogTransform && adjustedAvg > 0 && playerValue > 0) {
    const logRatio = Math.log(playerValue / adjustedAvg)
    // In log space, 0 = equal, positive = above average
    // Typical CV for damage stats is ~0.2-0.25, so logStdDev ≈ 0.20
    // This means 150% of avg (logRatio ≈ 0.405) → z ≈ 2.0 → score ~96
    const estimatedLogStdDev = 0.20
    const equivalentZScore = logRatio / estimatedLogStdDev
    return zScoreToScore(equivalentZScore)
  }

  // Standard ratio-based fallback
  // Assume 25% of mean ≈ 1 standard deviation (more realistic than 15%)
  // This gives: 150% of avg → z = 2.0 → score ~96
  const performanceRatio = playerValue / adjustedAvg
  const equivalentZScore = (performanceRatio - 1) / 0.25
  return zScoreToScore(equivalentZScore)
}

/**
 * Calculate damage score with team share mitigation
 * If raw damage is low but damage share is high (team got stomped), mitigate the penalty
 */
export function calculateDamageScore(
  playerDamage: number,
  avgDamage: number,
  welfordState: WelfordState | undefined,
  gameDurationMinutes: number,
  teamDamageShare?: number
): number {
  const rawScore = calculateStatScore(playerDamage, avgDamage, welfordState, true, gameDurationMinutes)
  
  // If score is good, or we don't have share data, return raw score
  if (rawScore >= 50 || teamDamageShare === undefined) {
    return rawScore
  }

  // Calculate share score with clamping (10% = 0, 30% = 100, linear between)
  const shareScore = teamDamageShare >= 0.30 ? 100
    : teamDamageShare <= 0.10 ? 0
    : ((teamDamageShare - 0.10) / 0.20) * 100
  
  // If share score is better, blend 50/50
  if (shareScore > rawScore) {
    return Math.round(rawScore + (shareScore - rawScore) * 0.5)
  }
  
  return rawScore
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
  welfordState?: WelfordState,
  gameDurationMinutes?: number
): number {
  if (avgValue <= 0) return 50 // Default to average if no data

  // Champions with very low CC (< 0.5 sec/min avg) - don't count CC at all
  if (avgValue < 0.5) {
    return 100 // Neutral score, effectively ignored via weight
  }

  // If champion avg CC 0.5-3 sec/min, CC is too inconsistent - just use ratio scoring
  // Meeting or exceeding average = 100, below average scales down proportionally
  // Threshold raised from 2 to 3 to be more generous to high CC champions
  if (avgValue < 3) {
    const ratio = playerValue / avgValue
    if (ratio >= 1) return 100 // At or above average = perfect
    // Below average: scale from 0-100 based on how close to average
    // 0% of avg = 0 score, 100% of avg = 100 score
    return Math.round(ratio * 100)
  }

  // Above 3 sec/min: use normal stat scoring with z-score
  return calculateStatScore(playerValue, avgValue, welfordState, false, gameDurationMinutes)
}

/**
 * Calculate deaths/minute score (0-100)
 * Optimal: 0.4-0.6 deaths/min = 80 (good but not perfect)
 * Very low deaths: 60 (safe play)
 * Too many deaths: penalized, but death quality can offset
 * 
 * @param deathQuality - Optional death quality score (0-100) - good deaths reduce penalty
 */
export function calculateDeathsScore(
  deaths: number,
  gameDurationMinutes: number,
  deathQuality?: number
): number {
  if (gameDurationMinutes <= 0) return 50

  const deathsPerMin = deaths / gameDurationMinutes

  // Optimal range: 0.5-0.7 deaths/min = score 100 (perfect tempo)
  if (deathsPerMin >= 0.5 && deathsPerMin <= 0.7) return 100

  // Too few deaths (holding gold, not resetting)
  // Linear penalty: 200 points per death/min below 0.5
  if (deathsPerMin < 0.5) {
    return Math.max(0, Math.round(100 - (0.5 - deathsPerMin) * 200))
  }

  // Too many deaths - calculate excess penalty
  const excess = deathsPerMin - 0.7
  const basePenalty = excess * 120
  
  // If death quality is good (60+), reduce penalty proportionally
  const qualityReduction = (deathQuality !== undefined && deathQuality >= 60)
    ? basePenalty * Math.min(0.5, (deathQuality - 60) / 100)
    : 0
  
  return Math.max(0, Math.round(100 - basePenalty + qualityReduction))
}

/**
 * Calculate kill participation score (0-100)
 * Uses a smooth power curve: score = 100 * (kp / 0.9)^0.9
 * 
 * This gives:
 * - 90%+ KP = 100 score (perfect)
 * - 85% KP = ~95 score
 * - 70% KP = ~79 score
 * - 50% KP = ~57 score
 * - Smooth curve throughout
 */
const KP_SCALE = 1 / 0.9 // Pre-compute normalization factor

export function calculateKillParticipationScore(killParticipation: number): number {
  // Cap at 90% KP for perfect score and apply power curve
  const cappedKP = Math.min(killParticipation, 0.9)
  return Math.max(0, Math.round(100 * Math.pow(cappedKP * KP_SCALE, 0.9)))
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
