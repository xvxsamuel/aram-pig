// scoring module barrel exports

// Types - standardized stats extraction and comparison types
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

// Stat extractors - modular helpers for extracting match stats
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

// Stat comparison - z-score based comparison against profile stats
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

// Calculator - main PIG score calculation
export {
  calculatePigScore,
  calculatePigScoreWithBreakdown,
  calculatePigScoreWithBreakdownCached,
  prefetchChampionStats,
  type ParticipantData,
  type PigScoreBreakdown,
  type ChampionStatsCache,
} from './calculator'

// Performance scoring - stat-based scoring (z-score, sigmoid, CDF)
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

// Build scoring - build choice scoring (items, runes, spells, cores)
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
  getTrackedPlayersFromMatches,
  type ChampionProfileStats,
  type ProfileChampions,
} from './profile-stats'
