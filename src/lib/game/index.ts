// Game module exports
export {
  type RegionalCluster,
  type PlatformCode,
  REGIONS,
  PLATFORM_TO_REGIONAL,
  PLATFORM_TO_LABEL,
  LABEL_TO_PLATFORM,
  LABEL_TO_TAG,
  REGION_OPTIONS,
  getDefaultTag,
  isValidPlatform,
  toLabel,
  toPlatform,
} from './regions'

export {
  PATCHES_TO_KEEP,
  getLatestPatches,
  isPatchAccepted,
  extractPatch,
  patchSchedule,
  getPatchFromDate,
  getDateRangeForDays,
} from './patch'

export { extractAbilityOrder, formatAbilityOrder } from './ability-leveling'

export {
  extractItemPurchases,
  extractCompletedItems,
  extractItemTimeline,
  getFinalItems,
  type ItemPurchaseEvent,
  type ItemTimelineEvent,
  type CompletedItemEvent,
} from './item-history'

// Items - modular build order and first buy utilities
export {
  // Build order constants and utilities
  BOOT_IDS,
  TIER1_BOOTS,
  BOOTS_NORMALIZED,
  isBootItem,
  isCompletedItem,
  isLegendaryOrFinishedBoots,
  normalizeBootId,
  extractCoreItems,
  createCoreKey,
  extractAndNormalizeCoreKey,
  extractBuildOrder,
  extractCompletedBuildOrder,
  formatBuildOrder,
  parseBuildOrder,
  // First buy utilities
  ARAM_STARTING_GOLD,
  STARTER_TIME_WINDOW,
  MAX_STARTER_TIME,
  getItemCost,
  extractFirstBuy,
  formatFirstBuy,
  parseFirstBuy,
  normalizeFirstBuyKey,
} from './items'

export {
  extractKillEvents,
  getPlayerKillDeathTimeline,
  getKillDeathSummary,
  type KillEvent,
  type DeathAnalysis,
  type TakedownAnalysis,
  type PlayerKillDeathTimeline,
  type KillDeathSummary,
} from './kill-timeline'

export {
  RUNE_TREES,
  STAT_PERKS,
  getRuneTree,
  getRuneTreeByName,
  getRuneTreeById,
  type RuneTreeName,
  type RuneTree,
  type RuneTier,
} from './runes'
