/**
 * Participant processing utilities for match storage
 * Extracts common logic for processing match participants
 */

import { calculatePigScoreWithBreakdownCached, prefetchChampionStats, type ChampionStatsCache } from '@/lib/scoring'
import {
  extractAbilityOrder,
  extractBuildOrder,
  extractFirstBuy,
  formatBuildOrder,
  formatFirstBuy,
  extractItemTimeline,
  type ItemTimelineEvent,
} from '@/lib/game'
import { getKillDeathSummary } from '@/lib/game/kill-timeline'
import itemsData from '@/data/items.json'

// helper to check if item is a finished item (legendary or boots)
export function isFinishedItem(itemId: number): boolean {
  const item = (itemsData as Record<string, any>)[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
}

// helper to extract skill max order abbreviation (e.g., "qwe" for Q>W>E)
export function extractSkillOrderAbbreviation(abilityOrder: string): string {
  if (!abilityOrder || abilityOrder.length === 0) return ''

  const abilities = abilityOrder.split(' ')
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []

  for (const ability of abilities) {
    if (ability in counts) {
      counts[ability as keyof typeof counts]++
      if (ability !== 'R' && counts[ability as keyof typeof counts] === 5) {
        maxOrder.push(ability.toLowerCase())
      }
    }
  }

  const result = maxOrder.join('')
  if (result.length === 1) return ''
  if (result.length === 2) {
    const abilitiesList = ['q', 'w', 'e']
    const missing = abilitiesList.find(a => !result.includes(a))
    return missing ? result + missing : result
  }
  return result
}

// extract runes from participant
export function extractRunes(p: any) {
  return {
    primary: {
      style: p.perks?.styles?.[0]?.style || 0,
      perks: p.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0, 0, 0, 0],
    },
    secondary: {
      style: p.perks?.styles?.[1]?.style || 0,
      perks: p.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0, 0],
    },
    statPerks: [
      p.perks?.statPerks?.offense || 0,
      p.perks?.statPerks?.flex || 0,
      p.perks?.statPerks?.defense || 0,
    ],
  }
}

// build match_data object for a participant
export function buildMatchData(
  p: any,
  pigScore: number | null,
  pigScoreBreakdown: any,
  abilityOrder: string | null,
  buildOrderStr: string | null,
  firstBuyStr: string | null,
  itemPurchases: ItemTimelineEvent[] | null,
  killDeathTimeline?: any
) {
  return {
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    level: p.champLevel || 0,
    teamId: p.teamId || 0,
    isRemake: p.gameEndedInEarlySurrender || false,
    stats: {
      damage: p.totalDamageDealtToChampions || 0,
      gold: p.goldEarned || 0,
      cs: p.totalMinionsKilled || 0,
      doubleKills: p.doubleKills || 0,
      tripleKills: p.tripleKills || 0,
      quadraKills: p.quadraKills || 0,
      pentaKills: p.pentaKills || 0,
      totalDamageDealt: p.totalDamageDealt || 0,
      timeCCingOthers: p.timeCCingOthers || 0,
      totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
      totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0,
    },
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id: number) => id > 0),
    spells: [p.summoner1Id || 0, p.summoner2Id || 0],
    runes: extractRunes(p),
    pigScore,
    pigScoreBreakdown,
    abilityOrder,
    buildOrder: buildOrderStr,
    firstBuy: firstBuyStr,
    itemPurchases,
    killDeathTimeline,
  }
}

interface ProcessParticipantsOptions {
  match: any
  matchId: string
  patch: string
  gameCreation: number
  gameDuration: number
  timeline: any | null
  isOlderThan1Year: boolean
  isRemake: boolean
  statsCache: ChampionStatsCache
  team100Kills: number
  team200Kills: number
  trackedPuuid?: string  // only calculate PIG scores for this puuid
}

// process all participants in a match
export async function processParticipants(options: ProcessParticipantsOptions) {
  const {
    match, matchId, patch, gameCreation, gameDuration, timeline,
    isOlderThan1Year, isRemake, statsCache, team100Kills, team200Kills, trackedPuuid
  } = options

  return Promise.all(
    match.info.participants.map(async (p: any, index: number) => {
      const participantId = index + 1
      const teamTotalKills = p.teamId === 100 ? team100Kills : team200Kills

      // extract timeline data
      let abilityOrder: string | null = null
      let buildOrderStr: string | null = null
      let firstBuyStr: string | null = null
      let itemPurchases: ItemTimelineEvent[] | null = null

      if (!isOlderThan1Year && timeline) {
        abilityOrder = extractAbilityOrder(timeline, participantId)
        const buildOrder = extractBuildOrder(timeline, participantId)
        const firstBuy = extractFirstBuy(timeline, participantId)
        itemPurchases = extractItemTimeline(timeline, participantId)
        buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
        firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
      }

      // calculate PIG score for all participants (optimized scoring makes this feasible)
      let pigScore: number | null = null
      let pigScoreBreakdown: any = null
      if (!isOlderThan1Year && !isRemake && statsCache.size > 0) {
        try {
          const killDeathSummary = timeline ? getKillDeathSummary(timeline, participantId, p.teamId) : null
          const breakdown = await calculatePigScoreWithBreakdownCached({
            championName: p.championName,
            damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
            total_damage_dealt: p.totalDamageDealt || 0,
            total_heals_on_teammates: p.totalHealsOnTeammates || 0,
            total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
            time_ccing_others: p.timeCCingOthers || 0,
            game_duration: gameDuration,
            deaths: p.deaths,
            kills: p.kills,
            assists: p.assists,
            teamTotalKills,
            item0: p.item0 || 0,
            item1: p.item1,
            item2: p.item2,
            item3: p.item3,
            item4: p.item4,
            item5: p.item5,
            perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
            patch,
            spell1: p.summoner1Id || 0,
            spell2: p.summoner2Id || 0,
            skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
            buildOrder: buildOrderStr || undefined,
            firstBuy: firstBuyStr || undefined,
            deathQualityScore: killDeathSummary?.deathScore,
          }, statsCache)
          if (breakdown) {
            pigScore = breakdown.finalScore
            pigScoreBreakdown = breakdown
          }
        } catch {}
      }

      return {
        puuid: p.puuid,
        match_id: matchId,
        champion_name: p.championName,
        riot_id_game_name: p.riotIdGameName || '',
        riot_id_tagline: p.riotIdTagline || '',
        win: p.win,
        game_creation: gameCreation,
        patch,
        match_data: buildMatchData(p, pigScore, pigScoreBreakdown, abilityOrder, buildOrderStr, firstBuyStr, itemPurchases),
      }
    })
  )
}

// calculate team kills for KP
export function calculateTeamKills(participants: any[]): { team100: number; team200: number } {
  return {
    team100: participants.filter(p => p.teamId === 100).reduce((sum, p) => sum + (p.kills || 0), 0),
    team200: participants.filter(p => p.teamId === 200).reduce((sum, p) => sum + (p.kills || 0), 0),
  }
}

// prepare champion stats cache for a match
export async function prepareStatsCache(participants: any[], isOlderThan1Year: boolean, isRemake: boolean): Promise<ChampionStatsCache> {
  if (isOlderThan1Year || isRemake) return new Map()
  const championNames = participants.map((p: any) => p.championName)
  return prefetchChampionStats(championNames)
}
