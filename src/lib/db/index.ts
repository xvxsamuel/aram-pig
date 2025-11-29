// DB module exports
export {
  supabase,
  createAdminClient,
} from './supabase'

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
} from './stats-aggregator'

export {
  getTrackedPuuids,
  invalidateTrackedPuuidsCache,
} from './tracked-players'
