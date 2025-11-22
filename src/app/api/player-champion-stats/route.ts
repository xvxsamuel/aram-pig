// fetch player champion stats from database
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const puuid = searchParams.get('puuid')
  
  if (!puuid) {
    return NextResponse.json({ error: 'puuid required' }, { status: 400 })
  }
  
  try {
    // get all match stats for this player (excluding remakes)
    const { data: matchStats, error } = await supabase
      .from('summoner_matches')
      .select('champion_name, win, match_data')
      .eq('puuid', puuid)
      .order('match_id', { ascending: false })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // filter out remakes
    const validMatches = matchStats?.filter(m => !m.match_data?.isRemake) || []
    
    // aggregate by champion
    const championStats = new Map<string, {
      games: number
      wins: number
      kills: number
      deaths: number
      assists: number
      totalDamage: number
      pigScores: number[]
    }>()
    
    validMatches.forEach(match => {
      const existing = championStats.get(match.champion_name)
      
      if (existing) {
        existing.games++
        existing.wins += match.win ? 1 : 0
        existing.kills += match.match_data?.kills || 0
        existing.deaths += match.match_data?.deaths || 0
        existing.assists += match.match_data?.assists || 0
        existing.totalDamage += match.match_data?.stats?.damage || 0
        if (match.match_data?.pigScore !== null && match.match_data?.pigScore !== undefined) {
          existing.pigScores.push(match.match_data.pigScore)
        }
      } else {
        championStats.set(match.champion_name, {
          games: 1,
          wins: match.win ? 1 : 0,
          kills: match.match_data?.kills || 0,
          deaths: match.match_data?.deaths || 0,
          assists: match.match_data?.assists || 0,
          totalDamage: match.match_data?.stats?.damage || 0,
          pigScores: match.match_data?.pigScore !== null && match.match_data?.pigScore !== undefined ? [match.match_data.pigScore] : []
        })
      }
    })
    
    // format response
    const result = Array.from(championStats.entries()).map(([championName, stats]) => ({
      championName,
      games: stats.games,
      wins: stats.wins,
      losses: stats.games - stats.wins,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      totalDamage: stats.totalDamage,
      averagePigScore: stats.pigScores.length > 0 
        ? stats.pigScores.reduce((sum, score) => sum + score, 0) / stats.pigScores.length
        : null
    }))
    
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
