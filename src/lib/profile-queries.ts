// reusable database query functions for profile data
// centralizes all profile-related queries to avoid duplication

import { supabase } from './supabase'
import type { 
  ChampionStats, 
  ProfileSummary, 
  ProfileMatch, 
  MatchParticipant,
  RecentPlayer 
} from '@/types/profile'

/**
 * Get summoner basic info from database
 */
export async function getSummonerInfo(puuid: string) {
  const { data, error } = await supabase
    .from('summoners')
    .select('puuid, game_name, tag_line, profile_icon_id, summoner_level, last_updated, profile_data')
    .eq('puuid', puuid)
    .single()
  
  if (error || !data) return null
  
  return {
    puuid: data.puuid,
    gameName: data.game_name,
    tagLine: data.tag_line,
    profileIconId: data.profile_icon_id,
    summonerLevel: data.summoner_level,
    lastUpdated: data.last_updated,
    profileData: data.profile_data as any
  }
}

/**
 * Get champion stats - prefers cached profile_data, falls back to aggregation
 */
export async function getChampionStats(puuid: string, profileData?: any): Promise<ChampionStats[]> {
  // use cached data if available
  if (profileData?.champions && Object.keys(profileData.champions).length > 0) {
    return Object.entries(profileData.champions).map(([championName, stats]: [string, any]) => ({
      championName,
      games: stats.games,
      wins: stats.wins,
      losses: stats.games - stats.wins,
      kills: Math.round(stats.avgKills * stats.games),
      deaths: Math.round(stats.avgDeaths * stats.games),
      assists: Math.round(stats.avgAssists * stats.games),
      totalDamage: Math.round(stats.avgDamage * stats.games),
      averagePigScore: stats.avgPigScore
    }))
  }
  
  // fallback: aggregate from matches
  const { data: matchStats } = await supabase
    .from('summoner_matches')
    .select('champion_name, win, match_data')
    .eq('puuid', puuid)
  
  if (!matchStats || matchStats.length === 0) return []
  
  const validMatches = matchStats.filter(m => !m.match_data?.isRemake)
  
  const championMap = new Map<string, {
    games: number
    wins: number
    kills: number
    deaths: number
    assists: number
    totalDamage: number
    pigScores: number[]
  }>()
  
  for (const match of validMatches) {
    const existing = championMap.get(match.champion_name)
    const pigScore = match.match_data?.pigScore
    
    if (existing) {
      existing.games++
      existing.wins += match.win ? 1 : 0
      existing.kills += match.match_data?.kills || 0
      existing.deaths += match.match_data?.deaths || 0
      existing.assists += match.match_data?.assists || 0
      existing.totalDamage += match.match_data?.stats?.damage || 0
      if (pigScore !== null && pigScore !== undefined) {
        existing.pigScores.push(pigScore)
      }
    } else {
      championMap.set(match.champion_name, {
        games: 1,
        wins: match.win ? 1 : 0,
        kills: match.match_data?.kills || 0,
        deaths: match.match_data?.deaths || 0,
        assists: match.match_data?.assists || 0,
        totalDamage: match.match_data?.stats?.damage || 0,
        pigScores: pigScore !== null && pigScore !== undefined ? [pigScore] : []
      })
    }
  }
  
  return Array.from(championMap.entries()).map(([championName, stats]) => ({
    championName,
    games: stats.games,
    wins: stats.wins,
    losses: stats.games - stats.wins,
    kills: stats.kills,
    deaths: stats.deaths,
    assists: stats.assists,
    totalDamage: stats.totalDamage,
    averagePigScore: stats.pigScores.length > 0 
      ? stats.pigScores.reduce((a, b) => a + b, 0) / stats.pigScores.length 
      : null
  }))
}

/**
 * Calculate profile summary from champion stats
 */
export function calculateSummary(champions: ChampionStats[], longestWinStreak: number = 0): ProfileSummary {
  if (champions.length === 0) {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalAssists: 0,
      kda: 0,
      winrate: 0,
      averagePigScore: null,
      longestWinStreak: 0,
      mostPlayedChampion: ''
    }
  }
  
  const totalGames = champions.reduce((sum, c) => sum + c.games, 0)
  const wins = champions.reduce((sum, c) => sum + c.wins, 0)
  const totalKills = champions.reduce((sum, c) => sum + c.kills, 0)
  const totalDeaths = champions.reduce((sum, c) => sum + c.deaths, 0)
  const totalAssists = champions.reduce((sum, c) => sum + c.assists, 0)
  
  // weighted average for pig score
  const gamesWithPigScore = champions.filter(c => c.averagePigScore !== null)
  const totalPigScoreWeight = gamesWithPigScore.reduce((sum, c) => sum + c.games, 0)
  const averagePigScore = totalPigScoreWeight > 0
    ? gamesWithPigScore.reduce((sum, c) => sum + (c.averagePigScore! * c.games), 0) / totalPigScoreWeight
    : null
  
  // most played champion
  const mostPlayedChampion = [...champions].sort((a, b) => b.games - a.games)[0]?.championName || ''
  
  return {
    totalGames,
    wins,
    losses: totalGames - wins,
    totalKills,
    totalDeaths,
    totalAssists,
    kda: totalDeaths > 0 ? (totalKills + totalAssists) / totalDeaths : totalKills + totalAssists,
    winrate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
    averagePigScore,
    longestWinStreak,
    mostPlayedChampion
  }
}

/**
 * Transform DB participant row to MatchParticipant
 */
export function transformParticipant(p: any): MatchParticipant {
  return {
    puuid: p.puuid,
    riotIdGameName: p.riot_id_game_name || '',
    riotIdTagline: p.riot_id_tagline || '',
    championName: p.champion_name,
    teamId: p.match_data?.teamId || 100,
    win: p.win,
    kills: p.match_data?.kills || 0,
    deaths: p.match_data?.deaths || 0,
    assists: p.match_data?.assists || 0,
    champLevel: p.match_data?.level || 18,
    totalDamageDealtToChampions: p.match_data?.stats?.damage || 0,
    goldEarned: p.match_data?.stats?.gold || 0,
    totalMinionsKilled: p.match_data?.stats?.cs || 0,
    summoner1Id: p.match_data?.spells?.[0] || 0,
    summoner2Id: p.match_data?.spells?.[1] || 0,
    items: [
      p.match_data?.items?.[0] || 0,
      p.match_data?.items?.[1] || 0,
      p.match_data?.items?.[2] || 0,
      p.match_data?.items?.[3] || 0,
      p.match_data?.items?.[4] || 0,
      p.match_data?.items?.[5] || 0
    ],
    perks: {
      primary: {
        style: p.match_data?.runes?.primary?.style || 0,
        perks: p.match_data?.runes?.primary?.perks || [0, 0, 0, 0]
      },
      secondary: {
        style: p.match_data?.runes?.secondary?.style || 0,
        perks: p.match_data?.runes?.secondary?.perks || [0, 0]
      },
      statPerks: p.match_data?.runes?.statPerks || [0, 0, 0]
    },
    pigScore: p.match_data?.pigScore ?? null,
    isRemake: p.match_data?.isRemake || false,
    multiKills: {
      double: p.match_data?.stats?.doubleKills || 0,
      triple: p.match_data?.stats?.tripleKills || 0,
      quadra: p.match_data?.stats?.quadraKills || 0,
      penta: p.match_data?.stats?.pentaKills || 0
    }
  }
}

/**
 * Get matches for a player with all participants
 */
export async function getMatches(puuid: string, limit: number = 20, offset: number = 0): Promise<{ matches: ProfileMatch[], hasMore: boolean }> {
  // get match IDs for this player
  const { data: playerMatches } = await supabase
    .from('summoner_matches')
    .select('match_id, game_creation')
    .eq('puuid', puuid)
    .order('game_creation', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (!playerMatches || playerMatches.length === 0) {
    return { matches: [], hasMore: false }
  }
  
  const matchIds = playerMatches.map(m => m.match_id)
  
  // get match metadata
  const { data: matchRecords } = await supabase
    .from('matches')
    .select('match_id, game_creation, game_duration')
    .in('match_id', matchIds)
  
  // get all participants for these matches
  const { data: participants } = await supabase
    .from('summoner_matches')
    .select('*')
    .in('match_id', matchIds)
  
  if (!matchRecords || !participants) {
    return { matches: [], hasMore: false }
  }
  
  // build match objects maintaining order
  const matches: ProfileMatch[] = matchIds
    .map(matchId => {
      const match = matchRecords.find(m => m.match_id === matchId)
      const matchParticipants = participants.filter(p => p.match_id === matchId)
      
      if (!match || matchParticipants.length === 0) return null
      
      return {
        matchId: match.match_id,
        gameCreation: match.game_creation,
        gameDuration: match.game_duration,
        participants: matchParticipants.map(transformParticipant)
      }
    })
    .filter((m): m is ProfileMatch => m !== null)
  
  return { 
    matches, 
    hasMore: playerMatches.length === limit 
  }
}

/**
 * Calculate longest win streak from match history
 */
export async function getLongestWinStreak(puuid: string): Promise<number> {
  const { data: matches } = await supabase
    .from('summoner_matches')
    .select('win, match_data, game_creation')
    .eq('puuid', puuid)
    .order('game_creation', { ascending: false })
  
  if (!matches) return 0
  
  let longest = 0
  let current = 0
  
  for (const match of matches) {
    if (match.match_data?.isRemake) continue
    
    if (match.win) {
      current++
      if (current > longest) longest = current
    } else {
      current = 0
    }
  }
  
  return longest
}

/**
 * Get recently played with players from matches
 */
export function calculateRecentlyPlayedWith(
  matches: ProfileMatch[], 
  currentPuuid: string,
  profileIcons: Record<string, number> = {}
): RecentPlayer[] {
  const playerMap = new Map<string, RecentPlayer>()
  
  for (const match of matches) {
    const currentPlayer = match.participants.find(p => p.puuid === currentPuuid)
    if (!currentPlayer) continue
    
    const teammates = match.participants.filter(
      p => p.teamId === currentPlayer.teamId && p.puuid !== currentPuuid
    )
    
    for (const teammate of teammates) {
      const existing = playerMap.get(teammate.puuid)
      
      if (existing) {
        existing.games++
        if (teammate.win) existing.wins++
        else existing.losses++
      } else {
        playerMap.set(teammate.puuid, {
          puuid: teammate.puuid,
          gameName: teammate.riotIdGameName || 'Unknown',
          tagLine: teammate.riotIdTagline || '',
          games: 1,
          wins: teammate.win ? 1 : 0,
          losses: teammate.win ? 0 : 1,
          profileIconId: profileIcons[teammate.puuid] || 29
        })
      }
    }
  }
  
  return Array.from(playerMap.values())
    .filter(p => p.games >= 2)
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games
      return (b.wins / b.games) - (a.wins / a.games)
    })
    .slice(0, 10)
}

/**
 * Get profile icons for a list of puuids
 */
export async function getProfileIcons(puuids: string[]): Promise<Record<string, number>> {
  if (puuids.length === 0) return {}
  
  const { data } = await supabase
    .from('summoners')
    .select('puuid, profile_icon_id')
    .in('puuid', puuids)
  
  const icons: Record<string, number> = {}
  for (const row of data || []) {
    icons[row.puuid] = row.profile_icon_id
  }
  
  return icons
}

/**
 * Check update job status for a puuid
 */
export async function getUpdateStatus(puuid: string): Promise<{ hasActiveJob: boolean; cooldownUntil: string | null }> {
  // check for active job
  const { data: job } = await supabase
    .from('update_jobs')
    .select('status')
    .eq('puuid', puuid)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .single()
  
  const hasActiveJob = !!job
  
  // check cooldown from last_updated
  const { data: summoner } = await supabase
    .from('summoners')
    .select('last_updated')
    .eq('puuid', puuid)
    .single()
  
  let cooldownUntil: string | null = null
  if (summoner?.last_updated) {
    const cooldownEnd = new Date(summoner.last_updated).getTime() + 5 * 60 * 1000
    if (cooldownEnd > Date.now()) {
      cooldownUntil = new Date(cooldownEnd).toISOString()
    }
  }
  
  return { hasActiveJob, cooldownUntil }
}
