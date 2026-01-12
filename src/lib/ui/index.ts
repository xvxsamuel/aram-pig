// ui utilities barrel exports
export { getWinrateColor, getKdaColor, getPigScoreColor, getPigScoreGradientColors } from './colors'

export {
  getTooltipData,
  isCompletedItem,
  type TooltipData,
  type ItemType,
  type ItemStats,
  type TooltipType,
} from './tooltip-data'

export { cleanWikiMarkup } from './wiki-markup'

export { KEYWORD_ICON_MAP, getKeywordIcon, MARKER_REGEX, renderNestedMarkers } from './tooltip-renderer'

export { ICON_SIZE_MAP, getPixelSize, IconStats, withIconStats, type IconSizePreset } from './icon-utils'

export {
  getChampionTier,
  getTierConfig,
  getTierBorderGradient,
  shouldShowGlint,
  getTierSortValue,
  calculateOverallTier,
  TIER_CONFIGS,
  type ChampionTier,
  type TierConfig,
  type ChampionTierStats,
} from './tier-system'
