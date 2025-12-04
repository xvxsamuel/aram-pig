// DB module exports
export { supabase, createAdminClient } from './supabase'

export {
  getSummonerInfo,
  getChampionStats,
  calculateSummary,
  getMatchesAsMatchData,
  getLongestWinStreak,
  calculateRecentlyPlayedWith,
  getProfileIcons,
  getUpdateStatus,
} from './profile-queries'

export {
  storeMatchData,
  flushAggregatedStats,
  flushStatsBatch,
  getStatsBufferCount,
  getAggregatedChampionCount,
  type ParticipantStatsData,
} from './match-storage'

export {
  StatsAggregator,
  statsAggregator,
  type ParticipantStatsInput,
  type WelfordState,
  getVariance,
  getStdDev,
  getZScore,
} from './stats-aggregator'

export { getTrackedPuuids, invalidateTrackedPuuidsCache } from './tracked-players'

export { getStoredTimeline } from './auto-enrich'

export {
  isFinishedItem,
  extractSkillOrderAbbreviation,
  extractRunes,
  buildMatchData,
  processParticipants,
  calculateTeamKills,
  prepareStatsCache,
} from './participant-processor'
