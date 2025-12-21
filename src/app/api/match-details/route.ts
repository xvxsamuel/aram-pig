import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import { getMatchTimeline } from '@/lib/riot/api'
import {
  PLATFORM_TO_REGIONAL,
  PlatformCode,
  extractBuildOrder,
  extractFirstBuy,
  formatBuildOrder,
  formatFirstBuy,
  extractItemTimeline,
  extractCompletedItems,
  getKillDeathSummary,
  type KillDeathSummary,
} from '@/lib/game'
import { calculatePigScore } from '@/lib/scoring'

export async function POST(request: Request) {
  try {
    const { matchId, puuid } = await request.json()

    if (!matchId || !puuid) {
      return NextResponse.json({ error: 'Missing matchId or puuid' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // get match data and participant info with item purchases
    const { data: matchData, error: matchError } = await supabase
      .from('summoner_matches')
      .select('*')
      .eq('match_id', matchId)
      .eq('puuid', puuid)
      .single()

    if (matchError || !matchData) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // check if cached itempurchases is in new format (has 'action' and 'itemname' fields)
    const cachedItemPurchases = matchData.match_data?.itemPurchases as Array<{ action?: string; itemName?: string }> | undefined
    const hasNewFormatTimeline = cachedItemPurchases?.length && 
      cachedItemPurchases[0]?.action !== undefined && 
      cachedItemPurchases[0]?.itemName !== undefined

    // if already has build_order, pig_score, completeditems, killdeathtimeline, and new format item timeline in match_data, return cached data
    if (
      matchData.match_data?.buildOrder &&
      matchData.match_data?.pigScore !== null &&
      matchData.match_data?.completedItems &&
      matchData.match_data?.killDeathTimeline &&
      hasNewFormatTimeline
    ) {
      return NextResponse.json({
        build_order: matchData.match_data.buildOrder,
        ability_order: matchData.match_data.abilityOrder || null,
        first_buy: matchData.match_data.firstBuy,
        pig_score: matchData.match_data.pigScore,
        item_timeline: matchData.match_data.itemPurchases || [],
        completed_items: matchData.match_data.completedItems,
        kill_death_timeline: matchData.match_data.killDeathTimeline,
        cached: true,
      })
    }

    // get match metadata and stored timeline_data
    const { data: match } = await supabase
      .from('matches')
      .select('patch, game_duration, timeline_data')
      .eq('match_id', matchId)
      .single()

    const patchVersion = match?.patch || '15.1'
    const gameDuration = match?.game_duration || 0

    // use stored timeline first, fall back to riot api
    let timeline = match?.timeline_data || null

    if (!timeline) {
      const platform = matchId.split('_')[0].toLowerCase() as PlatformCode
      const regionalCluster = PLATFORM_TO_REGIONAL[platform] || 'americas'

      try {
        timeline = await getMatchTimeline(matchId, regionalCluster as any, 'overhead')
      } catch (error) {
        console.error('Failed to fetch timeline:', error)
      }
    }

    if (!timeline) {
      // return without timeline data
      return NextResponse.json({
        build_order: matchData.match_data?.buildOrder || null,
        ability_order: matchData.match_data?.abilityOrder || null,
        first_buy: matchData.match_data?.firstBuy || null,
        pig_score: matchData.match_data?.pigScore ?? null,
        item_timeline: [],
        completed_items: matchData.match_data?.completedItems || [],
        kill_death_timeline: matchData.match_data?.killDeathTimeline || null,
        error: 'Timeline unavailable',
      })
    }

    // Find participant ID from timeline metadata
    // Timeline metadata.participants array contains PUUIDs in order (index + 1 = participantId)
    const timelineParticipants = (timeline as any)?.metadata?.participants as string[] | undefined
    let participantId = -1

    if (timelineParticipants) {
      const participantIndex = timelineParticipants.findIndex((p: string) => p === puuid)
      if (participantIndex !== -1) {
        participantId = participantIndex + 1
      }
    }

    // Fallback: get from database if timeline doesn't have metadata
    if (participantId === -1) {
      const { data: allParticipants } = await supabase
        .from('summoner_matches')
        .select('puuid, match_data')
        .eq('match_id', matchId)

      if (allParticipants && allParticipants.length > 0) {
        // Sort by teamId to match Riot's ordering (team 100 = 1-5, team 200 = 6-10)
        const sortedParticipants = [...allParticipants].sort((a, b) => {
          const teamA = a.match_data?.teamId || 0
          const teamB = b.match_data?.teamId || 0
          return teamA - teamB
        })

        const participantIndex = sortedParticipants.findIndex(p => p.puuid === puuid)
        if (participantIndex !== -1) {
          participantId = participantIndex + 1
        }
      }
    }

    if (participantId === -1) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Extract build order and first buy if timeline available
    let buildOrderStr = matchData.match_data?.buildOrder || null
    let firstBuyStr = matchData.match_data?.firstBuy || null

    if (!buildOrderStr && timeline) {
      const buildOrder = extractBuildOrder(timeline, participantId)
      const firstBuy = extractFirstBuy(timeline, participantId)
      buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
      firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
    }

    // Extract full item timeline for display (buy/sell events with undos removed)
    const itemTimeline = timeline ? extractItemTimeline(timeline, participantId) : []

    // Extract completed items (legendaries, boots) with timestamps for build path display
    const completedItems = timeline ? extractCompletedItems(timeline, participantId) : []

    // Extract kill/death timeline with quality scores
    const teamId = matchData.match_data?.teamId || (participantId <= 5 ? 100 : 200)
    let killDeathTimeline: KillDeathSummary | null = matchData.match_data?.killDeathTimeline || null
    if (!killDeathTimeline && timeline) {
      killDeathTimeline = getKillDeathSummary(timeline, participantId, teamId)
    }

    // Calculate PIG score if not remake
    let pigScore = matchData.match_data?.pigScore ?? null
    if (pigScore === null && !matchData.match_data?.isRemake) {
      try {
        pigScore = await calculatePigScore({
          championName: matchData.champion_name,
          damage_dealt_to_champions: matchData.match_data?.stats?.damage || 0,
          total_damage_dealt: matchData.match_data?.stats?.totalDamageDealt || 0,
          total_heals_on_teammates: matchData.match_data?.stats?.totalHealsOnTeammates || 0,
          total_damage_shielded_on_teammates: matchData.match_data?.stats?.totalDamageShieldedOnTeammates || 0,
          time_ccing_others: matchData.match_data?.stats?.timeCCingOthers || 0,
          game_duration: gameDuration,
          deaths: matchData.match_data?.deaths || 0,
          item0: matchData.match_data?.items?.[0] || 0,
          item1: matchData.match_data?.items?.[1] || 0,
          item2: matchData.match_data?.items?.[2] || 0,
          item3: matchData.match_data?.items?.[3] || 0,
          item4: matchData.match_data?.items?.[4] || 0,
          item5: matchData.match_data?.items?.[5] || 0,
          perk0: matchData.match_data?.runes?.primary?.perks?.[0] || 0,
          patch: patchVersion,
        })
      } catch (error) {
        console.error('Failed to calculate PIG score:', error)
      }
    }

    // Update database with computed values (only if they were missing)
    const updatedMatchData = {
      ...matchData.match_data,
      buildOrder: buildOrderStr || matchData.match_data?.buildOrder,
      firstBuy: firstBuyStr || matchData.match_data?.firstBuy,
      pigScore: pigScore !== null ? pigScore : matchData.match_data?.pigScore,
      itemPurchases: itemTimeline.length > 0 ? itemTimeline : matchData.match_data?.itemPurchases || [],
      completedItems: completedItems.length > 0 ? completedItems : matchData.match_data?.completedItems || [],
      killDeathTimeline: killDeathTimeline || matchData.match_data?.killDeathTimeline || null,
    }

    await supabase
      .from('summoner_matches')
      .update({ match_data: updatedMatchData })
      .eq('match_id', matchId)
      .eq('puuid', puuid)

    return NextResponse.json({
      build_order: updatedMatchData.buildOrder,
      ability_order: matchData.match_data?.abilityOrder || null,
      first_buy: updatedMatchData.firstBuy,
      pig_score: updatedMatchData.pigScore,
      item_timeline: updatedMatchData.itemPurchases,
      completed_items: updatedMatchData.completedItems,
      kill_death_timeline: updatedMatchData.killDeathTimeline,
      cached: false,
    })
  } catch (error) {
    console.error('Match details API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
