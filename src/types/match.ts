// match data types from Riot API

export interface MatchTimeline {
  metadata: {
    matchId: string
    participants: string[]
  }
  info: {
    frames: TimelineFrame[]
    frameInterval: number
  }
}

export interface TimelineFrame {
  timestamp: number
  participantFrames: Record<string, unknown>
  events: TimelineEvent[]
}

export interface TimelineEvent {
  type: string
  timestamp: number
  participantId?: number
  itemId?: number
}

export interface MatchData {
  metadata: {
    matchId: string
    participants: string[] // array of PUUIDs - not summoner names
  }
  info: {
    gameCreation: number
    gameDuration: number
    gameEndTimestamp: number
    gameMode: string
    gameVersion: string
    queueId: number
    participants: ParticipantData[]
  }
}

export interface ParticipantData {
  puuid: string
  summonerName: string
  riotIdGameName: string
  riotIdTagline: string
  championName: string
  championId: number
  teamId: number
  win: boolean
  gameEndedInEarlySurrender: boolean
  kills: number
  deaths: number
  assists: number
  champLevel: number
  totalDamageDealtToChampions: number
  totalDamageDealt?: number
  totalDamageTaken?: number
  totalHealsOnTeammates?: number
  totalDamageShieldedOnTeammates?: number
  timeCCingOthers?: number
  totalTimeSpentDead?: number
  goldEarned: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  summoner1Id: number
  summoner2Id: number
  doubleKills?: number
  tripleKills?: number
  quadraKills?: number
  pentaKills?: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  pigScore?: number
  pigScoreBreakdown?: Record<string, unknown>
  labels?: string[]
  firstItem?: number
  secondItem?: number
  thirdItem?: number
  perks?: {
    styles: Array<{
      style: number
      selections: Array<{
        perk: number
      }>
    }>
    statPerks: {
      offense: number
      flex: number
      defense: number
    }
  }
}
