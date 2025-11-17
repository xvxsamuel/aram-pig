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
    // get basic summoner info
    const { data: summonerRecord } = await supabase
      .from("summoners")
      .select("last_updated")
      .eq("puuid", puuid)
      .single()

    const lastUpdated = summonerRecord?.last_updated || null

    // get lightweight match stats from summoner_matches
    const { data: allMatchStats, error: statsError } = await supabase
      .from("summoner_matches")
      .select("match_id, champion_name, kills, deaths, assists, win, damage_dealt_to_champions, total_minions_killed, game_duration, game_ended_in_early_surrender, double_kills, triple_kills, quadra_kills, penta_kills, pig_score")
      .eq("puuid", puuid)
      .order("match_id", { ascending: false })

    if (statsError || !allMatchStats) {
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const matchIds = allMatchStats.map(m => m.match_id)
    
    // filter out remakes from stats calculation
    const validMatches = allMatchStats.filter(m => !m.game_ended_in_early_surrender)
    
    const totalGames = validMatches.length
    const wins = validMatches.filter(m => m.win).length
    const totalKills = validMatches.reduce((sum, m) => sum + m.kills, 0)
    const totalDeaths = validMatches.reduce((sum, m) => sum + m.deaths, 0)
    const totalAssists = validMatches.reduce((sum, m) => sum + m.assists, 0)
    const totalDamage = validMatches.reduce((sum, m) => sum + (m.damage_dealt_to_champions || 0), 0)
    const totalGameDuration = validMatches.reduce((sum, m) => sum + (m.game_duration || 0), 0)
    const totalDoubleKills = validMatches.reduce((sum, m) => sum + (m.double_kills || 0), 0)
    const totalTripleKills = validMatches.reduce((sum, m) => sum + (m.triple_kills || 0), 0)
    const totalQuadraKills = validMatches.reduce((sum, m) => sum + (m.quadra_kills || 0), 0)
    const totalPentaKills = validMatches.reduce((sum, m) => sum + (m.penta_kills || 0), 0)

    // calculate average pig score (only from games with pig scores, last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    const matchesWithPigScore = validMatches.filter(m => m.pig_score !== null && m.pig_score !== undefined)
    
    let averagePigScore: number | null = null
    let pigScoreGames = 0
    
    if (matchesWithPigScore.length > 0) {
      const pigScoreMatchIds = matchesWithPigScore.map(m => m.match_id)
      const { data: matchDates } = await supabase
        .from("matches")
        .select("match_id, game_creation")
        .in("match_id", pigScoreMatchIds)
      
      if (matchDates) {
        const matchDateMap = new Map(matchDates.map(m => [m.match_id, m.game_creation]))
        const recentMatchesWithPigScore = matchesWithPigScore.filter(m => {
          const matchDate = matchDateMap.get(m.match_id)
          return matchDate && matchDate >= thirtyDaysAgo
        })
        
        if (recentMatchesWithPigScore.length > 0) {
          const totalPigScore = recentMatchesWithPigScore.reduce((sum, m) => sum + (m.pig_score || 0), 0)
          averagePigScore = totalPigScore / recentMatchesWithPigScore.length
          pigScoreGames = recentMatchesWithPigScore.length
        }
      }
    }

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
        .select("match_id, game_creation, game_duration")
        .in("match_id", displayMatchIds)

      const { data: participants } = await supabase
        .from("summoner_matches")
        .select("*")
        .in("match_id", displayMatchIds)

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
                summonerName: p.summoner_name || "",
                riotIdGameName: p.riot_id_game_name || "",
                riotIdTagline: p.riot_id_tagline || "",
                championName: p.champion_name,
                championId: 0,
                teamId: p.team_id || 100,
                win: p.win,
                gameEndedInEarlySurrender: p.game_ended_in_early_surrender || false,
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                champLevel: p.champ_level || 18,
                totalDamageDealtToChampions: p.damage_dealt_to_champions || 0,
                totalDamageDealt: p.total_damage_dealt || 0,
                totalDamageTaken: p.total_damage_taken || 0,
                goldEarned: p.gold_earned || 0,
                totalMinionsKilled: p.total_minions_killed || 0,
                neutralMinionsKilled: 0,
                summoner1Id: p.summoner1_id || 0,
                summoner2Id: p.summoner2_id || 0,
                item0: p.item0 || 0,
                item1: p.item1 || 0,
                item2: p.item2 || 0,
                item3: p.item3 || 0,
                item4: p.item4 || 0,
                item5: p.item5 || 0,
                item6: p.item6 || 0,
                perks: {
                  styles: [
                    {
                      style: p.perk_primary_style || 0,
                      selections: [
                        { perk: p.perk0 || 0 },
                        { perk: p.perk1 || 0 },
                        { perk: p.perk2 || 0 },
                        { perk: p.perk3 || 0 }
                      ]
                    },
                    {
                      style: p.perk_sub_style || 0,
                      selections: [
                        { perk: p.perk4 || 0 },
                        { perk: p.perk5 || 0 }
                      ]
                    }
                  ]
                },
                doubleKills: p.double_kills || 0,
                tripleKills: p.triple_kills || 0,
                quadraKills: p.quadra_kills || 0,
                pentaKills: p.penta_kills || 0,
                pigScore: p.pig_score
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
