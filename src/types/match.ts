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
  participantFrames: Record<string, ParticipantFrame>
  events: TimelineEvent[]
}

export interface ParticipantFrame {
  participantId: number
  currentGold: number
  totalGold: number
  level: number
  xp: number
  minionsKilled: number
  jungleMinionsKilled: number
  position: { x: number; y: number }
}

export interface TimelineEvent {
  type: string
  timestamp: number
  participantId?: number
  itemId?: number
  // kill event fields
  killerId?: number
  victimId?: number
  assistingParticipantIds?: number[]
  position?: { x: number; y: number }
  bounty?: number
  shutdownBounty?: number
  victimDamageReceived?: Array<{
    participantId: number
    basic: boolean
    magicDamage: number
    physicalDamage: number
    trueDamage: number
    spellName: string
    spellSlot: number
    type: string
  }>
  // building kill event fields
  buildingType?: string // 'TOWER_BUILDING', 'INHIBITOR_BUILDING'
  teamId?: number // team that lost the building
  laneType?: string // 'MID_LANE' for ARAM
  towerType?: string // 'OUTER_TURRET', 'INNER_TURRET', etc.
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
  // Timeline-derived data
  buildOrder?: string // comma-separated item IDs in purchase order
  firstBuy?: string // comma-separated starting item IDs
  abilityOrder?: string // space-separated ability order (e.g., "Q W Q E Q R...")
  itemPurchases?: Array<{
    itemId: number
    itemName: string
    timestamp: number
    action: 'buy' | 'sell'
    itemType: 'legendary' | 'boots' | 'mythic' | 'component' | 'other'
  }>
  killDeathTimeline?: {
    takedowns: Array<{
      t: number
      gold: number
      tf: boolean
      wasKill: boolean
      pos: number
      value: number
      x: number
      y: number
    }>
    deaths: Array<{
      t: number
      gold: number
      tf: boolean
      trade: boolean
      tradeKills: number
      zone: string
      pos: number
      value: number
      x: number
      y: number
    }>
    towers: Array<{
      t: number
      x: number
      y: number
      team: 'ally' | 'enemy'
    }>
    deathScore: number
  }
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
