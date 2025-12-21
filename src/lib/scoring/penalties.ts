// penalties module
// re-exports from the split modules for convenient imports.
// import directly from:
// - './performance-scoring' for stat-based scoring
// - './build-scoring' for build choice scoring
//
// pig score breakdown:
// final score = performance (50%) + build (50%)
//
// performance component (50%):
// - damage to champions (log-transformed, vs champion avg)
// - total damage (log-transformed, vs champion avg)
// - healing/shielding (log-transformed, only if champion avg >= 300/min)
// - cc time (special scoring, only if champion avg >= 1 sec/min)
// - each stat weighted by relevance to the champion
//
// build component (50%):
// - items: per-slot item choice vs bayesian-ranked options for your core
// - keystone: rune choice ranked by bayesian score
// - spells: summoner spell combo ranked by bayesian score
// - skills: skill max order ranked by bayesian score
// - core: is your 3-item core a good core? (ranked by bayesian score)
// - starting: starter items ranked by bayesian score
//
// scoring system:
// all components produce 0-100 scores:
// - 50 = average performance
// - 100 = excellent (approaches asymptotically)
// - 0 = poor (approaches asymptotically)
//
// sigmoid function: score = 100 / (1 + e^(-0.8 * z))
// - z=+3 → ~95 (soft cap)
// - z=0 → 50 (average)
// - z=-3 → ~5 (soft floor)
//
// build ranking:
// items/runes/spells are ranked by bayesian score:
// bayesianscore = (games × winrate + prior × avgwinrate) / (games + prior)
//
// scoring is distance-based from best option:
// score = 100 - (bestbayesian - playerbayesian) * 5
//
// core family:
// cores are grouped by their 2 non-boot items (the "core identity").
// different boot choices are merged since boots are game-specific.
// this increases sample size and makes rankings more stable.

// Re-export everything from performance-scoring
export {
  zScoreToScore,
  zScoreToPercentile,
  percentileToScore,
  calculateStatScore,
  calculateDamageScore,
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
