// Stats aggregator - TypeScript-side aggregation for champion stats
// Reduces DB operations from N (per participant) to M (per unique champion+patch)

// tier 1 boots - not completed (excluded from cores)
const TIER1_BOOT_ID = 1001

// tier 2 boots - completed boots (normalized to 99999 for core grouping)
const TIER2_BOOT_IDS = new Set([3006, 3009, 3020, 3047, 3111, 3117, 3158])

// normalized boot ID for core key grouping
const NORMALIZED_BOOT_ID = 99999

// check if item is a completed item (legendary or tier 2 boots)
// tier 1 boots (1001) are NOT completed items for core purposes
function isCompletedItemForCore(itemId: number): boolean {
  // tier 1 boots are not completed items
  if (itemId === TIER1_BOOT_ID) return false
  // tier 2 boots are completed items
  if (TIER2_BOOT_IDS.has(itemId)) return true
  // for non-boots, we need to check if it's a legendary
  // items >= 3000 and not component items are generally legendaries
  // This is a simplified check - the full check uses items.json
  return itemId >= 3000
}

function createComboKey(items: number[]): string | null {
  // core = first 3 completed items (legendary/boots) from build order
  // boots are normalized to 99999 for grouping
  const coreItems: number[] = []
  
  for (const itemId of items) {
    if (coreItems.length >= 3) break
    if (itemId <= 0) continue
    if (!isCompletedItemForCore(itemId)) continue
    
    // normalize boots to 99999
    const normalizedId = TIER2_BOOT_IDS.has(itemId) ? NORMALIZED_BOOT_ID : itemId
    if (!coreItems.includes(normalizedId)) {
      coreItems.push(normalizedId)
    }
  }
  
  if (coreItems.length !== 3) return null

  const uniqueSorted = [...new Set(coreItems)].sort((a, b) => a - b)

  if (uniqueSorted.length !== 3) return null

  return uniqueSorted.join('_')
}

function createSpellKey(spell1: number, spell2: number): string {
  return `${Math.min(spell1, spell2)}_${Math.max(spell1, spell2)}`
}

// ============================================================================
// TYPES
// ============================================================================

interface GameStats {
  games: number
  wins: number
}

// Welford's online algorithm state for computing mean and variance
export interface WelfordState {
  n: number // count
  mean: number // running mean
  m2: number // sum of squared deviations (for variance calculation)
}

// Calculate variance from Welford state (population variance)
export function getVariance(state: WelfordState): number {
  if (state.n < 2) return 0
  return state.m2 / state.n
}

// Calculate standard deviation from Welford state
export function getStdDev(state: WelfordState): number {
  return Math.sqrt(getVariance(state))
}

// Calculate z-score (how many standard deviations from mean)
export function getZScore(value: number, state: WelfordState): number {
  const stdDev = getStdDev(state)
  if (stdDev === 0) return 0
  return (value - state.mean) / stdDev
}

interface ChampionStatsData {
  games: number
  wins: number
  championStats: {
    // Legacy sum fields (kept for backwards compatibility)
    sumDamageToChampions: number
    sumTotalDamage: number
    sumHealing: number
    sumShielding: number
    sumCCTime: number
    sumGameDuration: number
    sumDeaths: number
    // Welford stats for per-minute values (for stddev calculation)
    welford: {
      damageToChampionsPerMin: WelfordState
      totalDamagePerMin: WelfordState
      healingShieldingPerMin: WelfordState
      ccTimePerMin: WelfordState
      deathsPerMin: WelfordState
    }
  }
  items: Record<string, Record<string, GameStats>>
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
  core: Record<
    string,
    {
      games: number
      wins: number
      items: Record<string, Record<string, GameStats>>
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
    }
  >
}

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
  private aggregated = new Map<string, ChampionStatsData>()
  private participantCount = 0

  getUniqueCount(): number {
    return this.aggregated.size
  }

  getChampionPatchCount(): number {
    return this.getUniqueCount()
  }

  getParticipantCount(): number {
    return this.participantCount
  }

  getTotalGames(): number {
    return this.participantCount
  }

  add(input: ParticipantStatsInput): void {
    this.participantCount++
    const key = `${input.champion_name}|${input.patch}`
    let stats = this.aggregated.get(key)

    if (!stats) {
      stats = this.createEmptyStats()
      this.aggregated.set(key, stats)
    }

    const win = input.win ? 1 : 0

    stats.games += 1
    stats.wins += win

    stats.championStats.sumDamageToChampions += input.damage_to_champions
    stats.championStats.sumTotalDamage += input.total_damage
    stats.championStats.sumHealing += input.healing
    stats.championStats.sumShielding += input.shielding
    stats.championStats.sumCCTime += input.cc_time
    stats.championStats.sumGameDuration += input.game_duration
    stats.championStats.sumDeaths += input.deaths

    // Welford's algorithm for per-minute stats variance tracking
    const gameDurationMinutes = input.game_duration / 60
    if (gameDurationMinutes > 0) {
      const perMinStats = {
        damageToChampionsPerMin: input.damage_to_champions / gameDurationMinutes,
        totalDamagePerMin: input.total_damage / gameDurationMinutes,
        healingShieldingPerMin: (input.healing + input.shielding) / gameDurationMinutes,
        ccTimePerMin: input.cc_time / gameDurationMinutes,
        deathsPerMin: input.deaths / gameDurationMinutes,
      }

      // Update each Welford state
      this.updateWelford(stats.championStats.welford.damageToChampionsPerMin, perMinStats.damageToChampionsPerMin)
      this.updateWelford(stats.championStats.welford.totalDamagePerMin, perMinStats.totalDamagePerMin)
      this.updateWelford(stats.championStats.welford.healingShieldingPerMin, perMinStats.healingShieldingPerMin)
      this.updateWelford(stats.championStats.welford.ccTimePerMin, perMinStats.ccTimePerMin)
      this.updateWelford(stats.championStats.welford.deathsPerMin, perMinStats.deathsPerMin)
    }

    // items by position
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

    // runes (primary)
    const primaryRunes = [input.keystone_id, input.rune1, input.rune2, input.rune3]
    for (const runeId of primaryRunes) {
      if (runeId > 0) {
        const runeKey = runeId.toString()
        if (!stats.runes.primary[runeKey]) stats.runes.primary[runeKey] = { games: 0, wins: 0 }
        stats.runes.primary[runeKey].games += 1
        stats.runes.primary[runeKey].wins += win
      }
    }

    // runes (secondary)
    const secondaryRunes = [input.rune4, input.rune5]
    for (const runeId of secondaryRunes) {
      if (runeId > 0) {
        const runeKey = runeId.toString()
        if (!stats.runes.secondary[runeKey]) stats.runes.secondary[runeKey] = { games: 0, wins: 0 }
        stats.runes.secondary[runeKey].games += 1
        stats.runes.secondary[runeKey].wins += win
      }
    }

    // tertiary runes (stat perks)
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

    // rune trees
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

    // spells
    const spellKey = createSpellKey(input.spell1_id, input.spell2_id)
    if (!stats.spells[spellKey]) stats.spells[spellKey] = { games: 0, wins: 0 }
    stats.spells[spellKey].games += 1
    stats.spells[spellKey].wins += win

    // starting items
    if (input.first_buy && input.first_buy !== '') {
      if (!stats.starting[input.first_buy]) stats.starting[input.first_buy] = { games: 0, wins: 0 }
      stats.starting[input.first_buy].games += 1
      stats.starting[input.first_buy].wins += win
    }

    // skill order
    if (input.skill_order && input.skill_order !== '') {
      if (!stats.skills[input.skill_order]) stats.skills[input.skill_order] = { games: 0, wins: 0 }
      stats.skills[input.skill_order].games += 1
      stats.skills[input.skill_order].wins += win
    }

    // core combinations
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
            tertiary: { offense: {}, flex: {}, defense: {} },
          },
          spells: {},
          starting: {},
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

  getAggregatedStats(): Array<{ champion_name: string; patch: string; data: ChampionStatsData }> {
    const result: Array<{ champion_name: string; patch: string; data: ChampionStatsData }> = []

    for (const [key, data] of this.aggregated) {
      const [champion_name, patch] = key.split('|')
      result.push({ champion_name, patch, data })
    }

    return result
  }

  clear(): void {
    this.aggregated.clear()
    this.participantCount = 0
  }

  // Welford's online algorithm: update running mean and M2 (sum of squared deviations)
  private updateWelford(state: WelfordState, newValue: number): void {
    state.n += 1
    const delta = newValue - state.mean
    state.mean += delta / state.n
    const delta2 = newValue - state.mean
    state.m2 += delta * delta2
  }

  // Helper to create empty Welford state
  private createEmptyWelford(): WelfordState {
    return { n: 0, mean: 0, m2: 0 }
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
        sumDeaths: 0,
        welford: {
          damageToChampionsPerMin: this.createEmptyWelford(),
          totalDamagePerMin: this.createEmptyWelford(),
          healingShieldingPerMin: this.createEmptyWelford(),
          ccTimePerMin: this.createEmptyWelford(),
          deathsPerMin: this.createEmptyWelford(),
        },
      },
      items: { '1': {}, '2': {}, '3': {}, '4': {}, '5': {}, '6': {} },
      runes: {
        primary: {},
        secondary: {},
        tertiary: { offense: {}, flex: {}, defense: {} },
        tree: { primary: {}, secondary: {} },
      },
      spells: {},
      starting: {},
      skills: {},
      core: {},
    }
  }
}

export const statsAggregator = new StatsAggregator()
