// db module exports
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
  storeMatchDataBatch,
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

export {
  isFinishedItem,
  extractRunes,
  buildMatchData,
  processParticipants,
  calculateTeamKills,
} from './participant-processor'
