// unified profile API - single endpoint for all profile data
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
  getUpdateStatus
} from '@/lib/db'
import { autoEnrichRecentMatches } from '@/lib/db/auto-enrich'
import type { PlatformCode } from '@/lib/game'
import type { ProfileData } from '@/types/profile'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ puuid: string }> }
) {
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
    const [
      championStats,
      { matches, hasMore: _hasMore },
      longestWinStreak,
      updateStatus
    ] = await Promise.all([
      getChampionStats(puuid, summonerInfo.profileData),
      getMatchesAsMatchData(puuid, 20, 0, currentName),
      getLongestWinStreak(puuid),
      getUpdateStatus(puuid)
    ])
    
    // Auto-enrich recent matches (< 30 days) that don't have timeline data
    // This runs in background and updates DB, but we return current data immediately
    // The enriched data will be available on next page load or refresh
    if (summonerInfo.region && matches.length > 0) {
      const matchIds = matches.map(m => m.metadata.matchId)
      // Fire and forget - don't await to keep response fast
      autoEnrichRecentMatches(matchIds, summonerInfo.region as PlatformCode)
        .then(count => {
          if (count > 0) console.log(`[profile API] Auto-enriched ${count} matches for ${puuid.slice(0, 8)}...`)
        })
        .catch(err => console.error('[profile API] Auto-enrich error:', err))
    }
    
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
        lastUpdated: summonerInfo.lastUpdated
      },
      summary,
      champions: championStats,
      matches,
      recentlyPlayedWith,
      updateStatus
    }
    
    return NextResponse.json(response)
    
  } catch (error: any) {
    console.error('[profile API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
