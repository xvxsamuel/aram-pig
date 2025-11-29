// Match storage - store match data to database
// Used by: continuous-scraper.ts, update-profile API
import { createAdminClient } from './supabase'
import type { MatchData } from '@/types/match'
import type { RegionalCluster } from '../game/regions'
import { getMatchTimelineNoWait } from '../riot/api'
import { extractAbilityOrder } from '../game/ability-leveling'
import { extractPatch, getPatchFromDate, isPatchAccepted } from '../game/patch'
import { extractFirstBuy, formatFirstBuy } from '../game/items'
import { extractItemPurchases } from '../game/item-history'
import { StatsAggregator } from './stats-aggregator'
import { getTrackedPuuids } from './tracked-players'

// ============================================================================
// STATS AGGREGATOR - module-level state for batch processing
// ============================================================================
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
    console.log(`[DB] Flushing ${aggregatedStats.length} champion+patch combos (${participantCount} participants)...`)
    
    const supabase = createAdminClient()
    const BATCH_SIZE = 10
    let totalFlushed = 0
    let failedBatches = 0
    
    for (let i = 0; i < aggregatedStats.length; i += BATCH_SIZE) {
      const batch = aggregatedStats.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(aggregatedStats.length / BATCH_SIZE)
      
      const statsArray = batch.map(stats => ({
        champion_name: stats.champion_name,
        patch: stats.patch,
        data: JSON.stringify(stats.data)
      }))
      
      const { data, error } = await supabase.rpc('upsert_aggregated_champion_stats_batch', {
        p_stats_array: statsArray
      })
      
      if (error) {
        console.log(`[DB] Batch ${batchNum}/${totalBatches} failed: ${error.message}`)
        failedBatches++
        continue
      }
      
      totalFlushed += data || batch.length
    }
    
    statsAggregator.clear()
    
    if (failedBatches > 0) {
      console.log(`[DB] Flushed ${totalFlushed}/${aggregatedStats.length} combos (${failedBatches} batches failed)`)
    } else {
      console.log(`[DB] Flushed ${totalFlushed} champion+patch combos`)
    }
    
    return { success: totalFlushed > 0, count: totalFlushed }
  } finally {
    flushInProgress = false
  }
}

export const flushStatsBatch = flushAggregatedStats

// ============================================================================
// SKILL ORDER EXTRACTION
// ============================================================================

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

// ============================================================================
// STATS DATA TYPE
// ============================================================================

export interface ParticipantStatsData {
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
// MAIN STORE FUNCTION
// ============================================================================

export async function storeMatchData(
  matchData: MatchData,
  region?: RegionalCluster,
  skipTimeline: boolean = false
): Promise<{ success: boolean }> {
  const supabase = createAdminClient()
  
  try {
    const patchVersion = matchData.info.gameVersion 
      ? extractPatch(matchData.info.gameVersion)
      : getPatchFromDate(matchData.info.gameCreation)

    const { data: existingMatch } = await supabase
      .from('matches')
      .select('match_id')
      .eq('match_id', matchData.metadata.matchId)
      .maybeSingle()

    if (existingMatch) {
      return { success: false }
    }

    let timeline = null
    if (region && !skipTimeline) {
      try {
        timeline = await getMatchTimelineNoWait(matchData.metadata.matchId, region)
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string }
        if (err?.status !== 404) {
          console.log(`Could not fetch timeline for ${matchData.metadata.matchId}:`, err?.message || error)
        }
      }
    }

    const { error: matchError } = await supabase
      .from('matches')
      .insert({
        match_id: matchData.metadata.matchId,
        game_creation: matchData.info.gameCreation,
        game_duration: matchData.info.gameDuration,
        patch: patchVersion,
      })

    if (matchError) {
      if (matchError.code === '23505') {
        return { success: false }
      }
      console.error('error storing match:', matchError)
      return { success: false }
    }

    const itemsDataImport = await import('@/data/items.json')
    const itemsData = itemsDataImport.default as Record<string, { itemType?: string }>
    
    const isFinishedItem = (itemId: number): boolean => {
      const item = itemsData[itemId.toString()]
      if (!item) return false
      const type = item.itemType
      return type === 'legendary' || type === 'boots'
    }
    
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
        .filter(purchase => 
          purchase.action === 'buy' && 
          isFinishedItem(purchase.itemId) &&
          finalItemSet.has(purchase.itemId)
        )
        .slice(0, 6)
        .map(p => p.itemId)
      
      const timelineBuildOrderStr = timelineBuildOrder.length > 0 
        ? timelineBuildOrder.join(',') 
        : null

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
            gold: p.goldEarned,
            cs: p.totalMinionsKilled,
            doubleKills: p.doubleKills || 0,
            tripleKills: p.tripleKills || 0,
            quadraKills: p.quadraKills || 0,
            pentaKills: p.pentaKills || 0,
            totalDamageDealt: p.totalDamageDealt || 0,
            timeCCingOthers: p.timeCCingOthers || 0,
            totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
            totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0
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
                p.perks?.styles[0]?.selections[3]?.perk || 0
              ]
            },
            secondary: {
              style: p.perks?.styles[1]?.style || 0,
              perks: [
                p.perks?.styles[1]?.selections[0]?.perk || 0,
                p.perks?.styles[1]?.selections[1]?.perk || 0
              ]
            },
            statPerks: [
              p.perks?.statPerks.offense || 0,
              p.perks?.statPerks.flex || 0,
              p.perks?.statPerks.defense || 0
            ]
          },
          
          pigScore: null,
          abilityOrder: abilityOrder,
          buildOrder: timelineBuildOrderStr,
          firstBuy: firstBuyStr,
          itemPurchases: itemPurchases.length > 0 ? itemPurchases : null
        }
      }
    })

    const trackedPuuids = await getTrackedPuuids()
    const trackedRows = participantRows.filter(p => trackedPuuids.has(p.puuid))
    
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
        match_data: p.match_data
      }))
      
      const { error: trackedError } = await supabase
        .from('summoner_matches')
        .insert(insertRows)
      
      if (trackedError) {
        console.error('error storing tracked participants:', trackedError)
        return { success: false }
      }
    }
    
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
          : (Array.isArray(p.match_data?.items) && p.match_data.items.length > 0 ? p.match_data.items : [])
        
        const runes = p.match_data?.runes || { primary: { style: 0, perks: [0, 0, 0, 0] }, secondary: { style: 0, perks: [0, 0] }, statPerks: [0, 0, 0] }
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
          deaths: p.match_data?.deaths || 0
        })
      }
    }
    
    const patchAccepted = await isPatchAccepted(patchVersion)
    
    if (patchAccepted) {
      // Always use batch mode - stats are aggregated in memory with Welford's algorithm
      // for proper mean/stddev calculation, then flushed periodically
      for (const stats of statsData) {
        statsAggregator.add(stats)
      }
      console.log(`[STATS] Stored ${matchData.metadata.matchId} (+${statsData.length} participants, buffer: ${getStatsBufferCount()}, ${getAggregatedChampionCount()} champions)`)
    } else if (isRemake) {
      console.log(`[STATS] Stored ${matchData.metadata.matchId} (remake, stats skipped)`)
    } else {
      console.log(`[STATS] Stored ${matchData.metadata.matchId} (patch ${patchVersion} skipped)`)
    }

    return { success: true }
  } catch (error) {
    console.error('error in storeMatchData:', error)
    return { success: false }
  }
}
