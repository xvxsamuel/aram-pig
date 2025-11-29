// unified profile types used across API and frontend

import type { MatchData } from '@/types/match'

// champion stats for a single champion
export interface ChampionStats {
  championName: string
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  totalDamage: number
  averagePigScore: number | null
}

// summary stats across all champions
export interface ProfileSummary {
  totalGames: number
  wins: number
  losses: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  kda: number
  winrate: number
  averagePigScore: number | null
  longestWinStreak: number
  mostPlayedChampion: string
}

// recently played with player
export interface RecentPlayer {
  puuid: string
  gameName: string
  tagLine: string
  games: number
  wins: number
  losses: number
  profileIconId: number
}

// complete profile data returned by API
export interface ProfileData {
  // summoner info
  summoner: {
    puuid: string
    gameName: string
    tagLine: string
    profileIconId: number
    summonerLevel: number
    lastUpdated: string | null
  }
  // aggregated stats
  summary: ProfileSummary
  // per-champion stats
  champions: ChampionStats[]
  // recent matches (first 20)
  matches: MatchData[]
  // players frequently played with
  recentlyPlayedWith: RecentPlayer[]
  // update job status
  updateStatus: {
    hasActiveJob: boolean
    cooldownUntil: string | null
  }
}

// partial profile for loading states
export interface PartialProfileData {
  summoner: ProfileData['summoner']
  summary: ProfileSummary | null
  champions: ChampionStats[]
  matches: MatchData[]
  recentlyPlayedWith: RecentPlayer[]
  updateStatus: ProfileData['updateStatus']
}
