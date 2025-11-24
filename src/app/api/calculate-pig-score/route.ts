import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../lib/supabase'
import { calculatePigScore } from '../../../lib/pig-score-v2'
import { getLatestPatches } from '../../../lib/riot-patches'

export async function POST(request: Request) {
  try {
    const { matchId, puuid } = await request.json()
    
    if (!matchId || !puuid) {
      return NextResponse.json(
        { error: 'matchId and puuid are required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    // Get the participant data
    const { data: participantData, error: participantError } = await supabase
      .from('summoner_matches')
      .select('match_data, patch, champion_name')
      .eq('match_id', matchId)
      .eq('puuid', puuid)
      .single()
    
    if (participantError || !participantData) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      )
    }
    
    // Check if already has pig score
    if (participantData.match_data?.pigScore !== null && participantData.match_data?.pigScore !== undefined) {
      return NextResponse.json({ 
        pigScore: participantData.match_data.pigScore,
        cached: true 
      })
    }
    
    // Get game_duration from matches table
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
    
    // get latest 3 patches to determine if match is recent enough
    const latestPatches = await getLatestPatches()
    const last3Patches = latestPatches.slice(0, 3)
    
    if (!last3Patches.includes(participantData.patch)) {
      return NextResponse.json({ 
        pigScore: null,
        reason: 'Match is older than last 3 patches' 
      })
    }
    
    // Calculate pig score
    const pigScore = await calculatePigScore({
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
      patch: participantData.patch
    })
    
    // Store the calculated pig score
    if (pigScore !== null) {
      const updatedMatchData = {
        ...participantData.match_data,
        pigScore
      }
      
      await supabase
        .from('summoner_matches')
        .update({ match_data: updatedMatchData })
        .eq('match_id', matchId)
        .eq('puuid', puuid)
    }
    
    return NextResponse.json({ pigScore, cached: false })
    
  } catch (error) {
    console.error('Calculate pig score error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate pig score' },
      { status: 500 }
    )
  }
}

// Batch calculation for match details
export async function PUT(request: Request) {
  try {
    const { matchId } = await request.json()
    
    if (!matchId) {
      return NextResponse.json(
        { error: 'matchId is required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    // Get all participants for this match
    const { data: participants, error: participantsError } = await supabase
      .from('summoner_matches')
      .select('puuid, match_data, patch, champion_name')
      .eq('match_id', matchId)
    
    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      )
    }
    
    // Get game_duration from matches table
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
    
    // Get latest 3 patches
    const latestPatches = await getLatestPatches()
    const last3Patches = latestPatches.slice(0, 3)
    
    const results: Record<string, number | null> = {}
    const updates: Array<{ puuid: string; pigScore: number }> = []
    
    for (const participant of participants) {
      // Skip if already has pig score
      if (participant.match_data?.pigScore !== null && participant.match_data?.pigScore !== undefined) {
        results[participant.puuid] = participant.match_data.pigScore
        continue
      }
      
      // Skip if match is too old
      if (!last3Patches.includes(participant.patch)) {
        results[participant.puuid] = null
        continue
      }
      
      // Calculate pig score
      const pigScore = await calculatePigScore({
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
        patch: participant.patch
      })
      
      results[participant.puuid] = pigScore
      
      if (pigScore !== null) {
        updates.push({ puuid: participant.puuid, pigScore })
      }
    }
    
    // Batch update all participants
    for (const update of updates) {
      const participant = participants.find(p => p.puuid === update.puuid)
      if (participant) {
        const updatedMatchData = {
          ...participant.match_data,
          pigScore: update.pigScore
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
    return NextResponse.json(
      { error: 'Failed to calculate pig scores' },
      { status: 500 }
    )
  }
}
