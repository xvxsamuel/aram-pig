// Stat comparison - compare match stats against profile averages using z-scores

import type { WelfordState } from '../db/stats-aggregator'
import { getStdDev, getZScore } from '../db/stats-aggregator'
import type {
  ComparisonResult,
  BuildChoiceResult,
  ProfileStatsSnapshot,
  MatchStats,
  GameStats,
  CoreBuildStats,
} from './types'
import { 
  MIN_GAMES_THRESHOLD, 
  getConfidence, 
  getWinrate,
  createSpellKey,
} from './types'

// ============================================================================
// Z-SCORE BASED COMPARISON
// ============================================================================

/**
 * Convert z-score to a 0-100 score with target at z=+2
 * Formula: score = 50 + (zScore * 25), clamped to [0, 100]
 * 
 * | Z-Score | Score | Percentile |
 * |---------|-------|------------|
 * | +2.0    | 100   | 98th       |
 * | +1.0    | 75    | 84th       |
 * | 0.0     | 50    | 50th       |
 * | -1.0    | 25    | 16th       |
 * | -2.0    | 0     | 2nd        |
 */
export function zScoreToScore(zScore: number): number {
  const score = 50 + zScore * 25
  return Math.max(0, Math.min(100, score))
}

/**
 * Compare a single metric against profile stats
 * Uses z-score if Welford stats available, otherwise ratio-based
 */
export function compareMetric(
  playerValue: number,
  profileAvg: number,
  profileStddev: number,
  metric: string
): ComparisonResult {
  // handle edge cases
  if (profileAvg <= 0) {
    return {
      metric,
      playerValue,
      profileAvg,
      profileStddev,
      zScore: 0,
      isOutlier: false,
      score: 50, // default to average if no data
    }
  }

  let zScore: number
  if (profileStddev > profileAvg * 0.05) {
    // meaningful stddev - use z-score
    zScore = (playerValue - profileAvg) / profileStddev
  } else {
    // low stddev - fallback to ratio-based
    // assume 15% of mean ≈ 1 standard deviation
    const performanceRatio = playerValue / profileAvg
    zScore = (performanceRatio - 1) / 0.15
  }

  return {
    metric,
    playerValue,
    profileAvg,
    profileStddev,
    zScore,
    isOutlier: Math.abs(zScore) > 2,
    score: zScoreToScore(zScore),
  }
}

/**
 * Compare metric using Welford state for proper stddev
 */
export function compareMetricWithWelford(
  playerValue: number,
  welfordState: WelfordState | undefined,
  metric: string
): ComparisonResult {
  if (!welfordState || welfordState.n < 30) {
    // insufficient data for statistical comparison
    return {
      metric,
      playerValue,
      profileAvg: welfordState?.mean || 0,
      profileStddev: 0,
      zScore: 0,
      isOutlier: false,
      score: 50,
    }
  }

  const stdDev = getStdDev(welfordState)
  return compareMetric(playerValue, welfordState.mean, stdDev, metric)
}

// ============================================================================
// RANK-BASED COMPARISON (for build choices)
// ============================================================================

/**
 * Calculate score based on rank position
 * Uses exponential decay: top choice scores high, drops off faster
 * Rank 1 = 90, Rank 2 = 74, Rank 3 = 61, Rank 5 = 41, Rank 10 = 14
 */
export function rankToScore(rank: number): number {
  if (rank <= 0) return 90
  // exponential decay with decay constant of 5
  const score = 90 * Math.exp(-(rank - 1) / 5)
  return Math.max(0, Math.round(score))
}

/**
 * Compare a build choice (item, rune, spell, etc.) against ranked options
 */
export function compareBuildChoice<T extends GameStats>(
  playerChoice: string,
  options: Record<string, T>,
  category: string
): BuildChoiceResult {
  if (!options || Object.keys(options).length === 0) {
    return {
      category,
      playerChoice,
      playerWinrate: null,
      topWinrate: 0,
      rank: -1,
      totalOptions: 0,
      isInTopN: false,
      score: 50, // neutral if no data
      confidence: 0,
    }
  }

  // rank options by winrate, filtered by min games
  const rankedOptions = Object.entries(options)
    .filter(([, stats]) => stats.games >= MIN_GAMES_THRESHOLD)
    .map(([key, stats]) => ({
      key,
      winrate: getWinrate(stats),
      games: stats.games,
      confidence: getConfidence(stats.games),
    }))
    .sort((a, b) => b.winrate - a.winrate)

  if (rankedOptions.length === 0) {
    return {
      category,
      playerChoice,
      playerWinrate: null,
      topWinrate: 0,
      rank: -1,
      totalOptions: 0,
      isInTopN: false,
      score: 50,
      confidence: 0,
    }
  }

  // find player's choice in ranked list
  const playerIndex = rankedOptions.findIndex(o => o.key === playerChoice)
  let playerOption = playerIndex >= 0 ? rankedOptions[playerIndex] : null
  let playerRank = playerIndex >= 0 ? playerIndex + 1 : -1

  // check low sample data if not found in ranked list
  if (!playerOption && options[playerChoice]) {
    const lowSample = options[playerChoice]
    if (lowSample.games >= 1) {
      playerRank = rankedOptions.length + 1
      playerOption = {
        key: playerChoice,
        winrate: getWinrate(lowSample),
        games: lowSample.games,
        confidence: getConfidence(lowSample.games),
      }
    }
  }

  const topWinrate = rankedOptions[0]?.winrate || 0

  if (!playerOption) {
    // truly unknown choice
    return {
      category,
      playerChoice,
      playerWinrate: null,
      topWinrate,
      rank: -1,
      totalOptions: rankedOptions.length,
      isInTopN: false,
      score: 40, // penalty for unknown
      confidence: 0,
    }
  }

  const score = rankToScore(playerRank)
  const isInTopN = playerRank <= 5

  return {
    category,
    playerChoice,
    playerWinrate: playerOption.winrate,
    topWinrate,
    rank: playerRank,
    totalOptions: rankedOptions.length,
    isInTopN,
    score,
    confidence: playerOption.confidence,
  }
}

// ============================================================================
// FULL STATS COMPARISON
// ============================================================================

/**
 * Compare all efficiency stats against profile
 */
export function compareEfficiencyStats(
  matchStats: MatchStats,
  profileStats: ProfileStatsSnapshot
): ComparisonResult[] {
  const results: ComparisonResult[] = []
  const welford = profileStats.championStats?.welford
  const games = profileStats.games || 1
  const avgDuration = (profileStats.championStats?.sumGameDuration || 0) / games / 60

  if (avgDuration <= 0) return results

  // damage to champions
  if (profileStats.championStats?.sumDamageToChampions) {
    const avgDmgPerMin = profileStats.championStats.sumDamageToChampions / games / avgDuration
    if (welford?.damageToChampionsPerMin && welford.damageToChampionsPerMin.n >= 30) {
      results.push(compareMetricWithWelford(
        matchStats.efficiency.damageToChampionsPerMin,
        welford.damageToChampionsPerMin,
        'Damage to Champions'
      ))
    } else {
      results.push(compareMetric(
        matchStats.efficiency.damageToChampionsPerMin,
        avgDmgPerMin,
        avgDmgPerMin * 0.15, // fallback stddev
        'Damage to Champions'
      ))
    }
  }

  // total damage
  if (profileStats.championStats?.sumTotalDamage) {
    const avgTotalPerMin = profileStats.championStats.sumTotalDamage / games / avgDuration
    if (welford?.totalDamagePerMin && welford.totalDamagePerMin.n >= 30) {
      results.push(compareMetricWithWelford(
        matchStats.efficiency.totalDamagePerMin,
        welford.totalDamagePerMin,
        'Total Damage'
      ))
    } else {
      results.push(compareMetric(
        matchStats.efficiency.totalDamagePerMin,
        avgTotalPerMin,
        avgTotalPerMin * 0.15,
        'Total Damage'
      ))
    }
  }

  // healing + shielding
  const avgHealing = (profileStats.championStats?.sumHealing || 0) / games
  const avgShielding = (profileStats.championStats?.sumShielding || 0) / games
  const avgHealShieldPerMin = (avgHealing + avgShielding) / avgDuration

  if (avgHealShieldPerMin >= 300 / 60) { // only relevant if 300+/min avg
    if (welford?.healingShieldingPerMin && welford.healingShieldingPerMin.n >= 30) {
      results.push(compareMetricWithWelford(
        matchStats.efficiency.healingShieldingPerMin,
        welford.healingShieldingPerMin,
        'Healing/Shielding'
      ))
    } else {
      results.push(compareMetric(
        matchStats.efficiency.healingShieldingPerMin,
        avgHealShieldPerMin,
        avgHealShieldPerMin * 0.15,
        'Healing/Shielding'
      ))
    }
  }

  // CC time
  const avgCCPerMin = (profileStats.championStats?.sumCCTime || 0) / games / avgDuration
  if (avgCCPerMin >= 1) { // only relevant if 1+ sec/min avg
    if (welford?.ccTimePerMin && welford.ccTimePerMin.n >= 30) {
      results.push(compareMetricWithWelford(
        matchStats.efficiency.ccTimePerMin,
        welford.ccTimePerMin,
        'CC Time'
      ))
    } else {
      results.push(compareMetric(
        matchStats.efficiency.ccTimePerMin,
        avgCCPerMin,
        avgCCPerMin * 0.15,
        'CC Time'
      ))
    }
  }

  return results
}

/**
 * Get data source for core-specific or global comparison
 * Uses core-specific data if available with 10+ games
 */
export function getDataSourceForCore(
  profileStats: ProfileStatsSnapshot,
  coreKey: string | null
): { source: ProfileStatsSnapshot | CoreBuildStats; isCore: boolean } {
  if (!coreKey || !profileStats.core) {
    return { source: profileStats, isCore: false }
  }

  // exact match
  if (profileStats.core[coreKey] && profileStats.core[coreKey].games >= MIN_GAMES_THRESHOLD) {
    return { source: profileStats.core[coreKey], isCore: true }
  }

  // find best matching core (2+ matching items, most games)
  const coreKeyItems = coreKey.split('_').map(Number)
  let bestMatch: { key: string; data: CoreBuildStats; matchCount: number } | null = null

  for (const [key, data] of Object.entries(profileStats.core)) {
    const keyItems = key.split('_').map(Number)
    const matchCount = coreKeyItems.filter(item => keyItems.includes(item)).length
    if (matchCount >= 2 && data.games >= MIN_GAMES_THRESHOLD) {
      if (!bestMatch || data.games > bestMatch.data.games) {
        bestMatch = { key, data, matchCount }
      }
    }
  }

  if (bestMatch) {
    return { source: bestMatch.data, isCore: true }
  }

  return { source: profileStats, isCore: false }
}

/**
 * Compare build choices using core-specific data when available
 */
export function compareBuildChoices(
  matchStats: MatchStats,
  profileStats: ProfileStatsSnapshot
): BuildChoiceResult[] {
  const results: BuildChoiceResult[] = []
  const coreKey = matchStats.items.coreKey
  const { source } = getDataSourceForCore(profileStats, coreKey)

  // keystone
  if (matchStats.runes.keystoneId > 0) {
    const keystoneData = 'runes' in source && source.runes?.primary
      ? source.runes.primary
      : profileStats.runes?.primary
    if (keystoneData) {
      results.push(compareBuildChoice(
        matchStats.runes.keystoneId.toString(),
        keystoneData,
        'Keystone'
      ))
    }
  }

  // summoner spells
  if (matchStats.spells[0] > 0 && matchStats.spells[1] > 0) {
    const spellKey = createSpellKey(matchStats.spells[0], matchStats.spells[1])
    const spellData = 'spells' in source && source.spells
      ? source.spells
      : profileStats.spells
    if (spellData) {
      results.push(compareBuildChoice(spellKey, spellData, 'Summoner Spells'))
    }
  }

  // skill order (uses global data, not core-specific)
  if (matchStats.skillOrder && profileStats.skills) {
    results.push(compareBuildChoice(matchStats.skillOrder, profileStats.skills, 'Skill Order'))
  }

  // starting items
  if (matchStats.items.firstBuy) {
    const startingData = 'starting' in source && source.starting
      ? source.starting
      : profileStats.starting
    if (startingData) {
      results.push(compareBuildChoice(matchStats.items.firstBuy, startingData, 'Starting Items'))
    }
  }

  // core build (uses global data to evaluate the core itself)
  if (coreKey && profileStats.core) {
    results.push(compareBuildChoice(coreKey, profileStats.core, 'Core Build'))
  }

  return results
}

// ============================================================================
// HELPER EXPORTS
// ============================================================================

export {
  getStdDev,
  getZScore,
}
