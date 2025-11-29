// Profile database queries
import { supabase } from './supabase'
import type { 
  ChampionStats, 
  ProfileSummary,
  RecentPlayer 
} from '@/types/profile'
import type { MatchData } from '@/types/match'

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
    profileData: data.profile_data as Record<string, unknown>
  }
}

/**
 * Get champion stats - prefers cached profile_data, falls back to aggregation
 */
export async function getChampionStats(puuid: string, profileData?: Record<string, unknown>): Promise<ChampionStats[]> {
  // use cached data if available
  const champData = profileData?.champions as Record<string, Record<string, number>> | undefined
  if (champData && Object.keys(champData).length > 0) {
    return Object.entries(champData).map(([championName, stats]) => ({
      championName,
      games: stats.games,
      wins: stats.wins,
      losses: stats.games - stats.wins,
      kills: Math.round(stats.avgKills * stats.games),
      deaths: Math.round(stats.avgDeaths * stats.games),
      assists: Math.round(stats.avgAssists * stats.games),
      totalDamage: Math.round(stats.avgDamage * stats.games),
      averagePigScore: stats.avgPigScore ?? null
    }))
  }
  
  // fallback: aggregate from matches
  const { data: matchStats } = await supabase
    .from('summoner_matches')
    .select('champion_name, win, match_data')
    .eq('puuid', puuid)
  
  if (!matchStats || matchStats.length === 0) return []
  
  const validMatches = matchStats.filter(m => !(m.match_data as Record<string, unknown>)?.isRemake)
  
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
    const matchData = match.match_data as Record<string, unknown>
    const stats = matchData?.stats as Record<string, number> | undefined
    const pigScore = matchData?.pigScore as number | null | undefined
    const existing = championMap.get(match.champion_name)
    
    if (existing) {
      existing.games++
      existing.wins += match.win ? 1 : 0
      existing.kills += (matchData?.kills as number) || 0
      existing.deaths += (matchData?.deaths as number) || 0
      existing.assists += (matchData?.assists as number) || 0
      existing.totalDamage += stats?.damage || 0
      if (pigScore !== null && pigScore !== undefined) {
        existing.pigScores.push(pigScore)
      }
    } else {
      championMap.set(match.champion_name, {
        games: 1,
        wins: match.win ? 1 : 0,
        kills: (matchData?.kills as number) || 0,
        deaths: (matchData?.deaths as number) || 0,
        assists: (matchData?.assists as number) || 0,
        totalDamage: stats?.damage || 0,
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
  
  const gamesWithPigScore = champions.filter(c => c.averagePigScore !== null)
  const totalPigScoreWeight = gamesWithPigScore.reduce((sum, c) => sum + c.games, 0)
  const averagePigScore = totalPigScoreWeight > 0
    ? gamesWithPigScore.reduce((sum, c) => sum + (c.averagePigScore! * c.games), 0) / totalPigScoreWeight
    : null
  
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
 * Transform DB participant to MatchData participant format
 */
function transformToMatchDataParticipant(
  p: Record<string, unknown>, 
  nameOverride?: { puuid: string, gameName: string, tagLine: string }
): MatchData['info']['participants'][0] {
  const matchData = p.match_data as Record<string, unknown> | undefined
  const stats = matchData?.stats as Record<string, number> | undefined
  const runes = matchData?.runes as {
    primary?: { style?: number; perks?: number[] }
    secondary?: { style?: number; perks?: number[] }
    statPerks?: number[]
  } | undefined
  const items = matchData?.items as number[] | undefined
  const spells = matchData?.spells as number[] | undefined
  
  const gameName = (nameOverride && p.puuid === nameOverride.puuid) 
    ? nameOverride.gameName 
    : ((p.riot_id_game_name as string) || '')
  const tagLine = (nameOverride && p.puuid === nameOverride.puuid) 
    ? nameOverride.tagLine 
    : ((p.riot_id_tagline as string) || '')
  
  return {
    puuid: p.puuid as string,
    summonerName: '',
    riotIdGameName: gameName,
    riotIdTagline: tagLine,
    championName: p.champion_name as string,
    championId: 0,
    teamId: (matchData?.teamId as number) || 100,
    win: p.win as boolean,
    gameEndedInEarlySurrender: (matchData?.isRemake as boolean) || false,
    kills: (matchData?.kills as number) || 0,
    deaths: (matchData?.deaths as number) || 0,
    assists: (matchData?.assists as number) || 0,
    champLevel: (matchData?.level as number) || 18,
    totalDamageDealtToChampions: stats?.damage || 0,
    totalDamageDealt: stats?.totalDamageDealt || 0,
    goldEarned: stats?.gold || 0,
    totalMinionsKilled: stats?.cs || 0,
    neutralMinionsKilled: 0,
    summoner1Id: spells?.[0] || 0,
    summoner2Id: spells?.[1] || 0,
    item0: items?.[0] || 0,
    item1: items?.[1] || 0,
    item2: items?.[2] || 0,
    item3: items?.[3] || 0,
    item4: items?.[4] || 0,
    item5: items?.[5] || 0,
    perks: {
      statPerks: {
        offense: runes?.statPerks?.[0] || 0,
        flex: runes?.statPerks?.[1] || 0,
        defense: runes?.statPerks?.[2] || 0
      },
      styles: [
        {
          style: runes?.primary?.style || 0,
          selections: (runes?.primary?.perks || [0, 0, 0, 0]).map((perk: number) => ({ perk }))
        },
        {
          style: runes?.secondary?.style || 0,
          selections: (runes?.secondary?.perks || [0, 0]).map((perk: number) => ({ perk }))
        }
      ]
    },
    doubleKills: stats?.doubleKills || 0,
    tripleKills: stats?.tripleKills || 0,
    quadraKills: stats?.quadraKills || 0,
    pentaKills: stats?.pentaKills || 0,
    pigScore: (matchData?.pigScore as number) ?? undefined
  }
}

/**
 * Get matches in MatchData format (for match history display)
 */
export async function getMatchesAsMatchData(
  puuid: string, 
  limit: number = 20, 
  offset: number = 0,
  currentName?: { gameName: string, tagLine: string }
): Promise<{ matches: MatchData[], hasMore: boolean }> {
  const nameOverride = currentName ? { puuid, gameName: currentName.gameName, tagLine: currentName.tagLine } : undefined
  
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
  
  const { data: matchRecords } = await supabase
    .from('matches')
    .select('match_id, game_creation, game_duration')
    .in('match_id', matchIds)
  
  const { data: participants } = await supabase
    .from('summoner_matches')
    .select('*')
    .in('match_id', matchIds)
  
  if (!matchRecords || !participants) {
    return { matches: [], hasMore: false }
  }
  
  const matches: MatchData[] = matchIds
    .map(matchId => {
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
          gameMode: 'ARAM',
          gameVersion: '',
          queueId: 450,
          participants: matchParticipants.map(p => transformToMatchDataParticipant(p, nameOverride))
        }
      } as MatchData
    })
    .filter((m): m is MatchData => m !== null)
  
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
    const matchData = match.match_data as Record<string, unknown> | undefined
    if (matchData?.isRemake) continue
    
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
  matches: MatchData[], 
  currentPuuid: string,
  profileIcons: Record<string, number> = {}
): RecentPlayer[] {
  const playerMap = new Map<string, RecentPlayer>()
  
  for (const match of matches) {
    const participants = match.info.participants
    const currentPlayer = participants.find(p => p.puuid === currentPuuid)
    if (!currentPlayer) continue
    
    const teammates = participants.filter(
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
  const { data: job } = await supabase
    .from('update_jobs')
    .select('status')
    .eq('puuid', puuid)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .single()
  
  const hasActiveJob = !!job
  
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
