import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import { calculatePigScoreWithBreakdown } from '@/lib/scoring'

// extract skill max order from ability order string
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get('matchId')
    const puuid = searchParams.get('puuid')
    
    if (!matchId || !puuid) {
      return NextResponse.json(
        { error: 'matchId and puuid are required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    console.log(`[pig-score-breakdown] Request for matchId=${matchId}, puuid=${puuid.slice(0, 8)}...`)
    
    // get participant data
    const { data: participantData, error: participantError } = await supabase
      .from('summoner_matches')
      .select('match_data, patch, champion_name')
      .eq('match_id', matchId)
      .eq('puuid', puuid)
      .single()
    
    if (participantError || !participantData) {
      console.log(`[pig-score-breakdown] Participant not found`)
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }
    
    // check if breakdown is already cached in match_data
    if (participantData.match_data?.pigScoreBreakdown) {
      console.log(`[pig-score-breakdown] CACHE HIT - returning stored breakdown`)
      return NextResponse.json(participantData.match_data.pigScoreBreakdown)
    }
    
    console.log(`[pig-score-breakdown] CACHE MISS - calculating breakdown for ${participantData.champion_name}...`)
    
    // get game_duration from matches table
    const { data: matchRecord, error: matchError } = await supabase
      .from('matches')
      .select('game_duration')
      .eq('match_id', matchId)
      .single()
    
    if (matchError || !matchRecord) {
      return NextResponse.json(
        { error: 'Match record not found' },
        { status: 404 }
      )
    }
    
    // calculate pig score with breakdown
    const breakdown = await calculatePigScoreWithBreakdown({
      championName: participantData.champion_name,
      damage_dealt_to_champions: participantData.match_data.stats?.damage || 0,
      total_damage_dealt: participantData.match_data.stats?.totalDamageDealt || 0,
      total_heals_on_teammates: participantData.match_data.stats?.totalHealsOnTeammates || 0,
      total_damage_shielded_on_teammates: participantData.match_data.stats?.totalDamageShieldedOnTeammates || 0,
      time_ccing_others: participantData.match_data.stats?.timeCCingOthers || 0,
      game_duration: matchRecord.game_duration,
      deaths: participantData.match_data.deaths || 0,
      item0: participantData.match_data.items?.[0] || 0,
      item1: participantData.match_data.items?.[1] || 0,
      item2: participantData.match_data.items?.[2] || 0,
      item3: participantData.match_data.items?.[3] || 0,
      item4: participantData.match_data.items?.[4] || 0,
      item5: participantData.match_data.items?.[5] || 0,
      perk0: participantData.match_data.runes?.primary?.perks?.[0] || 0,
      patch: participantData.patch,
      spell1: participantData.match_data.spells?.[0],
      spell2: participantData.match_data.spells?.[1],
      skillOrder: extractSkillOrderFromAbilityOrder(participantData.match_data.abilityOrder),
      buildOrder: participantData.match_data.buildOrder
    })
    
    if (!breakdown) {
      console.log(`[pig-score-breakdown] Failed to calculate breakdown`)
      return NextResponse.json(
        { error: 'Could not calculate pig score breakdown' },
        { status: 500 }
      )
    }
    
    console.log(`[pig-score-breakdown] Calculated breakdown, caching to DB...`)
    
    // cache the breakdown in match_data for future requests
    const updatedMatchData = {
      ...participantData.match_data,
      pigScoreBreakdown: breakdown
    }
    
    await supabase
      .from('summoner_matches')
      .update({ match_data: updatedMatchData })
      .eq('match_id', matchId)
      .eq('puuid', puuid)
    
    console.log(`[pig-score-breakdown] Done - calculated and cached new breakdown`)
    return NextResponse.json(breakdown)
  } catch (error) {
    console.error('Error calculating pig score breakdown:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
