// hook for fetching and managing profile data
// provides single source of truth for all profile-related state

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProfileData, ProfileMatch, ChampionStats, ProfileSummary, RecentPlayer } from '@/types/profile'
import type { MatchData } from '@/lib/riot-api'

interface UseProfileDataOptions {
  puuid: string
  initialData?: Partial<ProfileData>
  autoFetch?: boolean
}

interface UseProfileDataReturn {
  // data
  summary: ProfileSummary | null
  champions: ChampionStats[]
  matches: ProfileMatch[]
  recentlyPlayedWith: RecentPlayer[]
  lastUpdated: string | null
  mostPlayedChampion: string
  longestWinStreak: number
  
  // update status
  hasActiveJob: boolean
  cooldownUntil: string | null
  
  // state
  loading: boolean
  error: string | null
  
  // actions
  refresh: () => Promise<boolean>
  loadMoreMatches: (offset: number) => Promise<{ matches: ProfileMatch[], hasMore: boolean }>
  appendMatches: (newMatches: ProfileMatch[]) => void
  setCooldown: (until: string | null) => void
  setHasActiveJob: (active: boolean) => void
  
  // legacy format for components that need MatchData[]
  matchesAsLegacyFormat: MatchData[]
}

// convert ProfileMatch to legacy MatchData format for backward compatibility
function convertToLegacyFormat(matches: ProfileMatch[]): MatchData[] {
  return matches.map(match => ({
    metadata: {
      matchId: match.matchId,
      participants: match.participants.map(p => p.puuid)
    },
    info: {
      gameCreation: match.gameCreation,
      gameDuration: match.gameDuration,
      gameEndTimestamp: match.gameCreation + (match.gameDuration * 1000),
      gameMode: 'ARAM',
      gameVersion: '',
      queueId: 450,
      participants: match.participants.map(p => ({
        puuid: p.puuid,
        summonerName: '',
        riotIdGameName: p.riotIdGameName,
        riotIdTagline: p.riotIdTagline,
        championName: p.championName,
        championId: 0,
        teamId: p.teamId,
        win: p.win,
        gameEndedInEarlySurrender: p.isRemake,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        champLevel: p.champLevel,
        totalDamageDealtToChampions: p.totalDamageDealtToChampions,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        goldEarned: p.goldEarned,
        totalMinionsKilled: p.totalMinionsKilled,
        neutralMinionsKilled: 0,
        summoner1Id: p.summoner1Id,
        summoner2Id: p.summoner2Id,
        item0: p.items[0] || 0,
        item1: p.items[1] || 0,
        item2: p.items[2] || 0,
        item3: p.items[3] || 0,
        item4: p.items[4] || 0,
        item5: p.items[5] || 0,
        item6: 0,
        perks: {
          statPerks: {
            offense: p.perks.statPerks[0] || 0,
            flex: p.perks.statPerks[1] || 0,
            defense: p.perks.statPerks[2] || 0
          },
          styles: [
            {
              style: p.perks.primary.style,
              selections: p.perks.primary.perks.map(perk => ({ perk }))
            },
            {
              style: p.perks.secondary.style,
              selections: p.perks.secondary.perks.map(perk => ({ perk }))
            }
          ]
        },
        doubleKills: p.multiKills.double,
        tripleKills: p.multiKills.triple,
        quadraKills: p.multiKills.quadra,
        pentaKills: p.multiKills.penta,
        pigScore: p.pigScore ?? undefined
      }))
    }
  }))
}

export function useProfileData({ puuid, initialData, autoFetch = true }: UseProfileDataOptions): UseProfileDataReturn {
  // profile state
  const [summary, setSummary] = useState<ProfileSummary | null>(initialData?.summary || null)
  const [champions, setChampions] = useState<ChampionStats[]>(initialData?.champions || [])
  const [matches, setMatches] = useState<ProfileMatch[]>(initialData?.matches || [])
  const [recentlyPlayedWith, setRecentlyPlayedWith] = useState<RecentPlayer[]>(initialData?.recentlyPlayedWith || [])
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialData?.summoner?.lastUpdated || null)
  
  // update status
  const [hasActiveJob, setHasActiveJob] = useState(initialData?.updateStatus?.hasActiveJob || false)
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(initialData?.updateStatus?.cooldownUntil || null)
  
  // loading/error
  const [loading, setLoading] = useState(autoFetch)
  const [error, setError] = useState<string | null>(null)
  
  // prevent double fetch
  const hasFetched = useRef(false)
  
  // fetch profile data
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/profile/${puuid}`)
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch profile')
      }
      
      const data: ProfileData = await response.json()
      
      setSummary(data.summary)
      setChampions(data.champions)
      setMatches(data.matches)
      setRecentlyPlayedWith(data.recentlyPlayedWith)
      setLastUpdated(data.summoner.lastUpdated)
      setHasActiveJob(data.updateStatus.hasActiveJob)
      setCooldownUntil(data.updateStatus.cooldownUntil)
      
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      setLoading(false)
    }
  }, [puuid])
  
  // load more matches
  const loadMoreMatches = useCallback(async (offset: number): Promise<{ matches: ProfileMatch[], hasMore: boolean }> => {
    try {
      const response = await fetch('/api/load-more-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puuid, offset, limit: 20 })
      })
      
      if (!response.ok) {
        throw new Error('Failed to load more matches')
      }
      
      return await response.json()
    } catch (err: any) {
      console.error('Load more matches error:', err)
      return { matches: [], hasMore: false }
    }
  }, [puuid])
  
  // append matches (for infinite scroll)
  const appendMatches = useCallback((newMatches: ProfileMatch[]) => {
    setMatches(prev => [...prev, ...newMatches])
  }, [])
  
  // auto-fetch on mount
  useEffect(() => {
    if (autoFetch && !hasFetched.current) {
      hasFetched.current = true
      refresh()
    }
  }, [autoFetch, refresh])
  
  // derived values
  const mostPlayedChampion = summary?.mostPlayedChampion || ''
  const longestWinStreak = summary?.longestWinStreak || 0
  
  // legacy format conversion (memoized via useMemo equivalent)
  const matchesAsLegacyFormat = convertToLegacyFormat(matches)
  
  return {
    summary,
    champions,
    matches,
    recentlyPlayedWith,
    lastUpdated,
    mostPlayedChampion,
    longestWinStreak,
    hasActiveJob,
    cooldownUntil,
    loading,
    error,
    refresh,
    loadMoreMatches,
    appendMatches,
    setCooldown: setCooldownUntil,
    setHasActiveJob,
    matchesAsLegacyFormat
  }
}
