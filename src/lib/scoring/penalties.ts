/**
 * PENALTIES MODULE
 * ================
 * 
 * Re-exports from the split modules for convenient imports.
 * Import directly from:
 * - './performance-scoring' for stat-based scoring
 * - './build-scoring' for build choice scoring
 * 
 * PIG SCORE BREAKDOWN:
 * ====================
 * 
 * Final Score = Performance (50%) + Build (50%)
 * 
 * PERFORMANCE COMPONENT (50%):
 * - Damage to Champions (log-transformed, vs champion avg)
 * - Total Damage (log-transformed, vs champion avg)
 * - Healing/Shielding (log-transformed, only if champion avg >= 300/min)
 * - CC Time (special scoring, only if champion avg >= 1 sec/min)
 * - Each stat weighted by relevance to the champion
 * 
 * BUILD COMPONENT (50%):
 * - Items: Per-slot item choice vs Bayesian-ranked options for your core
 * - Keystone: Rune choice ranked by Bayesian score
 * - Spells: Summoner spell combo ranked by Bayesian score  
 * - Skills: Skill max order ranked by Bayesian score
 * - Core: Is your 3-item core a good core? (ranked by Bayesian score)
 * - Starting: Starter items ranked by Bayesian score
 * 
 * SCORING SYSTEM:
 * ===============
 * 
 * All components produce 0-100 scores:
 * - 50 = Average performance
 * - 100 = Excellent (approaches asymptotically)
 * - 0 = Poor (approaches asymptotically)
 * 
 * Sigmoid Function: score = 100 / (1 + e^(-0.8 * z))
 * - z=+3 → ~95 (soft cap)
 * - z=0 → 50 (average)
 * - z=-3 → ~5 (soft floor)
 * 
 * BUILD RANKING:
 * ==============
 * 
 * Items/runes/spells are ranked by Bayesian score:
 * bayesianScore = (games × winrate + prior × avgWinrate) / (games + prior)
 * 
 * Scoring is distance-based from best option:
 * score = 100 - (bestBayesian - playerBayesian) * 5
 * 
 * CORE FAMILY:
 * ============
 * 
 * Cores are grouped by their 2 non-boot items (the "core identity").
 * Different boot choices are merged since boots are game-specific.
 * This increases sample size and makes rankings more stable.
 */

// Re-export everything from performance-scoring
export {
  zScoreToScore,
  zScoreToPercentile,
  percentileToScore,
  calculateStatScore,
  calculateCCTimeScore,
  calculateDeathsScore,
  calculateKillParticipationScore,
  calculateDistanceBasedScore,
} from './performance-scoring'

// Re-export everything from build-scoring
export {
  // Functions
  isCompletedItem,
  normalizeBootId,
  createComboKey,
  createSpellKey,
  calculateBayesianScore,
  mergeCoreData,
  calculateCoreBuildPenalty,
  calculateItemPenaltyFromCoreData,
  calculateKeystonePenaltyFromCoreData,
  calculateSpellsPenaltyFromCoreData,
  calculateSkillOrderPenaltyFromData,
  calculateStartingItemsPenaltyFromCoreData,
  calculateAllBuildPenalties,
  // Types
  type ParticipantForPenalty,
  type ItemPenaltyDetail,
  type StartingItemsPenaltyDetail,
  type CoreBuildDetails,
  type FallbackInfo,
  type AllPenaltiesResult,
  type CoreBuildData,
  type ChampionStatsData,
  // Constants
  BOOT_IDS,
} from './build-scoring'
