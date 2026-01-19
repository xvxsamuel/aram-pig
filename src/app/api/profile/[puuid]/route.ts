// unified profile api - single endpoint for all profile data
// replaces: /api/summoner-stats, /api/player-champion-stats, parts of /api/update-status

import { NextRequest, NextResponse } from 'next/server'
import {
  getSummonerInfo,
  getChampionStats,
  calculateSummary,
  getMatchesAsMatchData,
  getLongestWinStreak,
  calculateRecentlyPlayedWith,
  getProfileIcons,
  getUpdateStatus,
} from '@/lib/db'
import type { ProfileData } from '@/types/profile'

export async function GET(request: NextRequest, { params }: { params: Promise<{ puuid: string }> }) {
  const { puuid } = await params

  if (!puuid) {
    return NextResponse.json({ error: 'puuid is required' }, { status: 400 })
  }

  try {
    // fetch summoner info first (includes cached profile_data)
    const summonerInfo = await getSummonerInfo(puuid)

    if (!summonerInfo) {
      return NextResponse.json({ error: 'Summoner not found' }, { status: 404 })
    }

    // parallel fetch all data
    const currentName = { gameName: summonerInfo.gameName, tagLine: summonerInfo.tagLine }
    
    // prefer cached longestWinStreak from profile_data
    const cachedWinStreak = summonerInfo.profileData?.longestWinStreak as number | undefined
    
    const [championStats, { matches }, calculatedWinStreak, updateStatus] = await Promise.all([
      getChampionStats(puuid, summonerInfo.profileData),
      getMatchesAsMatchData(puuid, 20, 0, currentName),
      cachedWinStreak !== undefined ? Promise.resolve(cachedWinStreak) : getLongestWinStreak(puuid),
      getUpdateStatus(puuid),
    ])
    
    const longestWinStreak = calculatedWinStreak

    // get profile icons for teammates in matches
    const teammatePuuids = new Set<string>()
    for (const match of matches) {
      for (const p of match.info.participants) {
        if (p.puuid !== puuid) {
          teammatePuuids.add(p.puuid)
        }
      }
    }
    const profileIcons = await getProfileIcons([...teammatePuuids])

    // calculate derived data
    const summary = calculateSummary(championStats, longestWinStreak)
    const recentlyPlayedWith = calculateRecentlyPlayedWith(matches, puuid, profileIcons)

    const response: ProfileData = {
      summoner: {
        puuid: summonerInfo.puuid,
        gameName: summonerInfo.gameName,
        tagLine: summonerInfo.tagLine,
        profileIconId: summonerInfo.profileIconId,
        summonerLevel: summonerInfo.summonerLevel,
        lastUpdated: summonerInfo.lastUpdated,
      },
      summary,
      champions: championStats,
      matches,
      recentlyPlayedWith,
      updateStatus,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[profile API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
