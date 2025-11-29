// unified profile types used across API and frontend

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

// match participant (simplified from Riot API format)
export interface MatchParticipant {
  puuid: string
  riotIdGameName: string
  riotIdTagline: string
  championName: string
  teamId: number
  win: boolean
  kills: number
  deaths: number
  assists: number
  champLevel: number
  totalDamageDealtToChampions: number
  goldEarned: number
  totalMinionsKilled: number
  summoner1Id: number
  summoner2Id: number
  items: number[]
  perks: {
    primary: { style: number; perks: number[] }
    secondary: { style: number; perks: number[] }
    statPerks: number[]
  }
  pigScore: number | null
  isRemake: boolean
  multiKills: {
    double: number
    triple: number
    quadra: number
    penta: number
  }
}

// match data structure
export interface ProfileMatch {
  matchId: string
  gameCreation: number
  gameDuration: number
  participants: MatchParticipant[]
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
  matches: ProfileMatch[]
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
  matches: ProfileMatch[]
  recentlyPlayedWith: RecentPlayer[]
  updateStatus: ProfileData['updateStatus']
}
