import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// get summoner stats and match data
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const puuid = searchParams.get('puuid')
  
  if (!puuid) {
    return NextResponse.json({ error: 'Missing puuid' }, { status: 400 })
  }

  try {
    console.log(`[summoner-stats] Fetching stats for puuid: ${puuid}`)
    
    // get basic summoner info
    const { data: summonerRecord } = await supabase
      .from("summoners")
      .select("last_updated")
      .eq("puuid", puuid)
      .single()

    console.log(`[summoner-stats] Found summoner record:`, summonerRecord ? 'yes' : 'no')

    const lastUpdated = summonerRecord?.last_updated || null

    // get lightweight match stats from summoner_matches (with JSONB)
    const { data: allMatchStats, error: statsError } = await supabase
      .from("summoner_matches")
      .select("match_id, champion_name, win, match_data")
      .eq("puuid", puuid)
      .order("match_id", { ascending: false })

    console.log(`[summoner-stats] Query result:`, {
      error: statsError?.message,
      dataLength: allMatchStats?.length,
      firstMatchId: allMatchStats?.[0]?.match_id
    })
    console.log(`[summoner-stats] Found ${allMatchStats?.length || 0} matches for puuid ${puuid.substring(0, 20)}...`)

    if (statsError || !allMatchStats) {
      console.error('[summoner-stats] Error fetching stats:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const matchIds = allMatchStats.map(m => m.match_id)
    
    // Get game durations from matches table
    const { data: matchesData } = await supabase
      .from("matches")
      .select("match_id, game_duration, game_creation")
      .in("match_id", matchIds)
    
    const matchDurationMap = new Map(matchesData?.map(m => [m.match_id, m.game_duration]) || [])
    const matchDateMap = new Map(matchesData?.map(m => [m.match_id, m.game_creation]) || [])
    
    // filter out remakes from stats calculation
    const validMatches = allMatchStats.filter(m => !m.match_data?.isRemake)
    
    const totalGames = validMatches.length
    const wins = validMatches.filter(m => m.win).length
    const totalKills = validMatches.reduce((sum, m) => sum + (m.match_data?.kills || 0), 0)
    const totalDeaths = validMatches.reduce((sum, m) => sum + (m.match_data?.deaths || 0), 0)
    const totalAssists = validMatches.reduce((sum, m) => sum + (m.match_data?.assists || 0), 0)
    const totalDamage = validMatches.reduce((sum, m) => sum + (m.match_data?.stats?.damage || 0), 0)
    const totalGameDuration = validMatches.reduce((sum, m) => sum + (matchDurationMap.get(m.match_id) || 0), 0)
    const totalDoubleKills = validMatches.reduce((sum, m) => sum + (m.match_data?.stats?.doubleKills || 0), 0)
    const totalTripleKills = validMatches.reduce((sum, m) => sum + (m.match_data?.stats?.tripleKills || 0), 0)
    const totalQuadraKills = validMatches.reduce((sum, m) => sum + (m.match_data?.stats?.quadraKills || 0), 0)
    const totalPentaKills = validMatches.reduce((sum, m) => sum + (m.match_data?.stats?.pentaKills || 0), 0)

    // calculate average pig score (calculated on-demand, not stored)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    
    let averagePigScore: number | null = null
    let pigScoreGames = 0

    // find most played champion
    const championCounts: { [key: string]: number } = {}
    validMatches.forEach(m => {
      championCounts[m.champion_name] = (championCounts[m.champion_name] || 0) + 1
    })
    const mostPlayedChampion = Object.entries(championCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || ''

    // calculate longest win streak
    let longestWinStreak = 0
    let currentWinStreak = 0
    validMatches.forEach(m => {
      if (m.win) {
        currentWinStreak++
        if (currentWinStreak > longestWinStreak) {
          longestWinStreak = currentWinStreak
        }
      } else {
        currentWinStreak = 0
      }
    })
    
    // fetch full match data for first 20
    let matches: any[] = []
    if (matchIds.length > 0) {
      const displayMatchIds = matchIds.slice(0, 20)
      
      const { data: matchRecords } = await supabase
        .from("matches")
        .select("match_id, game_creation, game_duration, patch")
        .in("match_id", displayMatchIds)

      const { data: participants } = await supabase
        .from("summoner_matches")
        .select("*")
        .in("match_id", displayMatchIds)

      console.log(`[summoner-stats] Fetched ${matchRecords?.length || 0} match records and ${participants?.length || 0} participants for display`)

      if (matchRecords && participants) {
        matches = displayMatchIds.map(matchId => {
          const match = matchRecords.find(m => m.match_id === matchId)
          const matchParticipants = participants.filter(p => p.match_id === matchId)
          
          if (!match || matchParticipants.length === 0) return null

          return {
            metadata: {
              matchId: match.match_id,
              participants: matchParticipants.map(p => p.puuid)
            },
            info: {
              gameCreation: match.game_creation,
              gameDuration: match.game_duration,
              gameEndTimestamp: match.game_creation + (match.game_duration * 1000),
              gameMode: "ARAM",
              queueId: 450,
              participants: matchParticipants.map(p => ({
                puuid: p.puuid,
                summonerName: "",
                riotIdGameName: p.riot_id_game_name || "",
                riotIdTagline: p.riot_id_tagline || "",
                championName: p.champion_name,
                championId: 0,
                teamId: p.match_data?.teamId || 100,
                win: p.win,
                gameEndedInEarlySurrender: p.match_data?.isRemake || false,
                kills: p.match_data?.kills || 0,
                deaths: p.match_data?.deaths || 0,
                assists: p.match_data?.assists || 0,
                champLevel: p.match_data?.level || 18,
                totalDamageDealtToChampions: p.match_data?.stats?.damage || 0,
                totalDamageDealt: 0,
                totalDamageTaken: 0,
                goldEarned: p.match_data?.stats?.gold || 0,
                totalMinionsKilled: p.match_data?.stats?.cs || 0,
                neutralMinionsKilled: 0,
                summoner1Id: p.match_data?.spells?.[0] || 0,
                summoner2Id: p.match_data?.spells?.[1] || 0,
                item0: p.match_data?.items?.[0] || 0,
                item1: p.match_data?.items?.[1] || 0,
                item2: p.match_data?.items?.[2] || 0,
                item3: p.match_data?.items?.[3] || 0,
                item4: p.match_data?.items?.[4] || 0,
                item5: p.match_data?.items?.[5] || 0,
                item6: 0,
                perks: {
                  statPerks: {
                    offense: p.match_data?.runes?.statPerks?.[0] || 0,
                    flex: p.match_data?.runes?.statPerks?.[1] || 0,
                    defense: p.match_data?.runes?.statPerks?.[2] || 0
                  },
                  styles: [
                    {
                      style: p.match_data?.runes?.primary?.style || 0,
                      selections: [
                        { perk: p.match_data?.runes?.primary?.perks?.[0] || 0 },
                        { perk: p.match_data?.runes?.primary?.perks?.[1] || 0 },
                        { perk: p.match_data?.runes?.primary?.perks?.[2] || 0 },
                        { perk: p.match_data?.runes?.primary?.perks?.[3] || 0 }
                      ]
                    },
                    {
                      style: p.match_data?.runes?.secondary?.style || 0,
                      selections: [
                        { perk: p.match_data?.runes?.secondary?.perks?.[0] || 0 },
                        { perk: p.match_data?.runes?.secondary?.perks?.[1] || 0 }
                      ]
                    }
                  ]
                },
                doubleKills: p.match_data?.stats?.doubleKills || 0,
                tripleKills: p.match_data?.stats?.tripleKills || 0,
                quadraKills: p.match_data?.stats?.quadraKills || 0,
                pentaKills: p.match_data?.stats?.pentaKills || 0,
                pigScore: p.match_data?.pigScore ?? null
              }))
            }
          }
        }).filter(m => m !== null)
      }
    }

    return NextResponse.json({
      lastUpdated,
      totalGames,
      wins,
      totalKills,
      totalDeaths,
      totalAssists,
      mostPlayedChampion,
      longestWinStreak,
      totalDamage,
      totalGameDuration,
      totalDoubleKills,
      totalTripleKills,
      totalQuadraKills,
      totalPentaKills,
      averagePigScore,
      pigScoreGames,
      matches
    })

  } catch (error) {
    console.error('Error fetching summoner stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
