import { NextResponse } from 'next/server'
import { createAdminClient, statsAggregator, flushAggregatedStats, type ParticipantStatsInput } from '@/lib/db'
import { getMatchTimeline, getMatchById } from '@/lib/riot/api'
import { calculatePigScoreWithBreakdown } from '@/lib/scoring'
import {
  extractAbilityOrder,
  extractBuildOrder,
  extractFirstBuy,
  formatBuildOrder,
  formatFirstBuy,
  extractItemTimeline,
  isPatchAccepted,
} from '@/lib/game'
import { getKillDeathSummary } from '@/lib/game/kill-timeline'

// in-memory lock to prevent concurrent processing of the same match (handles strict mode double-invoke)
const processingLocks = new Map<string, Promise<{ data: any; status: number }>>()

// timeline data is available from riot api for 365 days
const TIMELINE_AVAILABILITY_DAYS = 365

// finished items are legendaries and all boots (including tier 1)
import itemsData from '../../../data/items.json'

const finishedItems = new Set<number>()
Object.entries(itemsData).forEach(([id, item]) => {
  const type = (item as any).itemType
  if (type === 'legendary' || type === 'boots') {
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

// post: enrich a match with timeline data, pig scores, and champion stats
// called when user expands match details for a match that needs enrichment
export async function POST(request: Request) {
  try {
    const { matchId, region }: EnrichRequest = await request.json()

    if (!matchId || !region) {
      return NextResponse.json({ error: 'matchId and region are required' }, { status: 400 })
    }

    // check if already processing this match (handles strict mode double-invoke)
    const existingLock = processingLocks.get(matchId)
    if (existingLock) {
      console.log(`[EnrichMatch] Already processing ${matchId}, waiting for result...`)
      const { data, status } = await existingLock
      return NextResponse.json(data, { status })
    }

    // create processing promise and store it
    const processPromise = processEnrichment(matchId, region)
    processingLocks.set(matchId, processPromise)

    try {
      const { data, status } = await processPromise
      return NextResponse.json(data, { status })
    } finally {
      // clean up lock after processing completes
      processingLocks.delete(matchId)
    }
  } catch (error) {
    console.error('[EnrichMatch] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// actual enrichment logic separated for locking
async function processEnrichment(matchId: string, region: string): Promise<{ data: any; status: number }> {
  try {
    const supabase = createAdminClient()

    // get match record (including stored timeline_data)
    const { data: matchRecord, error: matchError } = await supabase
      .from('matches')
      .select('game_duration, game_creation, patch, timeline_data')
      .eq('match_id', matchId)
      .single()

    if (matchError || !matchRecord) {
      return { data: { error: 'Match not found' }, status: 404 }
    }

    // check if match is older than 365 days - no timeline available from Riot API
    const timelineCutoff = Date.now() - TIMELINE_AVAILABILITY_DAYS * 24 * 60 * 60 * 1000
    const isTooOld = matchRecord.game_creation < timelineCutoff

    // if too old AND no stored timeline, we can't enrich
    if (isTooOld && !matchRecord.timeline_data) {
      return {
        data: { error: 'Match older than 365 days - timeline not available', tooOld: true },
        status: 400,
      }
    }

    // get all participants for this match
    const { data: participants, error: participantsError } = await supabase
      .from('summoner_matches')
      .select('puuid, match_data, patch, champion_name')
      .eq('match_id', matchId)

    if (participantsError || !participants || participants.length === 0) {
      return { data: { error: 'No participants found' }, status: 404 }
    }

    // check if already enriched (has timeline data in participants)
    const anyHasTimeline = participants.some(p => p.match_data?.abilityOrder || p.match_data?.buildOrder)

    const allHavePigScores = participants.every(
      p => p.match_data?.pigScore !== null && p.match_data?.pigScore !== undefined
    )

    // if already fully enriched, just return cached pig scores
    if (anyHasTimeline && allHavePigScores) {
      const results: Record<string, number | null> = {}
      for (const p of participants) {
        results[p.puuid] = p.match_data?.pigScore ?? null
      }
      return {
        data: { results, cached: true, message: 'Match already enriched' },
        status: 200,
      }
    }

    // try to use stored timeline first, otherwise fetch from Riot API
    let timeline = matchRecord.timeline_data

    if (!timeline) {
      console.log(`[EnrichMatch] Fetching timeline for ${matchId} from Riot API...`)

      try {
        timeline = await getMatchTimeline(matchId, region as any, 'overhead')
      } catch (err) {
        console.error(`[EnrichMatch] Failed to fetch timeline:`, err)
        return {
          data: { error: 'Failed to fetch timeline from Riot API', rateLimited: true },
          status: 503,
        }
      }

      if (!timeline) {
        return { data: { error: 'Timeline not available' }, status: 404 }
      }

      // store the timeline for future use
      const { error: timelineUpdateError } = await supabase
        .from('matches')
        .update({ timeline_data: timeline })
        .eq('match_id', matchId)

      if (timelineUpdateError) {
        console.error(`[EnrichMatch] Failed to store timeline:`, timelineUpdateError)
        // continue anyway - we have the timeline in memory
      } else {
        console.log(`[EnrichMatch] Stored timeline for ${matchId}`)
      }
    } else {
      console.log(`[EnrichMatch] Using stored timeline for ${matchId}`)
    }

    // we also need the full match data to get participant stats
    let matchData
    try {
      matchData = await getMatchById(matchId, region as any, 'overhead')
    } catch (err) {
      console.error(`[EnrichMatch] Failed to fetch match:`, err)
      return {
        data: { error: 'Failed to fetch match from Riot API' },
        status: 503,
      }
    }

    const patchAccepted = await isPatchAccepted(matchRecord.patch)
    const results: Record<string, number | null> = {}
    const updates: Array<{ puuid: string; updatedMatchData: any }> = []
    const statsToIncrement: ParticipantStatsInput[] = []

    // Pre-calculate team kills for kill participation
    const teamKills: Record<number, number> = {}
    const teamDamage: Record<number, number> = {}
    if (matchData?.info?.participants) {
      for (const p of matchData.info.participants) {
        teamKills[p.teamId] = (teamKills[p.teamId] || 0) + (p.kills || 0)
        teamDamage[p.teamId] = (teamDamage[p.teamId] || 0) + (p.totalDamageDealtToChampions || 0)
      }
    }

    // process each participant
    for (let idx = 0; idx < participants.length; idx++) {
      const participant = participants[idx]
      const matchParticipant = matchData?.info?.participants?.find((p: any) => p.puuid === participant.puuid)

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
      const itemPurchases = extractItemTimeline(timeline, participantId)

      const buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
      const firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null

      // extract kill/death quality scores from timeline
      const killDeathSummary = getKillDeathSummary(timeline, participantId, matchParticipant.teamId)

      // calculate pig score with breakdown
      let pigScore = participant.match_data?.pigScore ?? null
      let pigScoreBreakdown = participant.match_data?.pigScoreBreakdown ?? null

      console.log(`[EnrichMatch] ${participant.champion_name}: buildOrderStr=${buildOrderStr?.slice(0,50)}, firstBuyStr=${firstBuyStr}`)

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
            kills: matchParticipant.kills || 0,
            assists: matchParticipant.assists || 0,
            teamTotalKills: teamKills[matchParticipant.teamId] || 0,
            teamTotalDamage: teamDamage[matchParticipant.teamId] || 0,
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
            buildOrder: buildOrderStr || undefined,
            firstBuy: firstBuyStr || undefined,
            deathQualityScore: killDeathSummary.deathScore,
          })

          if (breakdown) {
            pigScore = breakdown.finalScore
            pigScoreBreakdown = breakdown
            console.log(`[EnrichMatch] ${participant.champion_name}: coreKey=${breakdown.coreKey}, startingDetails=${!!breakdown.startingItemsDetails}, itemDetails=${breakdown.itemDetails?.length}`)
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
          totalHealsOnTeammates:
            matchParticipant.totalHealsOnTeammates || participant.match_data?.stats?.totalHealsOnTeammates || 0,
          totalDamageShieldedOnTeammates:
            matchParticipant.totalDamageShieldedOnTeammates ||
            participant.match_data?.stats?.totalDamageShieldedOnTeammates ||
            0,
        },
      }

      updates.push({ puuid: participant.puuid, updatedMatchData })

      // prepare champion stats increment (only if patch is accepted and not already enriched)
      if (patchAccepted && !anyHasTimeline) {
        const buildOrderForStats = buildOrder.filter(id => isFinishedItem(id)).slice(0, 6)
        const skillOrder = abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : ''
        const itemsForStats =
          buildOrderForStats.length > 0
            ? buildOrderForStats
            : [
                matchParticipant.item0,
                matchParticipant.item1,
                matchParticipant.item2,
                matchParticipant.item3,
                matchParticipant.item4,
                matchParticipant.item5,
              ].filter((id: number) => id > 0 && isFinishedItem(id))

        const runes = {
          primary: {
            style: matchParticipant.perks?.styles?.[0]?.style || 0,
            perks: matchParticipant.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0, 0, 0, 0],
          },
          secondary: {
            style: matchParticipant.perks?.styles?.[1]?.style || 0,
            perks: matchParticipant.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0, 0],
          },
          statPerks: [
            matchParticipant.perks?.statPerks?.offense || 0,
            matchParticipant.perks?.statPerks?.flex || 0,
            matchParticipant.perks?.statPerks?.defense || 0,
          ],
        }

        statsToIncrement.push({
          champion_name: participant.champion_name,
          patch: matchRecord.patch,
          win: matchParticipant.win,
          items: itemsForStats,
          first_buy: firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null,
          keystone_id: runes.primary.perks[0] || 0,
          rune1: runes.primary.perks[1] || 0,
          rune2: runes.primary.perks[2] || 0,
          rune3: runes.primary.perks[3] || 0,
          rune4: runes.secondary.perks[0] || 0,
          rune5: runes.secondary.perks[1] || 0,
          rune_tree_primary: runes.primary.style,
          rune_tree_secondary: runes.secondary.style,
          stat_perk0: runes.statPerks[0],
          stat_perk1: runes.statPerks[1],
          stat_perk2: runes.statPerks[2],
          spell1_id: matchParticipant.summoner1Id || 0,
          spell2_id: matchParticipant.summoner2Id || 0,
          skill_order: skillOrder || null,
          damage_to_champions: matchParticipant.totalDamageDealtToChampions || 0,
          total_damage: matchParticipant.totalDamageDealt || 0,
          healing: matchParticipant.totalHealsOnTeammates || 0,
          shielding: matchParticipant.totalDamageShieldedOnTeammates || 0,
          cc_time: matchParticipant.timeCCingOthers || 0,
          game_duration: matchRecord.game_duration || 0,
          deaths: matchParticipant.deaths || 0,
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
      console.log(`[EnrichMatch] Adding champion stats for ${statsToIncrement.length} participants to aggregator...`)
      for (const stats of statsToIncrement) {
        statsAggregator.add(stats)
        statsUpdated++
      }

      // flush aggregated stats immediately since this is on-demand enrichment
      const flushResult = await flushAggregatedStats()
      if (!flushResult.success && flushResult.error) {
        console.error(`[EnrichMatch] Failed to flush champion stats:`, flushResult.error)
      } else {
        console.log(`[EnrichMatch] Flushed ${flushResult.count} champion stats to database`)
      }
    }

    console.log(
      `[EnrichMatch] Enriched match ${matchId}: ${updates.length} participants updated, ${statsUpdated} stats incremented`
    )

    return {
      data: { results, enriched: updates.length, statsUpdated, cached: false },
      status: 200,
    }
  } catch (error) {
    console.error('[EnrichMatch] Error:', error)
    return {
      data: { error: 'Failed to enrich match' },
      status: 500,
    }
  }
}
