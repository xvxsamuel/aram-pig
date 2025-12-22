// shared types for champion statistics and build data

export interface ItemStat {
  item_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

export interface StarterBuild {
  starter_build: string // comma-separated item ids
  items: number[] // array of item ids
  games: number
  wins: number
  winrate: number
  pickrate: number
}

export interface RuneStat {
  rune_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

export interface StatPerkStat {
  key: string
  games: number
  wins: number
  winrate: number
}

export interface AbilityLevelingStat {
  ability_order: string
  games: number
  wins: number
  winrate: number
  pickrate: number
}

export interface SummonerSpellStat {
  spell1_id: number
  spell2_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

export interface PreCalculatedCombo {
  normalizedItems: number[]
  actualBoots: number[]
  games: number
  wins: number
  winrate?: number
  pickrate?: number
  stdDev?: number
  variance?: number
  championWinrate?: number
  itemStats: Record<
    number,
    {
      positions: Record<number, { games: number; wins: number }>
    }
  >
  runes?: {
    primary?: Record<string, { games: number; wins: number }>
    secondary?: Record<string, { games: number; wins: number }>
    tertiary?: {
      offense?: Record<string, { games: number; wins: number }>
      flex?: Record<string, { games: number; wins: number }>
      defense?: Record<string, { games: number; wins: number }>
    }
  }
  spells?: Record<string, { games: number; wins: number }>
  starting?: Record<string, { games: number; wins: number }>
  skills?: Record<string, { games: number; wins: number }>
}

export interface ChampionDetailTabsProps {
  itemsBySlot: Record<number, ItemStat[]>
  bootsItems: ItemStat[]
  starterItems: StarterBuild[]
  runeStats: Record<number, RuneStat[]>
  statPerks: {
    offense: StatPerkStat[]
    flex: StatPerkStat[]
    defense: StatPerkStat[]
  }
  abilityLevelingStats: AbilityLevelingStat[]
  summonerSpellStats: SummonerSpellStat[]
  ddragonVersion: string
  totalGames: number
  allBuildData: PreCalculatedCombo[]
  championWinrate: number
}
