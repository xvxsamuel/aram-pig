// item utilities - re-exports from modular items/ directory
// this file maintains backward compatibility with existing imports

// re-export all from the modular items/ directory
export {
  // build order constants and utilities
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
  // first buy utilities
  ARAM_STARTING_GOLD,
  STARTER_TIME_WINDOW,
  MAX_STARTER_TIME,
  getItemCost,
  extractFirstBuy,
  formatFirstBuy,
  parseFirstBuy,
  normalizeFirstBuyKey,
} from './items/index'
