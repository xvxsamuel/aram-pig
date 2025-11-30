// Auto-enrichment for matches < 30 days old
// Fetches timeline from Riot API and stores it in matches table

import { createAdminClient } from './supabase'
import { getMatchTimeline, getMatchById } from '../riot/api'
import { calculatePigScoreWithBreakdown } from '../scoring'
import { extractAbilityOrder, extractBuildOrder, extractFirstBuy, formatBuildOrder, formatFirstBuy, extractItemPurchases } from '../game'
import { PLATFORM_TO_REGIONAL, type PlatformCode } from '../game/regions'

// Max matches to enrich per profile fetch (to avoid timeout)
const MAX_ENRICHMENTS_PER_FETCH = 3

// extract skill max order from ability order string
function extractSkillOrderAbbreviation(abilityOrder: string): string {
  if (!abilityOrder) return ''
  
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
  if (result.length < 2) return ''
  if (result.length === 2) {
    const allAbilities = ['q', 'w', 'e']
    const missing = allAbilities.find(a => !result.includes(a))
    return missing ? result + missing : result
  }
  return result
}

/**
 * Auto-enrich recent matches that don't have timeline data yet
 * Called during profile fetch for matches < 30 days old
 * 
 * @param matchIds - Array of match IDs to check
 * @param region - Player's platform code (e.g., 'euw1')
 * @returns Number of matches enriched
 */
export async function autoEnrichRecentMatches(
  matchIds: string[],
  region: PlatformCode
): Promise<number> {
  if (matchIds.length === 0) return 0
  
  const supabase = createAdminClient()
  const regionalCluster = PLATFORM_TO_REGIONAL[region] || 'europe'
  
  // Calculate 30 day cutoff
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
  
  // Find matches that need enrichment:
  // 1. Game creation > 30 days ago
  // 2. No timeline_data stored yet
  const { data: matchesToEnrich } = await supabase
    .from('matches')
    .select('match_id, game_creation, game_duration, patch')
    .in('match_id', matchIds)
    .gt('game_creation', thirtyDaysAgo)
    .is('timeline_data', null)
    .order('game_creation', { ascending: false })
    .limit(MAX_ENRICHMENTS_PER_FETCH)
  
  if (!matchesToEnrich || matchesToEnrich.length === 0) {
    return 0
  }
  
  console.log(`[AutoEnrich] Found ${matchesToEnrich.length} matches to enrich`)
  
  let enrichedCount = 0
  
  for (const match of matchesToEnrich) {
    try {
      // Fetch timeline from Riot API
      console.log(`[AutoEnrich] Fetching timeline for ${match.match_id}...`)
      const timeline = await getMatchTimeline(match.match_id, regionalCluster, 'batch')
      
      if (!timeline) {
        console.log(`[AutoEnrich] No timeline available for ${match.match_id}`)
        continue
      }
      
      // Fetch full match data (for participant details)
      const matchData = await getMatchById(match.match_id, regionalCluster, 'batch')
      
      if (!matchData) {
        console.log(`[AutoEnrich] No match data for ${match.match_id}`)
        continue
      }
      
      // Store timeline in matches table
      await supabase
        .from('matches')
        .update({ timeline_data: timeline })
        .eq('match_id', match.match_id)
      
      // Get all participants for this match
      const { data: participants } = await supabase
        .from('summoner_matches')
        .select('puuid, match_data, champion_name')
        .eq('match_id', match.match_id)
      
      if (!participants) continue
      
      // Pre-calculate team kills for kill participation
      const teamKills: Record<number, number> = {}
      for (const p of matchData.info.participants) {
        teamKills[p.teamId] = (teamKills[p.teamId] || 0) + (p.kills || 0)
      }
      
      // Process each participant - extract timeline data and calculate pig score
      for (const participant of participants) {
        const matchParticipant = matchData.info.participants.find(
          (p: any) => p.puuid === participant.puuid
        )
        
        if (!matchParticipant) continue
        
        const participantId = matchData.info.participants.indexOf(matchParticipant) + 1
        
        // Extract timeline data for this player
        const abilityOrder = extractAbilityOrder(timeline, participantId)
        const rawBuildOrder = extractBuildOrder(timeline, participantId)
        const buildOrder = formatBuildOrder(rawBuildOrder)
        const rawFirstBuy = extractFirstBuy(timeline, participantId)
        const firstBuy = formatFirstBuy(rawFirstBuy)
        const itemPurchases = extractItemPurchases(timeline, participantId)
        
        // Calculate pig score
        const breakdown = await calculatePigScoreWithBreakdown({
          championName: participant.champion_name,
          damage_dealt_to_champions: participant.match_data?.stats?.damage || matchParticipant.totalDamageDealtToChampions || 0,
          total_damage_dealt: participant.match_data?.stats?.totalDamageDealt || matchParticipant.totalDamageDealt || 0,
          total_heals_on_teammates: participant.match_data?.stats?.totalHealsOnTeammates || matchParticipant.totalHealsOnTeammates || 0,
          total_damage_shielded_on_teammates: participant.match_data?.stats?.totalDamageShieldedOnTeammates || matchParticipant.totalDamageShieldedOnTeammates || 0,
          time_ccing_others: participant.match_data?.stats?.timeCCingOthers || matchParticipant.timeCCingOthers || 0,
          game_duration: match.game_duration,
          deaths: participant.match_data?.deaths || matchParticipant.deaths || 0,
          kills: matchParticipant.kills || 0,
          assists: matchParticipant.assists || 0,
          teamTotalKills: teamKills[matchParticipant.teamId] || 0,
          item0: matchParticipant.item0 || 0,
          item1: matchParticipant.item1 || 0,
          item2: matchParticipant.item2 || 0,
          item3: matchParticipant.item3 || 0,
          item4: matchParticipant.item4 || 0,
          item5: matchParticipant.item5 || 0,
          perk0: matchParticipant.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
          patch: match.patch,
          spell1: matchParticipant.summoner1Id,
          spell2: matchParticipant.summoner2Id,
          skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
          buildOrder: buildOrder ?? undefined
        })
        
        // Update participant match_data with timeline info and pig score
        const updatedMatchData = {
          ...participant.match_data,
          abilityOrder,
          buildOrder,
          firstBuy,
          itemPurchases,
          pigScore: breakdown?.finalScore ?? null
        }
        
        await supabase
          .from('summoner_matches')
          .update({ match_data: updatedMatchData })
          .eq('match_id', match.match_id)
          .eq('puuid', participant.puuid)
      }
      
      enrichedCount++
      console.log(`[AutoEnrich] Enriched ${match.match_id} (${enrichedCount}/${matchesToEnrich.length})`)
      
    } catch (error) {
      console.error(`[AutoEnrich] Error enriching ${match.match_id}:`, error)
      // Continue to next match on error
    }
  }
  
  console.log(`[AutoEnrich] Completed: ${enrichedCount}/${matchesToEnrich.length} matches enriched`)
  return enrichedCount
}

/**
 * Get stored timeline for a match
 * Returns null if not stored yet
 */
export async function getStoredTimeline(matchId: string) {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('matches')
    .select('timeline_data')
    .eq('match_id', matchId)
    .single()
  
  return data?.timeline_data ?? null
}
