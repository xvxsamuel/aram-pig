// scoring module barrel exports
export {
  calculatePigScore,
  calculatePigScoreWithBreakdown,
  type ParticipantData,
  type PigScoreBreakdown,
} from './calculator'

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
  type AllPenaltiesResult,
} from './penalties'

export {
  recalculateProfileChampionStats,
  recalculateProfileStatsForPlayers,
  getTrackedPlayersFromMatches,
  type ChampionProfileStats,
  type ProfileChampions,
} from './profile-stats'
