import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import { calculatePigScore, calculatePigScoreWithBreakdown } from '@/lib/scoring'

// extract skill max order from ability order string (e.g., "q w e q w r q w q w r w w e e r e e" -> "qwe")
function extractSkillOrderFromAbilityOrder(abilityOrder: string | null | undefined): string | undefined {
  if (!abilityOrder) return undefined

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
  if (result.length < 2) return undefined
  if (result.length === 2) {
    const abilities = ['q', 'w', 'e']
    const missing = abilities.find(a => !result.includes(a))
    return missing ? result + missing : result
  }
  return result
}

export async function POST(request: Request) {
  try {
    const { matchId, puuid } = await request.json()

    if (!matchId || !puuid) {
      return NextResponse.json({ error: 'matchId and puuid are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // get the participant data
    const { data: participantData, error: participantError } = await supabase
      .from('summoner_matches')
      .select('match_data, patch, champion_name')
      .eq('match_id', matchId)
      .eq('puuid', puuid)
      .single()

    if (participantError || !participantData) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // always return cached pig score if it exists
    if (participantData.match_data?.pigScore !== null && participantData.match_data?.pigScore !== undefined) {
      return NextResponse.json({
        pigScore: participantData.match_data.pigScore,
        cached: true,
      })
    }

    // get match record for game_duration and game_creation
    const { data: matchRecord, error: matchError } = await supabase
      .from('matches')
      .select('game_duration, game_creation')
      .eq('match_id', matchId)
      .single()

    if (matchError || !matchRecord) {
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 })
    }

    // only calculate pig scores for matches within 1 year
    // timeline data is available for historical matches
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
    if (matchRecord.game_creation < oneYearAgo) {
      return NextResponse.json({
        pigScore: null,
        reason: 'Match older than 1 year - timeline data not available',
      })
    }

    // calculate pig score
    const breakdown = await calculatePigScoreWithBreakdown({
      championName: participantData.champion_name,
      damage_dealt_to_champions: participantData.match_data.stats?.damage || 0,
      total_damage_dealt: participantData.match_data.stats?.totalDamageDealt || 0,
      total_heals_on_teammates: participantData.match_data.stats?.totalHealsOnTeammates || 0,
      total_damage_shielded_on_teammates: participantData.match_data.stats?.totalDamageShieldedOnTeammates || 0,
      time_ccing_others: participantData.match_data.stats?.timeCCingOthers || 0,
      game_duration: matchRecord.game_duration || 0,
      deaths: participantData.match_data.deaths || 0,
      item0: participantData.match_data.items?.[0] || 0,
      item1: participantData.match_data.items?.[1] || 0,
      item2: participantData.match_data.items?.[2] || 0,
      item3: participantData.match_data.items?.[3] || 0,
      item4: participantData.match_data.items?.[4] || 0,
      item5: participantData.match_data.items?.[5] || 0,
      perk0: participantData.match_data.runes?.primary?.perks?.[0] || 0,
      patch: participantData.patch,
      teamTotalDamage: participantData.match_data.stats?.teamDamage || 0,
      // new fields
      spell1: participantData.match_data.spells?.[0] || 0,
      spell2: participantData.match_data.spells?.[1] || 0,
      skillOrder: extractSkillOrderFromAbilityOrder(participantData.match_data.abilityOrder),
      buildOrder: participantData.match_data.buildOrder || undefined,
    })

    const pigScore = breakdown?.finalScore ?? null

    // store the calculated pig score
    if (pigScore !== null) {
      const updatedMatchData = {
        ...participantData.match_data,
        pigScore,
        pigScoreBreakdown: breakdown,
      }

      await supabase
        .from('summoner_matches')
        .update({ match_data: updatedMatchData })
        .eq('match_id', matchId)
        .eq('puuid', puuid)
    }

    return NextResponse.json({ pigScore, pigScoreBreakdown: breakdown, cached: false })
  } catch (error) {
    console.error('Calculate pig score error:', error)
    return NextResponse.json({ error: 'Failed to calculate pig score' }, { status: 500 })
  }
}

// batch calculation for match details
export async function PUT(request: Request) {
  try {
    const { matchId } = await request.json()

    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // get all participants for this match
    const { data: participants, error: participantsError } = await supabase
      .from('summoner_matches')
      .select('puuid, match_data, patch, champion_name')
      .eq('match_id', matchId)

    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    // get game_duration and game_creation from matches table
    const { data: matchRecord, error: matchError } = await supabase
      .from('matches')
      .select('game_duration, game_creation')
      .eq('match_id', matchId)
      .single()

    if (matchError || !matchRecord) {
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 })
    }

    // check if match is older than 1 year
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
    const isOlderThan1Year = matchRecord.game_creation < oneYearAgo

    const results: Record<string, number | null> = {}
    const updates: Array<{ puuid: string; pigScore: number; pigScoreBreakdown: any }> = []

    for (const participant of participants) {
      // always return cached pig score if it exists
      if (participant.match_data?.pigScore !== null && participant.match_data?.pigScore !== undefined) {
        results[participant.puuid] = participant.match_data.pigScore
        continue
      }

      // skip calculation for old matches - timeline data not available
      if (isOlderThan1Year) {
        results[participant.puuid] = null
        continue
      }

      // calculate pig score
      const breakdown = await calculatePigScoreWithBreakdown({
        championName: participant.champion_name,
        damage_dealt_to_champions: participant.match_data.stats?.damage || 0,
        total_damage_dealt: participant.match_data.stats?.totalDamageDealt || 0,
        total_heals_on_teammates: participant.match_data.stats?.totalHealsOnTeammates || 0,
        total_damage_shielded_on_teammates: participant.match_data.stats?.totalDamageShieldedOnTeammates || 0,
        time_ccing_others: participant.match_data.stats?.timeCCingOthers || 0,
        game_duration: matchRecord.game_duration || 0,
        deaths: participant.match_data.deaths || 0,
        item0: participant.match_data.items?.[0] || 0,
        item1: participant.match_data.items?.[1] || 0,
        item2: participant.match_data.items?.[2] || 0,
        item3: participant.match_data.items?.[3] || 0,
        item4: participant.match_data.items?.[4] || 0,
        item5: participant.match_data.items?.[5] || 0,
        perk0: participant.match_data.runes?.primary?.perks?.[0] || 0,
        patch: participant.patch,
        teamTotalDamage: participant.match_data.stats?.teamDamage || 0,
        spell1: participant.match_data.spells?.[0] || 0,
        spell2: participant.match_data.spells?.[1] || 0,
        skillOrder: extractSkillOrderFromAbilityOrder(participant.match_data.abilityOrder),
        buildOrder: participant.match_data.buildOrder || undefined,
      })

      const pigScore = breakdown?.finalScore ?? null
      results[participant.puuid] = pigScore

      if (pigScore !== null) {
        updates.push({ puuid: participant.puuid, pigScore, pigScoreBreakdown: breakdown })
      }
    }

    // batch update all participants
    for (const update of updates) {
      const participant = participants.find(p => p.puuid === update.puuid)
      if (participant) {
        const updatedMatchData = {
          ...participant.match_data,
          pigScore: update.pigScore,
          pigScoreBreakdown: update.pigScoreBreakdown,
        }

        await supabase
          .from('summoner_matches')
          .update({ match_data: updatedMatchData })
          .eq('match_id', matchId)
          .eq('puuid', update.puuid)
      }
    }

    return NextResponse.json({ results, updated: updates.length })
  } catch (error) {
    console.error('Batch calculate pig score error:', error)
    return NextResponse.json({ error: 'Failed to calculate pig scores' }, { status: 500 })
  }
}
