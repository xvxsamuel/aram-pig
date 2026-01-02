// match storage - store match data to database
// used by: continuous-scraper.ts, update-profile api
import { createAdminClient } from './supabase'
import type { MatchData } from '@/types/match'
import type { RegionalCluster } from '../game/regions'
import { getMatchTimelineNoWait } from '../riot/api'
import { extractAbilityOrder } from '../game/ability-leveling'
import { extractPatch, getPatchFromDate, isPatchAccepted } from '../game/patch'
import { extractFirstBuy, formatFirstBuy } from '../game/items'
import { extractItemPurchases } from '../game/item-history'
import { StatsAggregator, type ParticipantStatsInput, mergeChampionStats, type ChampionStatsData } from './stats-aggregator'
import { getTrackedPuuids } from './tracked-players'

export type ParticipantStatsData = ParticipantStatsInput

// stats aggregator - module-level state for batch processing
const statsAggregator = new StatsAggregator()

export function getStatsBufferCount(): number {
  return statsAggregator.getParticipantCount()
}

export function getAggregatedChampionCount(): number {
  return statsAggregator.getChampionPatchCount()
}

let flushInProgress = false

export async function flushAggregatedStats(): Promise<{ success: boolean; count: number; error?: string }> {
  if (flushInProgress) {
    return { success: true, count: 0 }
  }

  const aggregatedStats = statsAggregator.getAggregatedStats()

  if (aggregatedStats.length === 0) {
    return { success: true, count: 0 }
  }

  flushInProgress = true

  try {
    const participantCount = statsAggregator.getParticipantCount()
    console.log(`[DB] Flushing ${aggregatedStats.length} champion stats (${participantCount} participants)...`)

    const supabase = createAdminClient()
    // All champions in one batch - should complete in ~60-90s, well under 120s HTTP timeout
    const BATCH_SIZE = 200
    let totalFlushed = 0

    for (let i = 0; i < aggregatedStats.length; i += BATCH_SIZE) {
      const batch = aggregatedStats.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(aggregatedStats.length / BATCH_SIZE)

      // Retry forever with exponential backoff - never lose data
      let attempt = 0
      while (true) {
        attempt++
        const batchStartTime = Date.now()
        
        try {
          const { error } = await supabase.rpc('upsert_aggregated_champion_stats_batch', {
            p_stats_array: batch
          })
          
          const elapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1)
          
          if (error) {
            throw error
          }
          
          console.log(`[DB] Batch ${batchNum}/${totalBatches}: ${batch.length} champions merged in ${elapsed}s`)
          totalFlushed += batch.length
          break // Success - exit retry loop
          
        } catch (error: any) {
          const elapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1)
          console.error(`[DB] Batch ${batchNum} attempt ${attempt} failed after ${elapsed}s:`, error.message)
          
          // Exponential backoff: 10s, 20s, 40s, 60s, 60s, 60s...
          const delay = Math.min(10000 * Math.pow(2, attempt - 1), 60000)
          console.log(`[DB] Retrying in ${delay / 1000}s...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
      
      // Brief delay between batches (if multiple)
      if (i + BATCH_SIZE < aggregatedStats.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // Only clear buffer after ALL batches succeed
    statsAggregator.clear()
    console.log(`[DB] Flush complete: ${totalFlushed} champion stats merged`)

    return { success: true, count: totalFlushed }
  } finally {
    flushInProgress = false
  }
}

export const flushStatsBatch = flushAggregatedStats

// skill order extraction

function extractSkillOrderAbbreviation(abilityOrder: string): string {
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
    const allAbilities = ['q', 'w', 'e']
    const missing = allAbilities.find(a => !result.includes(a))
    return missing ? result + missing : result
  }

  return result
}

// stats data type
interface StatsData {
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

// Helper to check if item is finished
function isFinishedItem(itemId: number, itemsData: Record<string, { itemType?: string }>): boolean {
  const item = itemsData[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
}

// Helper to process a single match into data structures
function processMatchData(
  matchData: MatchData,
  timeline: any,
  itemsData: Record<string, { itemType?: string }>,
  patchVersion: string
) {
  // Calculate team damage totals
  const teamDamage: Record<number, number> = { 100: 0, 200: 0 }
  matchData.info.participants.forEach(p => {
    if (p.teamId === 100 || p.teamId === 200) {
      teamDamage[p.teamId] += p.totalDamageDealtToChampions
    }
  })

  const participantAbilityOrders: (string | null)[] = []
  const participantFirstBuys: (string | null)[] = []
  const participantBuildOrders: (string | null)[] = []

  const participantRows = matchData.info.participants.map((p, index) => {
    const participantId = index + 1
    const abilityOrder = timeline ? extractAbilityOrder(timeline, participantId) : null
    const firstBuy = timeline ? extractFirstBuy(timeline, participantId) : []
    const firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
    const itemPurchases = timeline ? extractItemPurchases(timeline, participantId) : []

    const finalItems = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter(id => id > 0)
    const finalItemSet = new Set(finalItems)

    const timelineBuildOrder = itemPurchases
      .filter(
        purchase => purchase.action === 'buy' && isFinishedItem(purchase.itemId, itemsData) && finalItemSet.has(purchase.itemId)
      )
      .slice(0, 6)
      .map(p => p.itemId)

    const timelineBuildOrderStr = timelineBuildOrder.length > 0 ? timelineBuildOrder.join(',') : null

    participantAbilityOrders.push(abilityOrder)
    participantFirstBuys.push(firstBuyStr)
    participantBuildOrders.push(timelineBuildOrderStr)

    return {
      match_id: matchData.metadata.matchId,
      puuid: p.puuid,
      riot_id_game_name: p.riotIdGameName || '',
      riot_id_tagline: p.riotIdTagline || '',
      champion_name: p.championName,
      win: p.win,
      game_creation: matchData.info.gameCreation,
      patch: patchVersion,
      archived: false,

      match_data: {
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        level: p.champLevel,
        teamId: p.teamId,
        isRemake: p.gameEndedInEarlySurrender || false,

        stats: {
          damage: p.totalDamageDealtToChampions,
          teamDamage: teamDamage[p.teamId] || 0,
          gold: p.goldEarned,
          cs: p.totalMinionsKilled,
          doubleKills: p.doubleKills || 0,
          tripleKills: p.tripleKills || 0,
          quadraKills: p.quadraKills || 0,
          pentaKills: p.pentaKills || 0,
          totalDamageDealt: p.totalDamageDealt || 0,
          timeCCingOthers: p.timeCCingOthers || 0,
          totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
          totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0,
        },

        items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter(id => id > 0),
        spells: [p.summoner1Id, p.summoner2Id],

        runes: {
          primary: {
            style: p.perks?.styles[0]?.style || 0,
            perks: [
              p.perks?.styles[0]?.selections[0]?.perk || 0,
              p.perks?.styles[0]?.selections[1]?.perk || 0,
              p.perks?.styles[0]?.selections[2]?.perk || 0,
              p.perks?.styles[0]?.selections[3]?.perk || 0,
            ],
          },
          secondary: {
            style: p.perks?.styles[1]?.style || 0,
            perks: [p.perks?.styles[1]?.selections[0]?.perk || 0, p.perks?.styles[1]?.selections[1]?.perk || 0],
          },
          statPerks: [p.perks?.statPerks.offense || 0, p.perks?.statPerks.flex || 0, p.perks?.statPerks.defense || 0],
        },

        pigScore: null,
        abilityOrder: abilityOrder,
        buildOrder: timelineBuildOrderStr,
        firstBuy: firstBuyStr,
        itemPurchases: itemPurchases.length > 0 ? itemPurchases : null,
      },
    }
  })

  const isRemake = matchData.info.participants.some(p => p.gameEndedInEarlySurrender)
  const statsData: ParticipantStatsData[] = []

  if (!isRemake) {
    for (let i = 0; i < participantRows.length; i++) {
      const p = participantRows[i]
      const abilityOrder = participantAbilityOrders[i]
      const firstBuyStr = participantFirstBuys[i]
      const buildOrderStr = participantBuildOrders[i]

      const skillOrder = abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : null

      const itemsForStats = buildOrderStr
        ? buildOrderStr.split(',').map(id => parseInt(id, 10))
        : Array.isArray(p.match_data?.items) && p.match_data.items.length > 0
          ? p.match_data.items
          : []

      const runes = p.match_data?.runes || {
        primary: { style: 0, perks: [0, 0, 0, 0] },
        secondary: { style: 0, perks: [0, 0] },
        statPerks: [0, 0, 0],
      }
      const spells = p.match_data?.spells || [0, 0]

      statsData.push({
        champion_name: p.champion_name,
        patch: patchVersion,
        win: p.win,
        items: itemsForStats,
        first_buy: firstBuyStr,
        keystone_id: runes.primary.perks[0] || 0,
        rune1: runes.primary.perks[1] || 0,
        rune2: runes.primary.perks[2] || 0,
        rune3: runes.primary.perks[3] || 0,
        rune4: runes.secondary.perks[0] || 0,
        rune5: runes.secondary.perks[1] || 0,
        rune_tree_primary: runes.primary.style || 0,
        rune_tree_secondary: runes.secondary.style || 0,
        stat_perk0: runes.statPerks[0] || 0,
        stat_perk1: runes.statPerks[1] || 0,
        stat_perk2: runes.statPerks[2] || 0,
        spell1_id: spells[0] || 0,
        spell2_id: spells[1] || 0,
        skill_order: skillOrder,
        damage_to_champions: p.match_data?.stats?.damage || 0,
        total_damage: p.match_data?.stats?.totalDamageDealt || 0,
        healing: p.match_data?.stats?.totalHealsOnTeammates || 0,
        shielding: p.match_data?.stats?.totalDamageShieldedOnTeammates || 0,
        cc_time: p.match_data?.stats?.timeCCingOthers || 0,
        game_duration: matchData.info.gameDuration || 0,
        deaths: p.match_data?.deaths || 0,
      })
    }
  }

  return { participantRows, statsData, isRemake }
}

export async function storeMatchDataBatch(
  matchesData: MatchData[],
  region?: RegionalCluster,
  skipTimeline: boolean = false
): Promise<{ success: boolean; storedCount: number }> {
  const supabase = createAdminClient()
  
  if (matchesData.length === 0) return { success: true, storedCount: 0 }

  // 1. Prepare match rows (no pre-check needed - DB handles duplicates via ON CONFLICT)
  const matchRows = matchesData.map(match => ({
    match_id: match.metadata.matchId,
    game_creation: match.info.gameCreation,
    game_duration: match.info.gameDuration,
    patch: match.info.gameVersion ? extractPatch(match.info.gameVersion) : getPatchFromDate(match.info.gameCreation),
  }))

  // 2. Upsert matches to avoid duplicates (eliminates read queries)
  // ignoreDuplicates: true means conflicts are silently skipped, not updated
  const { data: insertedMatches, error: matchError } = await supabase
    .from('matches')
    .upsert(matchRows, { onConflict: 'match_id', ignoreDuplicates: true })
    .select('match_id')
  
  if (matchError) {
    console.error('error storing matches batch:', matchError)
    return { success: false, storedCount: 0 }
  }

  // Only successfully inserted matches are returned - duplicates are excluded
  const insertedIds = new Set((insertedMatches || []).map(m => m.match_id))
  const newMatches = matchesData.filter(m => insertedIds.has(m.metadata.matchId))
  
  if (newMatches.length === 0) return { success: true, storedCount: 0 }

  // 3. Fetch timelines in parallel (only for newly inserted matches)
  const timelines = new Map<string, any>()
  if (region && !skipTimeline) {
    await Promise.all(newMatches.map(async (match) => {
      try {
        const timeline = await getMatchTimelineNoWait(match.metadata.matchId, region)
        timelines.set(match.metadata.matchId, timeline)
      } catch (error: any) {
        if (error?.status !== 404) {
          console.log(`Could not fetch timeline for ${match.metadata.matchId}:`, error?.message || error)
        }
      }
    }))
  }

  // 4. Process participants
  const itemsDataImport = await import('@/data/items.json')
  const itemsData = itemsDataImport.default as Record<string, { itemType?: string }>
  
  const allParticipantRows: any[] = []
  const allStatsData: ParticipantStatsData[] = []
  
  const trackedPuuids = await getTrackedPuuids()

  for (const match of newMatches) {
    const timeline = timelines.get(match.metadata.matchId)
    const patchVersion = match.info.gameVersion ? extractPatch(match.info.gameVersion) : getPatchFromDate(match.info.gameCreation)
    
    const { participantRows, statsData, isRemake } = processMatchData(match, timeline, itemsData, patchVersion)
    
    allParticipantRows.push(...participantRows)
    
    const patchAccepted = await isPatchAccepted(patchVersion)
    if (patchAccepted && !isRemake) {
      allStatsData.push(...statsData)
      // console.log(`[STATS] Stored ${match.metadata.matchId} (+${statsData.length} participants)`)
    } else {
      // console.log(`[STATS] Stored ${match.metadata.matchId} (${isRemake ? 'remake' : 'old patch'}, stats skipped)`)
    }
  }

  // 5. Insert summoner_matches with ON CONFLICT (bulk, no pre-check)
  const trackedRows = allParticipantRows.filter(p => trackedPuuids.has(p.puuid))
  if (trackedRows.length > 0) {
    const insertRows = trackedRows.map(p => ({
        puuid: p.puuid,
        match_id: p.match_id,
        champion_name: p.champion_name,
        win: p.win,
        riot_id_game_name: p.riot_id_game_name,
        riot_id_tagline: p.riot_id_tagline,
        game_creation: p.game_creation,
        patch: p.patch,
        match_data: p.match_data,
    }))
    
    const { error: trackedError } = await supabase
      .from('summoner_matches')
      .upsert(insertRows, { onConflict: 'puuid,match_id' })
    
    if (trackedError) {
       console.error('error storing tracked participants batch:', trackedError)
    }
  }

  // 6. Add stats to aggregator
  for (const stats of allStatsData) {
    statsAggregator.add(stats)
  }
  
  return { success: true, storedCount: newMatches.length }
}

// main store function
export async function storeMatchData(
  matchData: MatchData,
  region?: RegionalCluster,
  skipTimeline: boolean = false
): Promise<{ success: boolean }> {
  const result = await storeMatchDataBatch([matchData], region, skipTimeline)
  return { success: result.success && result.storedCount > 0 }
}
