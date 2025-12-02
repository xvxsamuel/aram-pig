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

// Define types for match data to avoid type mismatches
interface MatchData {
  pigScoreBreakdown?: unknown
  teamId?: number
  kills?: number
  assists?: number
  deaths?: number
  stats?: {
    damage?: number
    totalDamageDealt?: number
    totalHealsOnTeammates?: number
    totalDamageShieldedOnTeammates?: number
    timeCCingOthers?: number
  }
  items?: number[]
  runes?: {
    primary?: {
      perks?: number[]
    }
  }
  spells?: number[]
  abilityOrder?: string
  buildOrder?: string | { itemId: number; timestamp: number }[] // Can be string (new) or array (legacy)
  firstBuy?: string // comma-separated starting item IDs
}

interface ParticipantRecord {
  puuid: string
  match_data: MatchData
  patch: string
  champion_name: string
}

// buildOrder is already stored as a comma-separated string in match_data
// Just pass it through, ensuring it's a string or undefined
function formatBuildOrderForScoring(buildOrder: string | { itemId: number; timestamp: number }[] | undefined): string | undefined {
  if (!buildOrder) return undefined
  // If it's already a string, return it
  if (typeof buildOrder === 'string') return buildOrder
  // If it's an array (legacy format), convert it
  if (Array.isArray(buildOrder) && buildOrder.length > 0) {
    return buildOrder.map(b => b.itemId).join(',')
  }
  return undefined
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get('matchId')
    const puuid = searchParams.get('puuid')

    if (!matchId || !puuid) {
      return NextResponse.json({ error: 'matchId and puuid are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    console.log(`[pig-score-breakdown] Request for matchId=${matchId}, puuid=${puuid.slice(0, 8)}...`)

    // CONSOLIDATED QUERY: Fetch all match data in parallel
    // This ensures we get consistent data from the same point in time
    const [participantsResult, matchResult] = await Promise.all([
      // Get ALL participants for this match (includes our player + teammates for team kills)
      supabase
        .from('summoner_matches')
        .select('puuid, match_data, patch, champion_name')
        .eq('match_id', matchId),
      // Get match record for game_duration
      supabase.from('matches').select('game_duration, patch').eq('match_id', matchId).single(),
    ])

    if (participantsResult.error || !participantsResult.data) {
      console.log(`[pig-score-breakdown] Failed to fetch participants`)
      return NextResponse.json({ error: 'Failed to fetch match participants' }, { status: 404 })
    }

    if (matchResult.error || !matchResult.data) {
      console.log(`[pig-score-breakdown] Match record not found`)
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 })
    }

    const allParticipants = participantsResult.data as ParticipantRecord[]
    const matchRecord = matchResult.data

    // Find our specific player from the participants
    const participantData = allParticipants.find(p => p.puuid === puuid)

    if (!participantData) {
      console.log(`[pig-score-breakdown] Participant not found in match`)
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Use consistent patch - prefer match record patch, fallback to participant patch
    const patch = matchRecord.patch || participantData.patch

    // Check if breakdown is already cached in match_data
    // Use cache if it has itemDetails, startingItemsDetails (when firstBuy is available), and coreKey
    const cachedBreakdown = participantData.match_data?.pigScoreBreakdown as { 
      itemDetails?: unknown[]
      startingItemsDetails?: unknown
      coreKey?: string
    } | undefined
    const hasFirstBuy = !!participantData.match_data?.firstBuy
    const cacheHasStartingDetails = !!cachedBreakdown?.startingItemsDetails
    const cacheHasCoreKey = cachedBreakdown?.coreKey !== undefined
    // Cache must have coreKey, and if match has firstBuy, must have startingItemsDetails
    const isCacheValid = cachedBreakdown && 
      Array.isArray(cachedBreakdown.itemDetails) && 
      cachedBreakdown.itemDetails.length > 0 &&
      cacheHasCoreKey &&
      (!hasFirstBuy || cacheHasStartingDetails)
    
    console.log(`[pig-score-breakdown] Cache check: hasFirstBuy=${hasFirstBuy}, cacheHasCoreKey=${cacheHasCoreKey}, cacheHasStartingDetails=${cacheHasStartingDetails}, cachedCoreKey=${cachedBreakdown?.coreKey}, isCacheValid=${isCacheValid}`)
    console.log(`[pig-score-breakdown] Match data: buildOrder=${participantData.match_data?.buildOrder?.slice(0,50)}, firstBuy=${participantData.match_data?.firstBuy}`)
    
    if (isCacheValid) {
      console.log(`[pig-score-breakdown] CACHE HIT - returning stored breakdown`)
      return NextResponse.json(cachedBreakdown)
    }

    console.log(
      `[pig-score-breakdown] CACHE MISS - calculating breakdown for ${participantData.champion_name} on patch ${patch}...`
    )

    // Calculate team kills from the already-fetched participants
    let teamTotalKills = 0
    const playerTeamId = participantData.match_data?.teamId

    if (playerTeamId !== undefined) {
      for (const p of allParticipants) {
        if (p.match_data?.teamId === playerTeamId) {
          teamTotalKills += p.match_data?.kills || 0
        }
      }
    }

    const playerKills = participantData.match_data?.kills || 0
    const playerAssists = participantData.match_data?.assists || 0
    const matchData = participantData.match_data

    // Require build order (from timeline) for accurate scoring
    if (!matchData?.buildOrder) {
      console.log(`[pig-score-breakdown] No build order available - cannot calculate accurate breakdown`)
      return NextResponse.json({ error: 'No timeline data available' }, { status: 404 })
    }

    // Calculate pig score with breakdown using consistent patch
    const breakdown = await calculatePigScoreWithBreakdown({
      championName: participantData.champion_name,
      damage_dealt_to_champions: matchData.stats?.damage || 0,
      total_damage_dealt: matchData.stats?.totalDamageDealt || 0,
      total_heals_on_teammates: matchData.stats?.totalHealsOnTeammates || 0,
      total_damage_shielded_on_teammates: matchData.stats?.totalDamageShieldedOnTeammates || 0,
      time_ccing_others: matchData.stats?.timeCCingOthers || 0,
      game_duration: matchRecord.game_duration,
      deaths: matchData.deaths || 0,
      kills: playerKills,
      assists: playerAssists,
      teamTotalKills: teamTotalKills,
      item0: matchData.items?.[0] || 0,
      item1: matchData.items?.[1] || 0,
      item2: matchData.items?.[2] || 0,
      item3: matchData.items?.[3] || 0,
      item4: matchData.items?.[4] || 0,
      item5: matchData.items?.[5] || 0,
      perk0: matchData.runes?.primary?.perks?.[0] || 0,
      patch: patch,
      spell1: matchData.spells?.[0],
      spell2: matchData.spells?.[1],
      skillOrder: extractSkillOrderFromAbilityOrder(matchData.abilityOrder),
      buildOrder: formatBuildOrderForScoring(matchData.buildOrder),
      firstBuy: matchData.firstBuy,
    })

    if (!breakdown) {
      console.log(`[pig-score-breakdown] Failed to calculate breakdown`)
      return NextResponse.json({ error: 'Could not calculate pig score breakdown' }, { status: 500 })
    }

    console.log(`[pig-score-breakdown] Calculated breakdown, caching to DB...`)

    // Cache the breakdown in match_data for future requests
    const updatedMatchData = {
      ...matchData,
      pigScoreBreakdown: breakdown,
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
