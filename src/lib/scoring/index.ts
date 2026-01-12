// scoring module barrel exports

// types - standardized stats extraction and comparison types
export {
  type MatchStats,
  type BasicMatchStats,
  type ProfileStatsSnapshot,
  type GameStats,
  type CoreBuildStats,
  type ComparisonResult,
  type BuildChoiceResult,
  BOOT_IDS as BOOT_IDS_SET, // Renamed to avoid conflict with build-scoring
  BOOTS_NORMALIZED,
  MIN_GAMES_THRESHOLD,
  FULL_CONFIDENCE_GAMES,
  isBootItem,
  normalizeBootId as normalizeBootIdTypes,
  createSpellKey as createSpellKeyTypes,
  getWinrate,
  getConfidence,
} from './types'

// stat extractors - modular helpers for extracting match stats
export {
  isCompletedItem as isCompletedItemExtractor,
  isLegendaryOrBoots,
  extractSkillOrderAbbreviation,
  extractCoreKey,
  extractCoreItems,
  extractKDA,
  extractEfficiency,
  extractFinalItems,
  extractBuildMetrics,
  extractRunes,
  extractSpells,
  extractAllMatchStats,
  extractBasicMatchStats,
  extractMatchStatsFromJsonb,
  type ParticipantInput,
  type MatchDataJsonb,
} from './stat-extractors'

// stat comparison - z-score based comparison against profile stats
export {
  zScoreToScore as zScoreToScoreComparison,
  compareMetric,
  compareMetricWithWelford,
  rankToScore,
  compareBuildChoice,
  compareEfficiencyStats,
  getDataSourceForCore,
  compareBuildChoices,
} from './stat-comparison'

// calculator - main pig score calculation
export {
  calculatePigScore,
  calculatePigScoreWithBreakdown,
  calculatePigScoreWithBreakdownCached,
  prefetchChampionStats,
  type ParticipantData,
  type PigScoreBreakdown,
  type ChampionStatsCache,
} from './calculator'

// performance scoring - stat-based scoring (z-score, sigmoid, cdf)
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

// build scoring - build choice scoring (items, runes, spells, cores)
export {
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
  BOOT_IDS,
  type ParticipantForPenalty,
  type ItemPenaltyDetail,
  type StartingItemsPenaltyDetail,
  type CoreBuildDetails,
  type FallbackInfo,
  type AllPenaltiesResult,
  type CoreBuildData,
  type ChampionStatsData,
} from './build-scoring'

// Profile stats - recalculation utilities
export {
  recalculateProfileChampionStats,
  recalculateProfileStatsForPlayers,
  type ChampionProfileStats,
  type ProfileChampions,
} from './profile-stats'

// PIG calculator - on-demand calculation utilities
export {
  ONE_YEAR_MS,
  BATCH_SIZE as PIG_BATCH_SIZE,
  MAX_TIME_MS as PIG_MAX_TIME_MS,
  calculateTeamTotals,
  extractTimelineData,
  calculateParticipantPigScore,
  filterNeedingCalculation,
  calculateUserMatchesPigScores,
  calculateOtherPlayersPigScores,
  type PigCalcResult,
  type MatchParticipantRecord,
} from './pig-calculator'
