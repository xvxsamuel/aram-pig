// participant processing utilities for match storage
// extracts common logic for processing match participants

import {
  extractAbilityOrder,
  extractBuildOrder,
  extractFirstBuy,
  formatBuildOrder,
  formatFirstBuy,
  extractItemTimeline,
  type ItemTimelineEvent,
} from '@/lib/game'
import itemsData from '@/data/items.json'

// helper to check if item is a finished item (legendary or boots)
export function isFinishedItem(itemId: number): boolean {
  const item = (itemsData as Record<string, any>)[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
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
}

// process all participants in a match
// NOTE: PIG scores are calculated on-demand via /api/calculate-pig-scores
export async function processParticipants(options: ProcessParticipantsOptions) {
  const {
    match, matchId, patch, gameCreation, timeline,
    isOlderThan1Year,
  } = options

  return Promise.all(
    match.info.participants.map(async (p: any, index: number) => {
      const participantId = index + 1

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

      // PIG score is null - will be calculated on-demand
      const pigScore: number | null = null
      const pigScoreBreakdown: any = null

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
