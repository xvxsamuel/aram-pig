// hook for fetching and managing profile data
// provides single source of truth for all profile-related state

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProfileData, ChampionStats, ProfileSummary, RecentPlayer } from '@/types/profile'
import type { MatchData } from '@/types/match'

interface UseProfileDataOptions {
  puuid: string
  initialData?: Partial<ProfileData>
  autoFetch?: boolean
  currentName?: { gameName: string, tagLine: string }
}

interface UseProfileDataReturn {
  // data
  summary: ProfileSummary | null
  champions: ChampionStats[]
  matches: MatchData[]
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
  loadMoreMatches: (offset: number) => Promise<{ matches: MatchData[], hasMore: boolean }>
  appendMatches: (newMatches: MatchData[]) => void
  setCooldown: (until: string | null) => void
  setHasActiveJob: (active: boolean) => void
}

export function useProfileData({ puuid, initialData, autoFetch = true, currentName }: UseProfileDataOptions): UseProfileDataReturn {
  // profile state
  const [summary, setSummary] = useState<ProfileSummary | null>(initialData?.summary || null)
  const [champions, setChampions] = useState<ChampionStats[]>(initialData?.champions || [])
  const [matches, setMatches] = useState<MatchData[]>(initialData?.matches || [])
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
  const loadMoreMatches = useCallback(async (offset: number): Promise<{ matches: MatchData[], hasMore: boolean }> => {
    try {
      const response = await fetch('/api/load-more-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puuid, offset, limit: 20, currentName })
      })
      
      if (!response.ok) {
        throw new Error('Failed to load more matches')
      }
      
      return await response.json()
    } catch (err: any) {
      console.error('Load more matches error:', err)
      return { matches: [], hasMore: false }
    }
  }, [puuid, currentName])
  
  // append matches (for infinite scroll)
  const appendMatches = useCallback((newMatches: MatchData[]) => {
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
    setHasActiveJob
  }
}
