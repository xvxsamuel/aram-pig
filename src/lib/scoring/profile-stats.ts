// profile stats recalculation - aggregates match data into profile_data.champions

import { createAdminClient } from '../db/supabase'

export interface ChampionProfileStats {
  games: number
  wins: number
  avgKills: number
  avgDeaths: number
  avgAssists: number
  kda: number
  avgDamage: number
  avgPigScore: number | null
}

export interface ProfileChampions {
  [championName: string]: ChampionProfileStats
}

// recalculate champion stats for a single player from their summoner_matches
// and store in profile_data.champions
// optimized: single query, calculates champion stats + win streak in one pass
export async function recalculateProfileChampionStats(puuid: string): Promise<void> {
  const supabase = createAdminClient()

  // single query: fetch all matches ordered by game_creation for win streak calc
  const { data: matches, error: fetchError } = await supabase
    .from('summoner_matches')
    .select('match_id, champion_name, win, match_data, game_creation')
    .eq('puuid', puuid)
    .order('game_creation', { ascending: true })

  if (fetchError) {
    console.error(`[UpdateProfile] Error fetching matches for profile_data ${puuid}:`, fetchError)
    return
  }

  if (!matches || matches.length === 0) {
    console.log(`[UpdateProfile] No matches found for profile_data ${puuid}`)
    return
  }

  console.log(`[UpdateProfile] Found ${matches.length} matches for ${puuid}, aggregating stats...`)

  // aggregate stats by champion AND calculate win streak in single pass
  const championStats: Record<
    string,
    {
      games: number
      wins: number
      totalKills: number
      totalDeaths: number
      totalAssists: number
      totalDamage: number
      pigScoreSum: number
      pigScoreCount: number
    }
  > = {}

  // win streak tracking (matches are ordered by game_creation ascending)
  let longestWinStreak = 0
  let currentStreak = 0

  for (const match of matches) {
    // skip remakes for both champion stats and win streak
    if (match.match_data?.isRemake) continue

    // win streak calculation
    if (match.win) {
      currentStreak++
      longestWinStreak = Math.max(longestWinStreak, currentStreak)
    } else {
      currentStreak = 0
    }

    // champion stats aggregation
    const champ = match.champion_name
    if (!champ) continue

    if (!championStats[champ]) {
      championStats[champ] = {
        games: 0,
        wins: 0,
        totalKills: 0,
        totalDeaths: 0,
        totalAssists: 0,
        totalDamage: 0,
        pigScoreSum: 0,
        pigScoreCount: 0,
      }
    }

    const stats = championStats[champ]
    stats.games++
    if (match.win) stats.wins++
    stats.totalKills += match.match_data?.kills || 0
    stats.totalDeaths += match.match_data?.deaths || 0
    stats.totalAssists += match.match_data?.assists || 0
    stats.totalDamage += match.match_data?.stats?.damage || 0

    const pigScore = match.match_data?.pigScore
    if (pigScore !== null && pigScore !== undefined) {
      stats.pigScoreSum += pigScore
      stats.pigScoreCount++
    }
  }

  // convert to final format
  const champions: ProfileChampions = {}

  for (const [champName, stats] of Object.entries(championStats)) {
    const kda =
      stats.totalDeaths === 0
        ? stats.totalKills + stats.totalAssists
        : (stats.totalKills + stats.totalAssists) / stats.totalDeaths

    champions[champName] = {
      games: stats.games,
      wins: stats.wins,
      avgKills: stats.games > 0 ? Math.round((stats.totalKills / stats.games) * 10) / 10 : 0,
      avgDeaths: stats.games > 0 ? Math.round((stats.totalDeaths / stats.games) * 10) / 10 : 0,
      avgAssists: stats.games > 0 ? Math.round((stats.totalAssists / stats.games) * 10) / 10 : 0,
      kda: Math.round(kda * 100) / 100,
      avgDamage: stats.games > 0 ? Math.round(stats.totalDamage / stats.games) : 0,
      avgPigScore: stats.pigScoreCount > 0 ? Math.round((stats.pigScoreSum / stats.pigScoreCount) * 10) / 10 : null,
    }
  }

  // count total matches (excluding remakes)
  const matchCount = Object.values(championStats).reduce((sum, s) => sum + s.games, 0)

  // log final stats for debugging
  console.log(`[UpdateProfile] Stats for ${puuid}: ${Object.keys(champions).length} champions, ${matchCount} games, ${longestWinStreak} winstreak`)
  console.log(
    `[UpdateProfile] Champions: ${Object.entries(champions)
      .map(([c, s]) => `${c}(${s.games})`)
      .join(', ')}`
  )

  // update profile_data in summoners table
  // IMPORTANT: Completely replace champions data, don't merge with old corrupted data
  const { data: existingSummoner } = await supabase.from('summoners').select('profile_data').eq('puuid', puuid).single()

  // preserve non-champion fields but fully replace champions
  const existingProfileData = existingSummoner?.profile_data || {}
  const { champions: _oldChampions, ...otherProfileData } = existingProfileData as Record<string, unknown>

  const newProfileData = {
    ...otherProfileData,
    champions,
    matchCount,
    longestWinStreak,
    lastCalculated: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('summoners')
    .update({ profile_data: newProfileData })
    .eq('puuid', puuid)

  if (updateError) {
    console.error(`[UpdateProfile] Error updating profile_data for ${puuid}:`, updateError)
  } else {
    console.log(
      `[UpdateProfile] Cached profile_data for ${puuid}: ${Object.keys(champions).length} champions, ${matchCount} total games`
    )
  }
}

/**
 * recalculate champion stats for multiple players
 * called after storing matches to update all affected tracked players
 */
export async function recalculateProfileStatsForPlayers(puuids: string[]): Promise<void> {
  if (puuids.length === 0) return

  console.log(`[UpdateProfile] Caching profile_data for ${puuids.length} players...`)

  // process in parallel but with some batching to avoid overwhelming DB
  const batchSize = 5
  for (let i = 0; i < puuids.length; i += batchSize) {
    const batch = puuids.slice(i, i + batchSize)
    await Promise.all(batch.map(puuid => recalculateProfileChampionStats(puuid)))
  }

  console.log(`[UpdateProfile] Finished caching profile_data for ${puuids.length} players`)
}

