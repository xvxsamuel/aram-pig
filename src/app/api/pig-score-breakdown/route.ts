import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import { calculatePigScoreWithBreakdown, extractSkillOrderAbbreviation } from '@/lib/scoring'

// buildorder is already stored as a comma-separated string in match_data
// just pass it through, ensuring it's a string or undefined
function formatBuildOrderForScoring(buildOrder: string | { itemId: number; timestamp: number }[] | undefined): string | undefined {
  if (!buildOrder) return undefined
  if (typeof buildOrder === 'string') return buildOrder
  if (Array.isArray(buildOrder) && buildOrder.length > 0) {
    return buildOrder.map(b => b.itemId).join(',')
  }
  return undefined
}

// GET /api/pig-score-breakdown?matchId=...&puuid=...
// returns detailed breakdown for Performance tab
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get('matchId')
    const puuid = searchParams.get('puuid')

    if (!matchId || !puuid) {
      return NextResponse.json({ error: 'matchId and puuid are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // consolidated query: fetch all match data in parallel
    const [participantsResult, matchResult] = await Promise.all([
      supabase
        .from('summoner_matches')
        .select('puuid, match_data, patch, champion_name')
        .eq('match_id', matchId),
      supabase.from('matches').select('game_duration, patch, game_creation').eq('match_id', matchId).single(),
    ])

    if (participantsResult.error || !participantsResult.data) {
      return NextResponse.json({ error: 'Failed to fetch match participants' }, { status: 404 })
    }

    if (matchResult.error || !matchResult.data) {
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 })
    }

    const allParticipants = participantsResult.data
    const matchRecord = matchResult.data

    // check if game is older than 365 days
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
    const gameAge = Date.now() - matchRecord.game_creation
    if (gameAge > ONE_YEAR_MS) {
      return NextResponse.json({ error: 'Game is too old for detailed scoring' }, { status: 404 })
    }

    // find our specific player
    const participantData = allParticipants.find(p => p.puuid === puuid)

    if (!participantData) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    const patch = matchRecord.patch || participantData.patch

    // check if breakdown is already cached
    const cachedBreakdown = participantData.match_data?.pigScoreBreakdown as { 
      itemDetails?: unknown[]
      startingItemsDetails?: unknown
      coreKey?: string
    } | undefined
    const hasFirstBuy = !!participantData.match_data?.firstBuy
    const isCacheValid = cachedBreakdown && 
      Array.isArray(cachedBreakdown.itemDetails) && 
      cachedBreakdown.itemDetails.length > 0 &&
      cachedBreakdown.coreKey !== undefined &&
      (!hasFirstBuy || cachedBreakdown.startingItemsDetails)
    
    if (isCacheValid) {
      return NextResponse.json(cachedBreakdown)
    }

    // calculate team kills
    let teamTotalKills = 0
    const playerTeamId = participantData.match_data?.teamId

    if (playerTeamId !== undefined) {
      for (const p of allParticipants) {
        if (p.match_data?.teamId === playerTeamId) {
          teamTotalKills += p.match_data?.kills || 0
        }
      }
    }

    const matchData = participantData.match_data

    // require build order for accurate scoring
    if (!matchData?.buildOrder) {
      return NextResponse.json({ error: 'No timeline data available' }, { status: 404 })
    }

    // calculate pig score with breakdown
    const breakdown = await calculatePigScoreWithBreakdown({
      championName: participantData.champion_name,
      damage_dealt_to_champions: matchData.stats?.damage || 0,
      total_damage_dealt: matchData.stats?.totalDamageDealt || 0,
      total_heals_on_teammates: matchData.stats?.totalHealsOnTeammates || 0,
      total_damage_shielded_on_teammates: matchData.stats?.totalDamageShieldedOnTeammates || 0,
      time_ccing_others: matchData.stats?.timeCCingOthers || 0,
      game_duration: matchRecord.game_duration,
      deaths: matchData.deaths || 0,
      kills: matchData.kills || 0,
      assists: matchData.assists || 0,
      teamTotalKills,
      item0: matchData.items?.[0] || 0,
      item1: matchData.items?.[1] || 0,
      item2: matchData.items?.[2] || 0,
      item3: matchData.items?.[3] || 0,
      item4: matchData.items?.[4] || 0,
      item5: matchData.items?.[5] || 0,
      perk0: matchData.runes?.primary?.perks?.[0] || 0,
      patch,
      spell1: matchData.spells?.[0],
      spell2: matchData.spells?.[1],
      skillOrder: extractSkillOrderAbbreviation(matchData.abilityOrder || '') || undefined,
      buildOrder: formatBuildOrderForScoring(matchData.buildOrder),
      firstBuy: matchData.firstBuy,
    })

    if (!breakdown) {
      return NextResponse.json({ error: 'Could not calculate pig score breakdown' }, { status: 500 })
    }

    // cache the breakdown
    await supabase
      .from('summoner_matches')
      .update({ match_data: { ...matchData, pigScoreBreakdown: breakdown } })
      .eq('match_id', matchId)
      .eq('puuid', puuid)

    return NextResponse.json(breakdown)
  } catch (error) {
    console.error('Error calculating pig score breakdown:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pig-score-breakdown (single participant)
// fallback calculation when enrich-match fails
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { matchId, puuid } = body

    if (!matchId || !puuid) {
      return NextResponse.json({ error: 'matchId and puuid required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const [participantsResult, matchResult] = await Promise.all([
      supabase
        .from('summoner_matches')
        .select('puuid, match_data, patch, champion_name')
        .eq('match_id', matchId),
      supabase.from('matches').select('game_duration, patch, game_creation').eq('match_id', matchId).single(),
    ])

    if (participantsResult.error || !participantsResult.data) {
      return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 404 })
    }

    if (matchResult.error || !matchResult.data) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const allParticipants = participantsResult.data
    const matchRecord = matchResult.data

    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
    const gameAge = Date.now() - matchRecord.game_creation
    if (gameAge > ONE_YEAR_MS) {
      return NextResponse.json({ error: 'Game too old' }, { status: 404 })
    }

    const participant = allParticipants.find(p => p.puuid === puuid)
    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    const patch = matchRecord.patch || participant.patch

    let teamTotalKills = 0
    const playerTeamId = participant.match_data?.teamId

    if (playerTeamId !== undefined) {
      for (const p of allParticipants) {
        if (p.match_data?.teamId === playerTeamId) {
          teamTotalKills += p.match_data?.kills || 0
        }
      }
    }

    const matchData = participant.match_data

    const breakdown = await calculatePigScoreWithBreakdown({
      championName: participant.champion_name,
      damage_dealt_to_champions: matchData?.stats?.damage || 0,
      total_damage_dealt: matchData?.stats?.totalDamageDealt || 0,
      total_heals_on_teammates: matchData?.stats?.totalHealsOnTeammates || 0,
      total_damage_shielded_on_teammates: matchData?.stats?.totalDamageShieldedOnTeammates || 0,
      time_ccing_others: matchData?.stats?.timeCCingOthers || 0,
      game_duration: matchRecord.game_duration,
      deaths: matchData?.deaths || 0,
      kills: matchData?.kills || 0,
      assists: matchData?.assists || 0,
      teamTotalKills,
      item0: matchData?.items?.[0] || 0,
      item1: matchData?.items?.[1] || 0,
      item2: matchData?.items?.[2] || 0,
      item3: matchData?.items?.[3] || 0,
      item4: matchData?.items?.[4] || 0,
      item5: matchData?.items?.[5] || 0,
      perk0: matchData?.runes?.primary?.perks?.[0] || 0,
      patch,
      spell1: matchData?.spells?.[0],
      spell2: matchData?.spells?.[1],
      skillOrder: extractSkillOrderAbbreviation(matchData?.abilityOrder || '') || undefined,
      buildOrder: formatBuildOrderForScoring(matchData?.buildOrder),
      firstBuy: matchData?.firstBuy,
    })

    if (!breakdown) {
      return NextResponse.json({ error: 'Failed to calculate breakdown' }, { status: 500 })
    }

    await supabase
      .from('summoner_matches')
      .update({ match_data: { ...matchData, pigScore: breakdown.total, pigScoreBreakdown: breakdown } })
      .eq('match_id', matchId)
      .eq('puuid', puuid)

    return NextResponse.json({ pigScore: breakdown.total, pigScoreBreakdown: breakdown })
  } catch (error) {
    console.error('POST /api/pig-score-breakdown error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/pig-score-breakdown (batch calculation for all participants)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { matchId } = body

    if (!matchId) {
      return NextResponse.json({ error: 'matchId required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const [participantsResult, matchResult] = await Promise.all([
      supabase
        .from('summoner_matches')
        .select('puuid, match_data, patch, champion_name')
        .eq('match_id', matchId),
      supabase.from('matches').select('game_duration, patch, game_creation').eq('match_id', matchId).single(),
    ])

    if (participantsResult.error || !participantsResult.data) {
      return NextResponse.json({ error: 'Failed to fetch participants' }, { status: 404 })
    }

    if (matchResult.error || !matchResult.data) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const allParticipants = participantsResult.data
    const matchRecord = matchResult.data

    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
    const gameAge = Date.now() - matchRecord.game_creation
    if (gameAge > ONE_YEAR_MS) {
      return NextResponse.json({ error: 'Game too old' }, { status: 404 })
    }

    const patch = matchRecord.patch

    const results = []

    for (const participant of allParticipants) {
      let teamTotalKills = 0
      const playerTeamId = participant.match_data?.teamId

      if (playerTeamId !== undefined) {
        for (const p of allParticipants) {
          if (p.match_data?.teamId === playerTeamId) {
            teamTotalKills += p.match_data?.kills || 0
          }
        }
      }

      const matchData = participant.match_data

      const breakdown = await calculatePigScoreWithBreakdown({
        championName: participant.champion_name,
        damage_dealt_to_champions: matchData?.stats?.damage || 0,
        total_damage_dealt: matchData?.stats?.totalDamageDealt || 0,
        total_heals_on_teammates: matchData?.stats?.totalHealsOnTeammates || 0,
        total_damage_shielded_on_teammates: matchData?.stats?.totalDamageShieldedOnTeammates || 0,
        time_ccing_others: matchData?.stats?.timeCCingOthers || 0,
        game_duration: matchRecord.game_duration,
        deaths: matchData?.deaths || 0,
        kills: matchData?.kills || 0,
        assists: matchData?.assists || 0,
        teamTotalKills,
        item0: matchData?.items?.[0] || 0,
        item1: matchData?.items?.[1] || 0,
        item2: matchData?.items?.[2] || 0,
        item3: matchData?.items?.[3] || 0,
        item4: matchData?.items?.[4] || 0,
        item5: matchData?.items?.[5] || 0,
        perk0: matchData?.runes?.primary?.perks?.[0] || 0,
        patch,
        spell1: matchData?.spells?.[0],
        spell2: matchData?.spells?.[1],
        skillOrder: extractSkillOrderAbbreviation(matchData?.abilityOrder || '') || undefined,
        buildOrder: formatBuildOrderForScoring(matchData?.buildOrder),
        firstBuy: matchData?.firstBuy,
      })

      if (breakdown) {
        await supabase
          .from('summoner_matches')
          .update({ match_data: { ...matchData, pigScore: breakdown.total, pigScoreBreakdown: breakdown } })
          .eq('match_id', matchId)
          .eq('puuid', participant.puuid)

        results.push({ puuid: participant.puuid, pigScore: breakdown.total })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('PUT /api/pig-score-breakdown error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
