// ============================================================================
// STATS AGGREGATOR - TypeScript-side aggregation for champion stats
// ============================================================================
// This module aggregates participant stats by champion+patch in memory,
// reducing the number of DB operations from N (per participant) to M (per unique champion+patch).
// For 1000 participants across ~80 champions, this reduces DB calls by ~90%.

// Boot item IDs that should be normalized to 99999 for combo keys
const BOOT_IDS = new Set([1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158])

function normalizeBootId(itemId: number): number {
  return BOOT_IDS.has(itemId) ? 99999 : itemId
}

// Create combo key from first 3 items (normalized, sorted, deduped)
function createComboKey(items: number[]): string | null {
  const first3 = items.filter(id => id > 0).slice(0, 3)
  if (first3.length !== 3) return null
  
  const normalized = first3.map(normalizeBootId)
  const uniqueSorted = [...new Set(normalized)].sort((a, b) => a - b)
  
  // need exactly 3 unique items for a valid combo
  if (uniqueSorted.length !== 3) return null
  
  return uniqueSorted.join('_')
}

// Create spell key (smaller ID first)
function createSpellKey(spell1: number, spell2: number): string {
  return `${Math.min(spell1, spell2)}_${Math.max(spell1, spell2)}`
}

// ============================================================================
// TYPES
// ============================================================================

// Stats for a single game entry (games=1, wins=0|1)
interface GameStats {
  games: number
  wins: number
}

// Champion stats data structure - mirrors the JSONB structure in DB
interface ChampionStatsData {
  games: number
  wins: number
  championStats: {
    sumDamageToChampions: number
    sumTotalDamage: number
    sumHealing: number
    sumShielding: number
    sumCCTime: number
    sumGameDuration: number
    sumDeaths: number
  }
  items: Record<string, Record<string, GameStats>> // position -> itemId -> stats
  runes: {
    primary: Record<string, GameStats>
    secondary: Record<string, GameStats>
    tertiary: {
      offense: Record<string, GameStats>
      flex: Record<string, GameStats>
      defense: Record<string, GameStats>
    }
    tree: {
      primary: Record<string, GameStats>
      secondary: Record<string, GameStats>
    }
  }
  spells: Record<string, GameStats>
  starting: Record<string, GameStats>
  skills: Record<string, GameStats>
  core: Record<string, {
    games: number
    wins: number
    items: Record<string, Record<string, GameStats>> // itemId -> position -> stats
    runes: {
      primary: Record<string, GameStats>
      secondary: Record<string, GameStats>
      tertiary: {
        offense: Record<string, GameStats>
        flex: Record<string, GameStats>
        defense: Record<string, GameStats>
      }
    }
    spells: Record<string, GameStats>
    starting: Record<string, GameStats>
  }>
}

// Input: raw participant stats (from storeMatchData)
export interface ParticipantStatsInput {
  champion_name: string
  patch: string
  win: boolean
  items: number[]
  first_buy: string | null
  keystone_id: number
  rune1: number
  rune2: number
  rune3: number
  rune4: number
  rune5: number
  rune_tree_primary: number
  rune_tree_secondary: number
  stat_perk0: number
  stat_perk1: number
  stat_perk2: number
  spell1_id: number
  spell2_id: number
  skill_order: string | null
  damage_to_champions: number
  total_damage: number
  healing: number
  shielding: number
  cc_time: number
  game_duration: number
  deaths: number
}

// ============================================================================
// AGGREGATOR CLASS
// ============================================================================

export class StatsAggregator {
  // Map of "champion_name|patch" -> aggregated stats
  private aggregated = new Map<string, ChampionStatsData>()
  private participantCount = 0
  
  /** Get number of unique champion+patch combinations */
  getUniqueCount(): number {
    return this.aggregated.size
  }
  
  // alias for getUniqueCount
  getChampionPatchCount(): number {
    return this.getUniqueCount()
  }
  
  /** Get total number of participants added */
  getParticipantCount(): number {
    return this.participantCount
  }
  
  /** Get total number of games aggregated (same as participant count) */
  getTotalGames(): number {
    return this.participantCount
  }
  
  /** Add a participant's stats to the aggregator */
  add(input: ParticipantStatsInput): void {
    this.participantCount++
    const key = `${input.champion_name}|${input.patch}`
    let stats = this.aggregated.get(key)
    
    if (!stats) {
      stats = this.createEmptyStats()
      this.aggregated.set(key, stats)
    }
    
    const win = input.win ? 1 : 0
    
    // update top-level counters
    stats.games += 1
    stats.wins += win
    
    // update champion stats sums
    stats.championStats.sumDamageToChampions += input.damage_to_champions
    stats.championStats.sumTotalDamage += input.total_damage
    stats.championStats.sumHealing += input.healing
    stats.championStats.sumShielding += input.shielding
    stats.championStats.sumCCTime += input.cc_time
    stats.championStats.sumGameDuration += input.game_duration
    stats.championStats.sumDeaths += input.deaths
    
    // update items by position
    for (let i = 0; i < input.items.length && i < 6; i++) {
      const itemId = input.items[i]
      if (itemId > 0) {
        const pos = (i + 1).toString()
        const itemKey = itemId.toString()
        if (!stats.items[pos]) stats.items[pos] = {}
        if (!stats.items[pos][itemKey]) stats.items[pos][itemKey] = { games: 0, wins: 0 }
        stats.items[pos][itemKey].games += 1
        stats.items[pos][itemKey].wins += win
      }
    }
    
    // update runes (primary)
    const primaryRunes = [input.keystone_id, input.rune1, input.rune2, input.rune3]
    for (const runeId of primaryRunes) {
      if (runeId > 0) {
        const runeKey = runeId.toString()
        if (!stats.runes.primary[runeKey]) stats.runes.primary[runeKey] = { games: 0, wins: 0 }
        stats.runes.primary[runeKey].games += 1
        stats.runes.primary[runeKey].wins += win
      }
    }
    
    // update runes (secondary)
    const secondaryRunes = [input.rune4, input.rune5]
    for (const runeId of secondaryRunes) {
      if (runeId > 0) {
        const runeKey = runeId.toString()
        if (!stats.runes.secondary[runeKey]) stats.runes.secondary[runeKey] = { games: 0, wins: 0 }
        stats.runes.secondary[runeKey].games += 1
        stats.runes.secondary[runeKey].wins += win
      }
    }
    
    // update tertiary runes (stat perks)
    if (input.stat_perk0 > 0) {
      const key = input.stat_perk0.toString()
      if (!stats.runes.tertiary.offense[key]) stats.runes.tertiary.offense[key] = { games: 0, wins: 0 }
      stats.runes.tertiary.offense[key].games += 1
      stats.runes.tertiary.offense[key].wins += win
    }
    if (input.stat_perk1 > 0) {
      const key = input.stat_perk1.toString()
      if (!stats.runes.tertiary.flex[key]) stats.runes.tertiary.flex[key] = { games: 0, wins: 0 }
      stats.runes.tertiary.flex[key].games += 1
      stats.runes.tertiary.flex[key].wins += win
    }
    if (input.stat_perk2 > 0) {
      const key = input.stat_perk2.toString()
      if (!stats.runes.tertiary.defense[key]) stats.runes.tertiary.defense[key] = { games: 0, wins: 0 }
      stats.runes.tertiary.defense[key].games += 1
      stats.runes.tertiary.defense[key].wins += win
    }
    
    // update rune trees
    if (input.rune_tree_primary > 0) {
      const key = input.rune_tree_primary.toString()
      if (!stats.runes.tree.primary[key]) stats.runes.tree.primary[key] = { games: 0, wins: 0 }
      stats.runes.tree.primary[key].games += 1
      stats.runes.tree.primary[key].wins += win
    }
    if (input.rune_tree_secondary > 0) {
      const key = input.rune_tree_secondary.toString()
      if (!stats.runes.tree.secondary[key]) stats.runes.tree.secondary[key] = { games: 0, wins: 0 }
      stats.runes.tree.secondary[key].games += 1
      stats.runes.tree.secondary[key].wins += win
    }
    
    // update spells
    const spellKey = createSpellKey(input.spell1_id, input.spell2_id)
    if (!stats.spells[spellKey]) stats.spells[spellKey] = { games: 0, wins: 0 }
    stats.spells[spellKey].games += 1
    stats.spells[spellKey].wins += win
    
    // update starting items
    if (input.first_buy && input.first_buy !== '') {
      if (!stats.starting[input.first_buy]) stats.starting[input.first_buy] = { games: 0, wins: 0 }
      stats.starting[input.first_buy].games += 1
      stats.starting[input.first_buy].wins += win
    }
    
    // update skill order
    if (input.skill_order && input.skill_order !== '') {
      if (!stats.skills[input.skill_order]) stats.skills[input.skill_order] = { games: 0, wins: 0 }
      stats.skills[input.skill_order].games += 1
      stats.skills[input.skill_order].wins += win
    }
    
    // update core combinations
    const comboKey = createComboKey(input.items)
    if (comboKey) {
      if (!stats.core[comboKey]) {
        stats.core[comboKey] = {
          games: 0,
          wins: 0,
          items: {},
          runes: {
            primary: {},
            secondary: {},
            tertiary: { offense: {}, flex: {}, defense: {} }
          },
          spells: {},
          starting: {}
        }
      }
      const combo = stats.core[comboKey]
      combo.games += 1
      combo.wins += win
      
      // combo items by position
      for (let i = 0; i < input.items.length && i < 6; i++) {
        const itemId = input.items[i]
        if (itemId > 0) {
          const itemKey = itemId.toString()
          const pos = (i + 1).toString()
          if (!combo.items[itemKey]) combo.items[itemKey] = {}
          if (!combo.items[itemKey][pos]) combo.items[itemKey][pos] = { games: 0, wins: 0 }
          combo.items[itemKey][pos].games += 1
          combo.items[itemKey][pos].wins += win
        }
      }
      
      // combo runes (primary)
      for (const runeId of primaryRunes) {
        if (runeId > 0) {
          const runeKey = runeId.toString()
          if (!combo.runes.primary[runeKey]) combo.runes.primary[runeKey] = { games: 0, wins: 0 }
          combo.runes.primary[runeKey].games += 1
          combo.runes.primary[runeKey].wins += win
        }
      }
      
      // combo runes (secondary)
      for (const runeId of secondaryRunes) {
        if (runeId > 0) {
          const runeKey = runeId.toString()
          if (!combo.runes.secondary[runeKey]) combo.runes.secondary[runeKey] = { games: 0, wins: 0 }
          combo.runes.secondary[runeKey].games += 1
          combo.runes.secondary[runeKey].wins += win
        }
      }
      
      // combo tertiary runes
      if (input.stat_perk0 > 0) {
        const key = input.stat_perk0.toString()
        if (!combo.runes.tertiary.offense[key]) combo.runes.tertiary.offense[key] = { games: 0, wins: 0 }
        combo.runes.tertiary.offense[key].games += 1
        combo.runes.tertiary.offense[key].wins += win
      }
      if (input.stat_perk1 > 0) {
        const key = input.stat_perk1.toString()
        if (!combo.runes.tertiary.flex[key]) combo.runes.tertiary.flex[key] = { games: 0, wins: 0 }
        combo.runes.tertiary.flex[key].games += 1
        combo.runes.tertiary.flex[key].wins += win
      }
      if (input.stat_perk2 > 0) {
        const key = input.stat_perk2.toString()
        if (!combo.runes.tertiary.defense[key]) combo.runes.tertiary.defense[key] = { games: 0, wins: 0 }
        combo.runes.tertiary.defense[key].games += 1
        combo.runes.tertiary.defense[key].wins += win
      }
      
      // combo spells
      if (!combo.spells[spellKey]) combo.spells[spellKey] = { games: 0, wins: 0 }
      combo.spells[spellKey].games += 1
      combo.spells[spellKey].wins += win
      
      // combo starting items
      if (input.first_buy && input.first_buy !== '') {
        if (!combo.starting[input.first_buy]) combo.starting[input.first_buy] = { games: 0, wins: 0 }
        combo.starting[input.first_buy].games += 1
        combo.starting[input.first_buy].wins += win
      }
    }
  }
  
  /** Get all aggregated stats for flushing to DB */
  getAggregatedStats(): Array<{ champion_name: string; patch: string; data: ChampionStatsData }> {
    const result: Array<{ champion_name: string; patch: string; data: ChampionStatsData }> = []
    
    for (const [key, data] of this.aggregated) {
      const [champion_name, patch] = key.split('|')
      result.push({ champion_name, patch, data })
    }
    
    return result
  }
  
  /** Clear all aggregated data */
  clear(): void {
    this.aggregated.clear()
    this.participantCount = 0
  }
  
  private createEmptyStats(): ChampionStatsData {
    return {
      games: 0,
      wins: 0,
      championStats: {
        sumDamageToChampions: 0,
        sumTotalDamage: 0,
        sumHealing: 0,
        sumShielding: 0,
        sumCCTime: 0,
        sumGameDuration: 0,
        sumDeaths: 0
      },
      items: { '1': {}, '2': {}, '3': {}, '4': {}, '5': {}, '6': {} },
      runes: {
        primary: {},
        secondary: {},
        tertiary: { offense: {}, flex: {}, defense: {} },
        tree: { primary: {}, secondary: {} }
      },
      spells: {},
      starting: {},
      skills: {},
      core: {}
    }
  }
}

// ============================================================================
// MODULE-LEVEL INSTANCE
// ============================================================================

// Global aggregator instance for use across the application
export const statsAggregator = new StatsAggregator()
