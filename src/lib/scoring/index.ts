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
  BOOT_IDS,
  BOOTS_NORMALIZED,
  MIN_GAMES_THRESHOLD,
  FULL_CONFIDENCE_GAMES,
  isBootItem,
  normalizeBootId,
  createSpellKey,
  getWinrate,
  getConfidence,
} from './types'

// Stat extractors - modular helpers for extracting match stats
export {
  isCompletedItem,
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
  zScoreToScore,
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

// Penalties - build choice penalty calculations
export {
  calculateStatPenalty,
  calculateDeathsPerMinutePenalty,
  calculateItemPenalty,
  calculateItemPenaltyWithDetails,
  calculateAllBuildPenalties,
  calculateKeystonePenalty,
  calculateSpellsPenalty,
  calculateSkillOrderPenalty,
  calculateBuildOrderPenalty,
  type ItemPenaltyDetail,
  type StartingItemsPenaltyDetail,
  type CoreBuildDetails,
  type AllPenaltiesResult,
  type FallbackInfo,
} from './penalties'

// Profile stats - recalculation utilities
export {
  recalculateProfileChampionStats,
  recalculateProfileStatsForPlayers,
  getTrackedPlayersFromMatches,
  type ChampionProfileStats,
  type ProfileChampions,
} from './profile-stats'
