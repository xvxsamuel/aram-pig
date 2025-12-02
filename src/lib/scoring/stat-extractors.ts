// Stat extractors - modular helpers for extracting match stats
// Each function extracts ONE piece of data from a match participant
// Functions are 5-20 lines, pure, and testable

import type { MatchStats, BasicMatchStats } from './types'
import { BOOT_IDS, normalizeBootId } from './types'
import itemsData from '@/data/items.json'

const items = itemsData as Record<string, { itemType?: string }>

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an item is a completed item (legendary, boots, or mythic)
 */
export function isCompletedItem(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots' || type === 'mythic'
}

/**
 * Check if an item is a legendary item or completed boots
 */
export function isLegendaryOrBoots(itemId: number): boolean {
  const item = items[String(itemId)]
  if (!item) return false
  const type = item.itemType
  // tier 1 boots (1001) are not completed, but finished boots are
  if (BOOT_IDS.has(itemId) && itemId !== 1001) return true
  return type === 'legendary' || type === 'mythic'
}

/**
 * Extract skill max order abbreviation from ability order string
 * e.g., "Q W Q E Q R Q W Q W R W W E E R E E" -> "qwe" (Q>W>E)
 */
export function extractSkillOrderAbbreviation(abilityOrder: string | null): string | null {
  if (!abilityOrder || abilityOrder.length === 0) return null

  const abilities = abilityOrder.split(' ')
  const counts: Record<string, number> = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []

  for (const ability of abilities) {
    if (ability in counts) {
      counts[ability]++
      // skill is maxed at 5 points (except R)
      if (ability !== 'R' && counts[ability] === 5) {
        maxOrder.push(ability.toLowerCase())
      }
    }
  }

  const result = maxOrder.join('')

  // need at least 2 skills maxed for a meaningful order
  if (result.length === 1) return null

  // if only 2 skills maxed, infer the third
  if (result.length === 2) {
    const allAbilities = ['q', 'w', 'e']
    const missing = allAbilities.find(a => !result.includes(a))
    return missing ? result + missing : result
  }

  return result
}

// ============================================================================
// CORE KEY EXTRACTION
// ============================================================================

/**
 * Extract and normalize core key from build order
 * Core = first 3 completed items (legendary/boots), boots normalized to 99999
 * Returns sorted underscore-separated key (e.g., "3078_6333_99999")
 */
export function extractCoreKey(buildOrder: string | null, finalItems?: number[]): string | null {
  if (!buildOrder && (!finalItems || finalItems.length < 3)) return null

  const coreItems: number[] = []

  if (buildOrder) {
    // parse build order to get purchase sequence
    const buildOrderItems = buildOrder
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id) && id > 0)

    // find first 3 completed items (legendary or finished boots)
    for (const itemId of buildOrderItems) {
      if (coreItems.length >= 3) break
      if (isCompletedItem(itemId) && !coreItems.includes(itemId)) {
        coreItems.push(itemId)
      }
    }
  }

  // fallback to final items if build order insufficient
  if (coreItems.length < 3 && finalItems) {
    const completedFinalItems = finalItems.filter(id => id > 0 && isCompletedItem(id))
    for (const itemId of completedFinalItems) {
      if (coreItems.length >= 3) break
      if (!coreItems.includes(itemId)) {
        coreItems.push(itemId)
      }
    }
  }

  if (coreItems.length !== 3) return null

  // normalize boots to 99999 and sort for consistent key
  const normalized = coreItems.map(normalizeBootId)
  const uniqueSorted = [...new Set(normalized)].sort((a, b) => a - b)

  // must have 3 unique items after normalization
  if (uniqueSorted.length !== 3) return null

  return uniqueSorted.join('_')
}

/**
 * Extract first 3 completed items from build order (not normalized)
 * Returns the actual item IDs in purchase order
 */
export function extractCoreItems(buildOrder: string | null, finalItems?: number[]): number[] {
  const coreItems: number[] = []

  if (buildOrder) {
    const buildOrderItems = buildOrder
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id) && id > 0)

    for (const itemId of buildOrderItems) {
      if (coreItems.length >= 3) break
      if (isCompletedItem(itemId) && !coreItems.includes(itemId)) {
        coreItems.push(itemId)
      }
    }
  }

  // fallback to final items if needed
  if (coreItems.length < 3 && finalItems) {
    const completedFinalItems = finalItems.filter(id => id > 0 && isCompletedItem(id))
    for (const itemId of completedFinalItems) {
      if (coreItems.length >= 3) break
      if (!coreItems.includes(itemId)) {
        coreItems.push(itemId)
      }
    }
  }

  return coreItems.slice(0, 3)
}

// ============================================================================
// PARTICIPANT DATA EXTRACTORS
// ============================================================================

/**
 * Participant data structure from Riot API or match_data JSONB
 */
export interface ParticipantInput {
  kills: number
  deaths: number
  assists: number
  champLevel?: number
  teamId: number
  totalDamageDealtToChampions?: number
  totalDamageDealt?: number
  totalHealsOnTeammates?: number
  totalDamageShieldedOnTeammates?: number
  timeCCingOthers?: number
  goldEarned?: number
  totalMinionsKilled?: number
  gameEndedInEarlySurrender?: boolean
  item0?: number
  item1?: number
  item2?: number
  item3?: number
  item4?: number
  item5?: number
  summoner1Id?: number
  summoner2Id?: number
  perks?: {
    styles?: Array<{
      style?: number
      selections?: Array<{ perk?: number }>
    }>
    statPerks?: {
      offense?: number
      flex?: number
      defense?: number
    }
  }
}

/**
 * Extract KDA stats from participant
 */
export function extractKDA(participant: ParticipantInput): MatchStats['kda'] {
  return {
    kills: participant.kills || 0,
    deaths: participant.deaths || 0,
    assists: participant.assists || 0,
  }
}

/**
 * Extract per-minute efficiency stats from participant
 */
export function extractEfficiency(
  participant: ParticipantInput,
  gameDuration: number
): MatchStats['efficiency'] {
  const gameDurationMinutes = gameDuration / 60
  if (gameDurationMinutes <= 0) {
    return {
      csPerMin: 0,
      goldPerMin: 0,
      damageToChampionsPerMin: 0,
      totalDamagePerMin: 0,
      healingShieldingPerMin: 0,
      ccTimePerMin: 0,
    }
  }

  const healing = participant.totalHealsOnTeammates || 0
  const shielding = participant.totalDamageShieldedOnTeammates || 0

  return {
    csPerMin: (participant.totalMinionsKilled || 0) / gameDurationMinutes,
    goldPerMin: (participant.goldEarned || 0) / gameDurationMinutes,
    damageToChampionsPerMin: (participant.totalDamageDealtToChampions || 0) / gameDurationMinutes,
    totalDamagePerMin: (participant.totalDamageDealt || 0) / gameDurationMinutes,
    healingShieldingPerMin: (healing + shielding) / gameDurationMinutes,
    ccTimePerMin: (participant.timeCCingOthers || 0) / gameDurationMinutes,
  }
}

/**
 * Extract final items from participant
 */
export function extractFinalItems(participant: ParticipantInput): number[] {
  return [
    participant.item0 || 0,
    participant.item1 || 0,
    participant.item2 || 0,
    participant.item3 || 0,
    participant.item4 || 0,
    participant.item5 || 0,
  ].filter(id => id > 0)
}

/**
 * Extract item build metrics from match data
 */
export function extractBuildMetrics(
  buildOrder: string | null,
  firstBuy: string | null,
  finalItems: number[]
): MatchStats['items'] {
  return {
    buildOrder,
    firstBuy,
    coreKey: extractCoreKey(buildOrder, finalItems),
    finalItems,
  }
}

/**
 * Extract rune selections from participant
 */
export function extractRunes(participant: ParticipantInput): MatchStats['runes'] {
  const perks = participant.perks
  const primaryStyle = perks?.styles?.[0]
  const secondaryStyle = perks?.styles?.[1]

  return {
    keystoneId: primaryStyle?.selections?.[0]?.perk || 0,
    primaryTreeId: primaryStyle?.style || 0,
    secondaryTreeId: secondaryStyle?.style || 0,
    primaryPerks: [
      primaryStyle?.selections?.[0]?.perk || 0,
      primaryStyle?.selections?.[1]?.perk || 0,
      primaryStyle?.selections?.[2]?.perk || 0,
      primaryStyle?.selections?.[3]?.perk || 0,
    ],
    secondaryPerks: [
      secondaryStyle?.selections?.[0]?.perk || 0,
      secondaryStyle?.selections?.[1]?.perk || 0,
    ],
    statPerks: [
      perks?.statPerks?.offense || 0,
      perks?.statPerks?.flex || 0,
      perks?.statPerks?.defense || 0,
    ],
  }
}

/**
 * Extract summoner spells from participant
 */
export function extractSpells(participant: ParticipantInput): MatchStats['spells'] {
  return [participant.summoner1Id || 0, participant.summoner2Id || 0]
}

// ============================================================================
// FULL MATCH STATS EXTRACTION
// ============================================================================

/**
 * Extract all match stats from a participant in one call
 * This is the main orchestrator function
 */
export function extractAllMatchStats(
  participant: ParticipantInput,
  gameDuration: number,
  abilityOrder: string | null = null,
  buildOrder: string | null = null,
  firstBuy: string | null = null
): MatchStats {
  const finalItems = extractFinalItems(participant)

  return {
    kda: extractKDA(participant),
    efficiency: extractEfficiency(participant, gameDuration),
    items: extractBuildMetrics(buildOrder, firstBuy, finalItems),
    abilityOrder,
    skillOrder: extractSkillOrderAbbreviation(abilityOrder),
    runes: extractRunes(participant),
    spells: extractSpells(participant),
    gameDuration,
    teamId: participant.teamId,
    isRemake: participant.gameEndedInEarlySurrender || false,
  }
}

/**
 * Extract basic match stats (without timeline data)
 * Use when timeline is not available
 */
export function extractBasicMatchStats(
  participant: ParticipantInput,
  gameDuration: number
): BasicMatchStats {
  const finalItems = extractFinalItems(participant)

  return {
    kda: extractKDA(participant),
    efficiency: extractEfficiency(participant, gameDuration),
    finalItems,
    runes: extractRunes(participant),
    spells: extractSpells(participant),
    gameDuration,
    teamId: participant.teamId,
    isRemake: participant.gameEndedInEarlySurrender || false,
  }
}

// ============================================================================
// MATCH DATA JSONB EXTRACTORS
// ============================================================================

/**
 * Match data structure from summoner_matches.match_data JSONB
 */
export interface MatchDataJsonb {
  kills: number
  deaths: number
  assists: number
  level: number
  teamId: number
  isRemake: boolean
  stats: {
    damage: number
    gold: number
    cs: number
    doubleKills: number
    tripleKills: number
    quadraKills: number
    pentaKills: number
    totalDamageDealt: number
    timeCCingOthers: number
    totalHealsOnTeammates: number
    totalDamageShieldedOnTeammates: number
  }
  items: number[]
  spells: [number, number]
  runes: {
    primary: {
      style: number
      perks: number[]
    }
    secondary: {
      style: number
      perks: number[]
    }
    statPerks: number[]
  }
  pigScore: number | null
  pigScoreBreakdown: unknown | null
  abilityOrder: string | null
  buildOrder: string | null
  firstBuy: string | null
  itemPurchases: unknown[] | null
}

/**
 * Extract match stats from stored match_data JSONB
 * Use this when reading from summoner_matches table
 */
export function extractMatchStatsFromJsonb(
  matchData: MatchDataJsonb,
  gameDuration: number
): MatchStats {
  const gameDurationMinutes = gameDuration / 60

  return {
    kda: {
      kills: matchData.kills,
      deaths: matchData.deaths,
      assists: matchData.assists,
    },
    efficiency: {
      csPerMin: gameDurationMinutes > 0 ? matchData.stats.cs / gameDurationMinutes : 0,
      goldPerMin: gameDurationMinutes > 0 ? matchData.stats.gold / gameDurationMinutes : 0,
      damageToChampionsPerMin: gameDurationMinutes > 0 ? matchData.stats.damage / gameDurationMinutes : 0,
      totalDamagePerMin: gameDurationMinutes > 0 ? matchData.stats.totalDamageDealt / gameDurationMinutes : 0,
      healingShieldingPerMin: gameDurationMinutes > 0 
        ? (matchData.stats.totalHealsOnTeammates + matchData.stats.totalDamageShieldedOnTeammates) / gameDurationMinutes 
        : 0,
      ccTimePerMin: gameDurationMinutes > 0 ? matchData.stats.timeCCingOthers / gameDurationMinutes : 0,
    },
    items: {
      buildOrder: matchData.buildOrder,
      firstBuy: matchData.firstBuy,
      coreKey: extractCoreKey(matchData.buildOrder, matchData.items),
      finalItems: matchData.items,
    },
    abilityOrder: matchData.abilityOrder,
    skillOrder: extractSkillOrderAbbreviation(matchData.abilityOrder),
    runes: {
      keystoneId: matchData.runes.primary.perks[0] || 0,
      primaryTreeId: matchData.runes.primary.style,
      secondaryTreeId: matchData.runes.secondary.style,
      primaryPerks: matchData.runes.primary.perks,
      secondaryPerks: matchData.runes.secondary.perks,
      statPerks: matchData.runes.statPerks,
    },
    spells: matchData.spells,
    gameDuration,
    teamId: matchData.teamId,
    isRemake: matchData.isRemake,
  }
}
