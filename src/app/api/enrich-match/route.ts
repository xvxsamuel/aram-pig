import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase'
import { getMatchTimeline, getMatchById } from '../../../lib/riot-api'
import { calculatePigScoreWithBreakdown } from '../../../lib/pig-score-v2'
import { extractAbilityOrder } from '../../../lib/ability-leveling'
import { extractBuildOrder, extractFirstBuy, formatBuildOrder, formatFirstBuy } from '../../../lib/item-purchases'
import { extractItemPurchases } from '../../../lib/item-purchase-history'
import { isPatchAccepted } from '../../../lib/patch-utils'

// in-memory lock to prevent concurrent processing of the same match (handles Strict Mode double-invoke)
const processingLocks = new Map<string, Promise<Response>>()

// finished items are tier 3+ items (legendaries and boots)
import itemsData from '../../../data/items.json'

const finishedItems = new Set<number>()
Object.entries(itemsData).forEach(([id, item]) => {
  // include tier 3+ items (legendaries) and boots (tier 2 boots have depth 2)
  const depth = (item as any).depth || 0
  const isBoot = (item as any).tags?.includes('Boots')
  if (depth >= 3 || (isBoot && depth >= 2)) {
    finishedItems.add(parseInt(id))
  }
})

function isFinishedItem(itemId: number): boolean {
  return finishedItems.has(itemId)
}

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

interface EnrichRequest {
  matchId: string
  region: string // regional routing (europe, americas, asia, sea)
}

// POST: Enrich a match with timeline data, pig scores, and champion stats
// Called when user expands match details for a match that needs enrichment
export async function POST(request: Request) {
  try {
    const { matchId, region }: EnrichRequest = await request.json()
    
    if (!matchId || !region) {
      return NextResponse.json(
        { error: 'matchId and region are required' },
        { status: 400 }
      )
    }
    
    // check if already processing this match (handles Strict Mode double-invoke)
    const existingLock = processingLocks.get(matchId)
    if (existingLock) {
      console.log(`[EnrichMatch] Already processing ${matchId}, waiting for result...`)
      return existingLock
    }
    
    // create processing promise and store it
    const processPromise = processEnrichment(matchId, region)
    processingLocks.set(matchId, processPromise)
    
    try {
      const result = await processPromise
      return result
    } finally {
      // clean up lock after processing completes
      processingLocks.delete(matchId)
    }
  } catch (error) {
    console.error('[EnrichMatch] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// actual enrichment logic separated for locking
async function processEnrichment(matchId: string, region: string): Promise<Response> {
  try {
    const supabase = createAdminClient()
    
    // get match record
    const { data: matchRecord, error: matchError } = await supabase
      .from('matches')
      .select('game_duration, game_creation, patch')
      .eq('match_id', matchId)
      .single()
    
    if (matchError || !matchRecord) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }
    
    // check if match is older than 30 days - no timeline available
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    if (matchRecord.game_creation < thirtyDaysAgo) {
      return NextResponse.json({ 
        error: 'Match older than 30 days - timeline not available',
        tooOld: true 
      }, { status: 400 })
    }
    
    // get all participants for this match
    const { data: participants, error: participantsError } = await supabase
      .from('summoner_matches')
      .select('puuid, match_data, patch, champion_name')
      .eq('match_id', matchId)
    
    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json({ error: 'No participants found' }, { status: 404 })
    }
    
    // check if already enriched (has timeline data)
    const anyHasTimeline = participants.some(p => 
      p.match_data?.abilityOrder || p.match_data?.buildOrder
    )
    
    const allHavePigScores = participants.every(p => 
      p.match_data?.pigScore !== null && p.match_data?.pigScore !== undefined
    )
    
    // if already fully enriched, just return cached pig scores
    if (anyHasTimeline && allHavePigScores) {
      const results: Record<string, number | null> = {}
      for (const p of participants) {
        results[p.puuid] = p.match_data?.pigScore ?? null
      }
      return NextResponse.json({ 
        results, 
        cached: true,
        message: 'Match already enriched'
      })
    }
    
    console.log(`[EnrichMatch] Fetching timeline for ${matchId}...`)
    
    // fetch timeline from Riot API
    let timeline
    try {
      timeline = await getMatchTimeline(matchId, region as any, 'overhead')
    } catch (err) {
      console.error(`[EnrichMatch] Failed to fetch timeline:`, err)
      return NextResponse.json({ 
        error: 'Failed to fetch timeline from Riot API',
        rateLimited: true 
      }, { status: 503 })
    }
    
    if (!timeline) {
      return NextResponse.json({ error: 'Timeline not available' }, { status: 404 })
    }
    
    // we also need the full match data to get participant stats
    let matchData
    try {
      matchData = await getMatchById(matchId, region as any, 'overhead')
    } catch (err) {
      console.error(`[EnrichMatch] Failed to fetch match:`, err)
      return NextResponse.json({ 
        error: 'Failed to fetch match from Riot API' 
      }, { status: 503 })
    }
    
    const patchAccepted = await isPatchAccepted(matchRecord.patch)
    const results: Record<string, number | null> = {}
    const updates: Array<{ puuid: string; updatedMatchData: any }> = []
    const statsToIncrement: Array<any> = []
    
    // process each participant
    for (let idx = 0; idx < participants.length; idx++) {
      const participant = participants[idx]
      const matchParticipant = matchData?.info?.participants?.find(
        (p: any) => p.puuid === participant.puuid
      )
      
      if (!matchParticipant) {
        console.log(`[EnrichMatch] Participant ${participant.puuid} not found in match data`)
        results[participant.puuid] = participant.match_data?.pigScore ?? null
        continue
      }
      
      const participantId = matchData.info.participants.indexOf(matchParticipant) + 1
      
      // extract timeline data
      const abilityOrder = extractAbilityOrder(timeline, participantId)
      const buildOrder = extractBuildOrder(timeline, participantId)
      const firstBuy = extractFirstBuy(timeline, participantId)
      const itemPurchases = extractItemPurchases(timeline, participantId)
      
      const buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
      const firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
      
      // calculate pig score with breakdown
      let pigScore = participant.match_data?.pigScore ?? null
      let pigScoreBreakdown = participant.match_data?.pigScoreBreakdown ?? null
      
      if (pigScore === null && !matchParticipant.gameEndedInEarlySurrender) {
        try {
          const breakdown = await calculatePigScoreWithBreakdown({
            championName: participant.champion_name,
            damage_dealt_to_champions: matchParticipant.totalDamageDealtToChampions || 0,
            total_damage_dealt: matchParticipant.totalDamageDealt || 0,
            total_heals_on_teammates: matchParticipant.totalHealsOnTeammates || 0,
            total_damage_shielded_on_teammates: matchParticipant.totalDamageShieldedOnTeammates || 0,
            time_ccing_others: matchParticipant.timeCCingOthers || 0,
            game_duration: matchRecord.game_duration || 0,
            deaths: matchParticipant.deaths || 0,
            item0: matchParticipant.item0 || 0,
            item1: matchParticipant.item1 || 0,
            item2: matchParticipant.item2 || 0,
            item3: matchParticipant.item3 || 0,
            item4: matchParticipant.item4 || 0,
            item5: matchParticipant.item5 || 0,
            perk0: matchParticipant.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
            patch: matchRecord.patch,
            spell1: matchParticipant.summoner1Id || 0,
            spell2: matchParticipant.summoner2Id || 0,
            skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
            buildOrder: buildOrderStr || undefined
          })
          
          if (breakdown) {
            pigScore = breakdown.finalScore
            pigScoreBreakdown = breakdown
          }
        } catch (err) {
          console.error(`[EnrichMatch] Failed to calculate pig score for ${participant.champion_name}:`, err)
        }
      }
      
      results[participant.puuid] = pigScore
      
      // update match_data with timeline info and pig score
      const updatedMatchData = {
        ...participant.match_data,
        abilityOrder: abilityOrder,
        buildOrder: buildOrderStr,
        firstBuy: firstBuyStr,
        itemPurchases: itemPurchases.length > 0 ? itemPurchases : null,
        pigScore: pigScore,
        pigScoreBreakdown: pigScoreBreakdown,
        // also update stats that might be missing
        stats: {
          ...participant.match_data?.stats,
          totalDamageDealt: matchParticipant.totalDamageDealt || participant.match_data?.stats?.totalDamageDealt || 0,
          timeCCingOthers: matchParticipant.timeCCingOthers || participant.match_data?.stats?.timeCCingOthers || 0,
          totalHealsOnTeammates: matchParticipant.totalHealsOnTeammates || participant.match_data?.stats?.totalHealsOnTeammates || 0,
          totalDamageShieldedOnTeammates: matchParticipant.totalDamageShieldedOnTeammates || participant.match_data?.stats?.totalDamageShieldedOnTeammates || 0,
        }
      }
      
      updates.push({ puuid: participant.puuid, updatedMatchData })
      
      // prepare champion stats increment (only if patch is accepted and not already enriched)
      if (patchAccepted && !anyHasTimeline) {
        const buildOrderForStats = buildOrder.filter(id => isFinishedItem(id)).slice(0, 6)
        const skillOrder = abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : ''
        const itemsForStats = buildOrderForStats.length > 0 
          ? buildOrderForStats
          : [matchParticipant.item0, matchParticipant.item1, matchParticipant.item2, matchParticipant.item3, matchParticipant.item4, matchParticipant.item5]
              .filter((id: number) => id > 0 && isFinishedItem(id))
        
        const runes = {
          primary: { 
            style: matchParticipant.perks?.styles?.[0]?.style || 0, 
            perks: matchParticipant.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0,0,0,0] 
          },
          secondary: { 
            style: matchParticipant.perks?.styles?.[1]?.style || 0, 
            perks: matchParticipant.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0,0] 
          },
          statPerks: [
            matchParticipant.perks?.statPerks?.offense || 0, 
            matchParticipant.perks?.statPerks?.flex || 0, 
            matchParticipant.perks?.statPerks?.defense || 0
          ]
        }
        
        statsToIncrement.push({
          p_champion_name: participant.champion_name,
          p_patch: matchRecord.patch,
          p_win: matchParticipant.win ? 1 : 0,
          p_items: JSON.stringify(itemsForStats),
          p_first_buy: (firstBuy.length > 0 ? formatFirstBuy(firstBuy) : '') ?? '',
          p_keystone_id: runes.primary.perks[0] || 0,
          p_rune1: runes.primary.perks[1] || 0,
          p_rune2: runes.primary.perks[2] || 0,
          p_rune3: runes.primary.perks[3] || 0,
          p_rune4: runes.secondary.perks[0] || 0,
          p_rune5: runes.secondary.perks[1] || 0,
          p_rune_tree_primary: runes.primary.style,
          p_rune_tree_secondary: runes.secondary.style,
          p_stat_perk0: runes.statPerks[0],
          p_stat_perk1: runes.statPerks[1],
          p_stat_perk2: runes.statPerks[2],
          p_spell1_id: matchParticipant.summoner1Id || 0,
          p_spell2_id: matchParticipant.summoner2Id || 0,
          p_skill_order: skillOrder,
          p_damage_to_champions: matchParticipant.totalDamageDealtToChampions || 0,
          p_total_damage: matchParticipant.totalDamageDealt || 0,
          p_healing: matchParticipant.totalHealsOnTeammates || 0,
          p_shielding: matchParticipant.totalDamageShieldedOnTeammates || 0,
          p_cc_time: matchParticipant.timeCCingOthers || 0,
          p_game_duration: matchRecord.game_duration || 0,
          p_deaths: matchParticipant.deaths || 0
        })
      }
    }
    
    // batch update summoner_matches
    for (const update of updates) {
      await supabase
        .from('summoner_matches')
        .update({ match_data: update.updatedMatchData })
        .eq('match_id', matchId)
        .eq('puuid', update.puuid)
    }
    
    // increment champion stats for all participants (only once per match)
    let statsUpdated = 0
    if (statsToIncrement.length > 0 && !anyHasTimeline) {
      console.log(`[EnrichMatch] Incrementing champion stats for ${statsToIncrement.length} participants...`)
      for (const stats of statsToIncrement) {
        const { error: statsError } = await supabase.rpc('increment_champion_stats', stats)
        if (statsError) {
          console.error(`[EnrichMatch] Error updating stats for ${stats.p_champion_name}:`, statsError)
        } else {
          statsUpdated++
        }
      }
    }
    
    console.log(`[EnrichMatch] Enriched match ${matchId}: ${updates.length} participants updated, ${statsUpdated} stats incremented`)
    
    return NextResponse.json({ 
      results, 
      enriched: updates.length,
      statsUpdated,
      cached: false
    })
    
  } catch (error) {
    console.error('[EnrichMatch] Error:', error)
    return NextResponse.json(
      { error: 'Failed to enrich match' },
      { status: 500 }
    )
  }
}
