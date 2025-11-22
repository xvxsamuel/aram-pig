// shared utility for storing match data to database
import { createAdminClient } from './supabase'
import type { MatchData } from './riot-api'
import type { RegionalCluster } from './regions'
import { getMatchTimelineNoWait } from './riot-api'
import { extractAbilityOrder } from './ability-leveling'
import { extractPatch, getPatchFromDate } from './patch-utils'
import { extractBuildOrder, extractFirstBuy, formatBuildOrder, formatFirstBuy } from './item-purchases'
import { extractItemPurchases } from './item-purchase-history'

// Cache tracked PUUIDs to avoid repeated DB queries
let trackedPuuidsCache: Set<string> | null = null
let trackedPuuidsCacheExpiry = 0
const TRACKED_PUUIDS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getTrackedPuuids(): Promise<Set<string>> {
  const now = Date.now()
  
  // Return cached if still valid
  if (trackedPuuidsCache && now < trackedPuuidsCacheExpiry) {
    return trackedPuuidsCache
  }
  
  // Refresh cache
  const supabase = createAdminClient()
  const { data: trackedPlayers } = await supabase
    .from('summoners')
    .select('puuid')
  
  trackedPuuidsCache = new Set(trackedPlayers?.map(p => p.puuid) || [])
  trackedPuuidsCacheExpiry = now + TRACKED_PUUIDS_CACHE_TTL
  
  return trackedPuuidsCache
}

// Helper function to determine ability max order from full ability sequence
// Returns which ability was maxed first, second, third (e.g., "Q>W>E" or "qwe")
// Normalizes incomplete orders: q->qwe, qe->qew, qw->qwe (excludes single letter orders)
function extractSkillOrderAbbreviation(abilityOrder: string): string {
  if (!abilityOrder || abilityOrder.length === 0) return ''
  
  // Parse the space-separated ability order (e.g., "Q W E Q W R Q W Q W R W W E E R E E")
  const abilities = abilityOrder.split(' ')
  
  // Track when each ability reaches level 5 (maxed)
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []
  
  for (const ability of abilities) {
    if (ability in counts) {
      counts[ability as keyof typeof counts]++
      
      // Check if this ability just reached level 5 (maxed, excluding R)
      if (ability !== 'R' && counts[ability as keyof typeof counts] === 5) {
        maxOrder.push(ability.toLowerCase())
      }
    }
  }
  
  const result = maxOrder.join('')
  
  // Normalize incomplete orders (games ended early)
  // Single letter orders (q, w, e) are excluded entirely
  if (result.length === 1) return ''
  
  // Two letter orders get normalized to full 3-letter order
  if (result.length === 2) {
    const abilities = ['q', 'w', 'e']
    const missing = abilities.find(a => !result.includes(a))
    return missing ? result + missing : result
  }
  
  // Return the max order (e.g., "qwe" means Q maxed first, W second, E third)
  return result
}

export async function storeMatchData(
  matchData: MatchData,
  region?: RegionalCluster,
  skipTimeline: boolean = false // Fetch timeline by default for full data
): Promise<boolean> {
  const supabase = createAdminClient()
  
  try {
    // extract patch version (fallback to date-based if gameVersion not available)
    const patchVersion = matchData.info.gameVersion 
      ? extractPatch(matchData.info.gameVersion)
      : getPatchFromDate(matchData.info.gameCreation)

    // check if match already exists
    const { data: existingMatch, error: checkError } = await supabase
      .from('matches')
      .select('match_id')
      .eq('match_id', matchData.metadata.matchId)
      .maybeSingle()

    if (existingMatch) {
      // match already exists, skip silently
      return false
    }

    // fetch timeline data for ability leveling and caching (optional for speed)
    let timeline = null
    if (region && !skipTimeline) {
      try {
        console.log(`  Fetching timeline for ${matchData.metadata.matchId}...`)
        timeline = await getMatchTimelineNoWait(matchData.metadata.matchId, region)
        console.log(`  Timeline fetched successfully`)
      } catch (error: any) {
        // silently skip timeline if unavailable (ability_order will be null)
        if (error?.status !== 404) {
          console.log(`could not fetch timeline for ${matchData.metadata.matchId}:`, error?.message || error)
        }
      }
    }

    // store match metadata
    const { error: matchError } = await supabase
      .from('matches')
      .insert({
        match_id: matchData.metadata.matchId,
        game_creation: matchData.info.gameCreation,
        game_duration: matchData.info.gameDuration,
        patch: patchVersion,
      })

    if (matchError) {
      // ignore duplicate key errors (race condition between scrapers)
      if (matchError.code === '23505') {
        return false
      }
      console.error('error storing match:', matchError)
      return false
    }

    // store participant data (pig scores calculated separately from this dataset)
    console.log(`  Preparing participant rows...`)
    
    // Load items data once for all participants
    const itemsDataImport = await import('@/data/items.json')
    const itemsData = itemsDataImport.default as Record<string, any>
    
    const isFinishedItem = (itemId: number): boolean => {
      const item = itemsData[itemId.toString()]
      if (!item) return false
      const type = item.itemType
      return type === 'legendary' || type === 'boots'
    }
    
    // Track ability orders, first buys, and build orders for champion stats RPC
    const participantAbilityOrders: (string | null)[] = []
    const participantFirstBuys: (string | null)[] = []
    const participantBuildOrders: (string | null)[] = []
    
    const participantRows = matchData.info.participants.map((p, index) => {
      // extract ability order from timeline (participantId is 1-indexed)
      const participantId = index + 1
      const abilityOrder = timeline ? extractAbilityOrder(timeline, participantId) : null
      
      // extract first buy from timeline (still needed for stats)
      const firstBuy = timeline ? extractFirstBuy(timeline, participantId) : []
      const firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
      
      // extract item purchase history (buy/sell events with undo filtering)
      const itemPurchases = timeline ? extractItemPurchases(timeline, participantId) : []
      
      // Get final items from end-game inventory
      const finalItems = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter(id => id > 0)
      const finalItemSet = new Set(finalItems)
      
      // Process timeline to extract build order, but only include items that were in the final build
      // This excludes items that were sold and tier 1 boots that were upgraded
      const timelineBuildOrder = itemPurchases
        .filter(purchase => 
          purchase.action === 'buy' && 
          isFinishedItem(purchase.itemId) &&
          finalItemSet.has(purchase.itemId) // Only include if item is in final build
        )
        .slice(0, 6) // First 6 finished items
        .map(p => p.itemId) // Keep actual item IDs
      
      const timelineBuildOrderStr = timelineBuildOrder.length > 0 
        ? timelineBuildOrder.join(',') 
        : null

      // Store these for champion stats RPC (parallel to participantRows array)
      participantAbilityOrders.push(abilityOrder)
      participantFirstBuys.push(firstBuyStr)
      participantBuildOrders.push(timelineBuildOrderStr)

      return {
        // Core indexed columns
        match_id: matchData.metadata.matchId,
        puuid: p.puuid,
        riot_id_game_name: p.riotIdGameName || '',
        riot_id_tagline: p.riotIdTagline || '',
        champion_name: p.championName,
        win: p.win,
        game_creation: matchData.info.gameCreation,
        patch: patchVersion,
        archived: false,
        
        // All display/stat data in JSONB
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
            doubleKills: (p as any).doubleKills || 0,
            tripleKills: (p as any).tripleKills || 0,
            quadraKills: (p as any).quadraKills || 0,
            pentaKills: (p as any).pentaKills || 0,
            totalDamageDealt: (p as any).totalDamageDealt || 0,
            timeCCingOthers: (p as any).timeCCingOthers || 0,
            totalHealsOnTeammates: (p as any).totalHealsOnTeammates || 0,
            totalDamageShieldedOnTeammates: (p as any).totalDamageShieldedOnTeammates || 0
          },
          
          items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5],
          
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

    console.log(`  Inserting ${participantRows.length} participant rows to database...`)
    
    // Get list of tracked players (cached)
    const trackedPuuids = await getTrackedPuuids()
    
    // Separate tracked vs anonymous participants
    const trackedRows = participantRows.filter(p => trackedPuuids.has(p.puuid))
    const anonymousRows = participantRows.filter(p => !trackedPuuids.has(p.puuid))
    
    // Insert tracked players to summoner_matches (stores raw match data for profiles)
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
        return false
      }
    }
    
    // Update champion_stats JSONB for ALL participants (tracked + anonymous)
    for (let i = 0; i < participantRows.length; i++) {
      const p = participantRows[i]
      const abilityOrder = participantAbilityOrders[i]
      const firstBuyStr = participantFirstBuys[i]
      const buildOrderStr = participantBuildOrders[i]
      
      // Extract skill order abbreviation (e.g., "qew" for Q>E>W max order)
      const skillOrder = abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : null
      
      // Ensure items array has exactly 6 elements
      const itemsArray = Array.isArray(p.match_data?.items) 
        ? p.match_data.items.slice(0, 6).concat(Array(6).fill(0)).slice(0, 6)
        : [0, 0, 0, 0, 0, 0]
      
      // Validate runes structure
      const runes = p.match_data?.runes || { primary: { style: 0, perks: [0, 0, 0, 0] }, secondary: { style: 0, perks: [0, 0] }, statPerks: [0, 0, 0] }
      const spells = p.match_data?.spells || [0, 0]
      
      // pass items as JSON string to work around supabase rpc array serialization bug
      const { error: statsError } = await supabase.rpc('increment_champion_stats', {
        p_champion_name: p.champion_name,
        p_patch: patchVersion,
        p_win: p.win ? 1 : 0,
        p_items: JSON.stringify(itemsArray),
        p_first_buy: firstBuyStr || '',
        p_keystone_id: runes.primary.perks[0] || 0,
        p_rune1: runes.primary.perks[1] || 0,
        p_rune2: runes.primary.perks[2] || 0,
        p_rune3: runes.primary.perks[3] || 0,
        p_rune4: runes.secondary.perks[0] || 0,
        p_rune5: runes.secondary.perks[1] || 0,
        p_rune_tree_primary: runes.primary.style || 0,
        p_rune_tree_secondary: runes.secondary.style || 0,
        p_stat_perk0: runes.statPerks[0] || 0,
        p_stat_perk1: runes.statPerks[1] || 0,
        p_stat_perk2: runes.statPerks[2] || 0,
        p_spell1_id: spells[0] || 0,
        p_spell2_id: spells[1] || 0,
        p_skill_order: skillOrder || '',
        p_damage_to_champions: p.match_data?.stats?.damage || 0,
        p_total_damage: p.match_data?.stats?.totalDamageDealt || 0,
        p_healing: p.match_data?.stats?.totalHealsOnTeammates || 0,
        p_shielding: p.match_data?.stats?.totalDamageShieldedOnTeammates || 0,
        p_cc_time: p.match_data?.stats?.timeCCingOthers || 0,
        p_game_duration: matchData.info.gameDuration || 0,
        p_deaths: p.match_data?.deaths || 0
      }).select()
      
      if (statsError) {
        console.error('error updating champion stats:', statsError)
        console.error('Problematic data:', {
          champion: p.champion_name,
          items: itemsArray,
          itemsString: `{${itemsArray.join(',')}}`,
          match_data: p.match_data
        })
        // Continue processing other players even if one fails
      }
    }

    console.log(`  Successfully stored match ${matchData.metadata.matchId} (${trackedRows.length} tracked, ${participantRows.length - trackedRows.length} anonymous)`)
    return true
  } catch (error) {
    console.error('error in storeMatchData:', error)
    return false
  }
}
