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
      .select('champion_name, win, kills, deaths, assists, damage_dealt_to_champions, pig_score, game_ended_in_early_surrender')
      .eq('puuid', puuid)
      .eq('game_ended_in_early_surrender', false)
      .order('match_id', { ascending: false })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
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
    
    matchStats?.forEach(match => {
      const existing = championStats.get(match.champion_name)
      
      if (existing) {
        existing.games++
        existing.wins += match.win ? 1 : 0
        existing.kills += match.kills
        existing.deaths += match.deaths
        existing.assists += match.assists
        existing.totalDamage += match.damage_dealt_to_champions || 0
        if (match.pig_score !== null && match.pig_score !== undefined) {
          existing.pigScores.push(match.pig_score)
        }
      } else {
        championStats.set(match.champion_name, {
          games: 1,
          wins: match.win ? 1 : 0,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          totalDamage: match.damage_dealt_to_champions || 0,
          pigScores: match.pig_score !== null && match.pig_score !== undefined ? [match.pig_score] : []
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
