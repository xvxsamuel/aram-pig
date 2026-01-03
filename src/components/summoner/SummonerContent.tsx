'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ProfileHeader from './ProfileHeader'
import MatchHistoryList from '@/components/match/MatchHistoryList'
import ChampionStatsList from './ChampionStatsList'
import FetchMessage from './FetchMessage'
import UpdateErrorMessage from './UpdateErrorMessage'
import SummonerSummaryCard from './SummonerSummaryCard'
import SummonerTopChampions from './SummonerTopChampions'
import SummonerLoadingSkeleton from './SummonerLoadingSkeleton'
import RecentlyPlayedWithList from './RecentlyPlayedWithList'
import { useProfileData } from '@/hooks/useProfileData'
import type { UpdateJobProgress } from '@/types/update-jobs'
import { getDefaultTag, LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from '@/lib/game'

// flash tab title to notify user when update completes
function flashTabNotification(message: string, originalTitle: string) {
  if (document.hidden) {
    let isFlashing = true
    let showMessage = true

    const flashInterval = setInterval(() => {
      if (!isFlashing) {
        document.title = originalTitle
        clearInterval(flashInterval)
        return
      }
      document.title = showMessage ? message : originalTitle
      showMessage = !showMessage
    }, 1000)

    const handleVisibility = () => {
      if (!document.hidden) {
        isFlashing = false
        document.title = originalTitle
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    setTimeout(() => {
      isFlashing = false
      document.title = originalTitle
      document.removeEventListener('visibilitychange', handleVisibility)
    }, 30000)
  }
}

function showBrowserNotification(title: string, body: string) {
  if (!('Notification' in window)) return

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon/favicon-32x32.png' })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/favicon/favicon-32x32.png' })
      }
    })
  }
}

interface Props {
  summonerData: {
    account: { puuid: string; gameName: string; tagLine: string }
    summoner: { profileIconId: number; summonerLevel: number }
  }
  region: string
  name: string
  profileIconUrl: string
  ddragonVersion: string
  championNames: Record<string, string>
  lastUpdated: string | null
  hasMatches: boolean
}

export default function SummonerContentV2({
  summonerData,
  region,
  name,
  profileIconUrl,
  ddragonVersion,
  championNames,
  lastUpdated: initialLastUpdated,
  hasMatches,
}: Props) {
  const puuid = summonerData.account.puuid

  // unified profile data hook (auto-enrichment happens server-side)
  const {
    summary,
    champions,
    recentlyPlayedWith,
    lastUpdated,
    mostPlayedChampion,
    longestWinStreak,
    cooldownUntil,
    loading,
    error: profileError,
    refresh,
    matches,
    setCooldown,
    setHasActiveJob,
  } = useProfileData({
    puuid,
    currentName: { gameName: summonerData.account.gameName, tagLine: summonerData.account.tagLine },
  })

  // tab state
  const getTabFromHash = useCallback((): 'overview' | 'champions' | 'performance' => {
    if (typeof window === 'undefined') return 'overview'
    const hash = window.location.hash.slice(1)
    if (hash === 'champions' || hash === 'performance') return hash
    return 'overview'
  }, [])

  const [selectedTab, setSelectedTab] = useState<'overview' | 'champions' | 'performance'>('overview')
  const [renderedTabs, setRenderedTabs] = useState<Set<string>>(new Set(['overview']))

  useEffect(() => {
    const initialTab = getTabFromHash()
    if (initialTab !== 'overview') {
      setSelectedTab(initialTab)
      setRenderedTabs(prev => new Set([...prev, initialTab]))
    }

    const handlePopState = () => {
      const tab = getTabFromHash()
      setSelectedTab(tab)
      setRenderedTabs(prev => new Set([...prev, tab]))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [getTabFromHash])

  // update job state
  const [jobProgress, setJobProgress] = useState<UpdateJobProgress | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [notifyEnabled, setNotifyEnabled] = useState(false)
  const [updateError, setUpdateError] = useState<{ matchesFetched?: number; totalMatches?: number } | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const continuationInFlightRef = useRef(false) // prevent duplicate continuation requests

  // champion image for header
  const [championImageUrl, setChampionImageUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (mostPlayedChampion) {
      const imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${mostPlayedChampion}_0.jpg`
      fetch(imageUrl)
        .then(res => {
          if (res.ok) {
            setChampionImageUrl(imageUrl)
          }
        })
        .catch(() => {})
    } else {
      setChampionImageUrl(undefined)
    }
  }, [mostPlayedChampion])

  // save region to localStorage
  useEffect(() => {
    localStorage.setItem('selected-region', region.toUpperCase())
  }, [region])

  // check for active job on mount
  useEffect(() => {
    const checkForActiveJob = async () => {
      try {
        const response = await fetch('/api/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ puuid }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.cooldownUntil) setCooldown(data.cooldownUntil)
          if (data.hasActiveJob && data.job) {
            setJobProgress(data.job)
            setHasActiveJob(true)
          }
        }
      } catch (error) {
        console.error('Failed to check job status:', error)
      }
    }

    checkForActiveJob()
  }, [puuid, setCooldown, setHasActiveJob])

  // poll job status and trigger continuation
  const pollJobStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puuid }),
      })

      if (!response.ok) return

      const data = await response.json()
      if (data.cooldownUntil) setCooldown(data.cooldownUntil)

      if (data.job) {
        setJobProgress(data.job)

        if (data.job.status === 'completed' || data.job.status === 'failed') {
          const isFailed = data.job.status === 'failed'

          if (notifyEnabled && !isFailed) {
            const originalTitle = document.title
            flashTabNotification('Update Complete!', originalTitle)
            if (document.hidden) {
              showBrowserNotification('ARAM PIG', 'Profile update complete!')
            }
          }

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }

          const fetchedMatches = data.job.fetchedMatches
          const totalMatches = data.job.totalMatches

          setTimeout(async () => {
            const success = await refresh()
            setJobProgress(null)
            setHasActiveJob(false)
            setCooldown(new Date(Date.now() + 5 * 60 * 1000).toISOString())

            if (isFailed) {
              setUpdateError({ matchesFetched: fetchedMatches, totalMatches: totalMatches })
            } else if (success) {
              setStatusMessage('Profile updated successfully!')
            } else {
              setStatusMessage('Failed to refresh data')
            }
          }, 1000)
        } else if (data.job.status === 'processing') {
          // job is still processing - trigger continuation by calling update-profile
          // this will process the next chunk of matches
          
          // prevent duplicate continuation requests
          if (continuationInFlightRef.current) {
            return // already have a continuation request in flight
          }
          
          continuationInFlightRef.current = true
          
          const decodedName = decodeURIComponent(name)
          const summonerName = decodedName.replace('-', '#')
          const [gameName, tagLine] = summonerName.includes('#')
            ? summonerName.split('#')
            : [summonerName, getDefaultTag(region.toUpperCase())]

          const platformCode = LABEL_TO_PLATFORM[region.toUpperCase()]
          const regionalCode = platformCode ? PLATFORM_TO_REGIONAL[platformCode] : 'americas'

          // fire and forget - next poll will see the updated progress
          fetch('/api/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region: regionalCode, gameName, tagLine, platform: platformCode }),
          })
            .then(() => {
              continuationInFlightRef.current = false
            })
            .catch(() => {
              continuationInFlightRef.current = false
            })
        }
      } else if (!data.hasActiveJob && jobProgress) {
        setJobProgress(null)
        setHasActiveJob(false)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        const success = await refresh()
        setCooldown(new Date(Date.now() + 5 * 60 * 1000).toISOString())
        if (success) setStatusMessage('Profile updated successfully!')
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('fetch')) return
      console.error('Failed to poll job status:', error)
    }
  }, [puuid, refresh, notifyEnabled, jobProgress, setCooldown, setHasActiveJob, name, region])

  // polling interval
  useEffect(() => {
    if (!jobProgress || jobProgress.totalMatches === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    pollIntervalRef.current = setInterval(pollJobStatus, 5000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [jobProgress, pollJobStatus])

  // handle manual update
  const handleManualUpdate = async () => {
    setJobProgress({
      jobId: 'pending',
      status: 'pending',
      totalMatches: 0,
      fetchedMatches: 0,
      progressPercentage: 0,
      etaSeconds: 0,
      startedAt: new Date().toISOString(),
    })
    setHasActiveJob(true)

    const decodedName = decodeURIComponent(name)
    const summonerName = decodedName.replace('-', '#')
    const [gameName, tagLine] = summonerName.includes('#')
      ? summonerName.split('#')
      : [summonerName, getDefaultTag(region.toUpperCase())]

    const platformCode = LABEL_TO_PLATFORM[region.toUpperCase()]
    const regionalCode = platformCode ? PLATFORM_TO_REGIONAL[platformCode] : 'americas'

    try {
      const updateResponse = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: regionalCode, gameName, tagLine, platform: platformCode }),
      })

      const result = await updateResponse.json()

      if (updateResponse.ok) {
        if (result.recentlyUpdated) {
          setJobProgress(null)
          setHasActiveJob(false)
          setStatusMessage('Profile updated recently. Please try again later.')
          return
        }

        if (result.newMatches === 0) {
          setJobProgress(null)
          setHasActiveJob(false)
          setStatusMessage('Your profile is already up to date')
          return
        }

        // Update job progress with actual match count immediately
        if (result.jobId && result.newMatches > 0) {
          setJobProgress({
            jobId: result.jobId,
            status: 'processing',
            totalMatches: result.newMatches,
            fetchedMatches: result.progress || 0,
            progressPercentage: Math.round(((result.progress || 0) / result.newMatches) * 100),
            etaSeconds: result.newMatches * 2, // estimate 2s per match
            startedAt: new Date().toISOString(),
          })
        }

        setTimeout(() => pollJobStatus(), 500)
      } else {
        setJobProgress(null)
        setHasActiveJob(false)
        setStatusMessage(result.error || 'Error updating profile')
      }
    } catch (error) {
      console.error('Update failed:', error)
      setJobProgress(null)
      setHasActiveJob(false)
      setStatusMessage('Error updating profile')
    }
  }

  // auto-update for new profiles
  const isNewProfile = !hasMatches && !initialLastUpdated
  const [shouldAutoUpdate, setShouldAutoUpdate] = useState(isNewProfile)

  useEffect(() => {
    if (shouldAutoUpdate && !jobProgress) {
      setShouldAutoUpdate(false)
      handleManualUpdate()
    }
  }, [shouldAutoUpdate, jobProgress])

  // tab change handler
  const handleTabChange = useCallback((tab: 'overview' | 'champions' | 'performance') => {
    setSelectedTab(tab)
    setRenderedTabs(prev => new Set([...prev, tab]))

    const newHash = tab === 'overview' ? '' : `#${tab}`
    const newUrl = window.location.pathname + window.location.search + newHash
    window.history.pushState(null, '', newUrl)
  }, [])

  // derived summary stats for components
  const aggregateStats = useMemo(() => {
    if (!summary) return null
    return {
      games: summary.totalGames,
      wins: summary.wins,
      losses: summary.losses,
      kills: summary.totalKills,
      deaths: summary.totalDeaths,
      assists: summary.totalAssists,
      averagePigScore: summary.averagePigScore,
    }
  }, [summary])

  const summaryKda = summary?.kda?.toFixed(2) || '0.00'

  const topChampions = useMemo(() => {
    return [...champions].sort((a, b) => b.games - a.games).slice(0, 7)
  }, [champions])

  // handle more matches loaded (for legacy component compatibility)
  const handleMoreMatchesLoaded = useCallback(() => {
    // this is handled by MatchHistoryList internally now
  }, [])

  const showSkeleton = loading && !jobProgress

  // overview content
  const overviewContent = useMemo(
    () => (
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="flex flex-col gap-4 xl:w-80 w-full flex-shrink-0">
          <SummonerSummaryCard
            championStatsLoading={champions.length === 0 && loading}
            aggregateStats={aggregateStats}
            summaryKda={summaryKda}
            onTabChange={handleTabChange}
          />
          <SummonerTopChampions
            championStats={champions}
            topChampions={topChampions}
            ddragonVersion={ddragonVersion}
            championNames={championNames}
            onTabChange={handleTabChange}
          />
          <RecentlyPlayedWithList players={recentlyPlayedWith} region={region} ddragonVersion={ddragonVersion} />
        </div>
        <MatchHistoryList
          matches={matches}
          puuid={puuid}
          region={region}
          ddragonVersion={ddragonVersion}
          championNames={championNames}
          onMatchesLoaded={handleMoreMatchesLoaded}
          initialLoading={loading}
          currentName={{ gameName: summonerData.account.gameName, tagLine: summonerData.account.tagLine }}
        />
      </div>
    ),
    [
      matches,
      puuid,
      region,
      ddragonVersion,
      championNames,
      champions,
      aggregateStats,
      summaryKda,
      topChampions,
      handleTabChange,
      handleMoreMatchesLoaded,
      loading,
      recentlyPlayedWith,
      summonerData.account.gameName,
      summonerData.account.tagLine,
    ]
  )

  const championsContent = useMemo(
    () => (
      <ChampionStatsList
        puuid={puuid}
        ddragonVersion={ddragonVersion}
        championNames={championNames}
        profileIconUrl={profileIconUrl}
        preloadedStats={champions.length > 0 ? champions : undefined}
      />
    ),
    [puuid, ddragonVersion, championNames, profileIconUrl, champions]
  )

  // calculate tier stats for all champions
  const allChampionTierStats = useMemo(() => {
    if (champions.length === 0) return []

    return champions.map(c => ({
      winrate: (c.wins / c.games) * 100,
      games: c.games,
      avgDamage: c.totalDamage / c.games,
      kda: c.deaths > 0 ? (c.kills + c.assists) / c.deaths : c.kills + c.assists,
    }))
  }, [champions])

  // calculate overall tier stats (weighted by games)
  const overallTierStats = useMemo(() => {
    if (champions.length === 0) return null

    const totalGames = champions.reduce((sum, c) => sum + c.games, 0)
    if (totalGames === 0) return null

    const totalWins = champions.reduce((sum, c) => sum + c.wins, 0)
    const totalKills = champions.reduce((sum, c) => sum + c.kills, 0)
    const totalDeaths = champions.reduce((sum, c) => sum + c.deaths, 0)
    const totalAssists = champions.reduce((sum, c) => sum + c.assists, 0)
    const totalDamage = champions.reduce((sum, c) => sum + c.totalDamage, 0)

    return {
      winrate: (totalWins / totalGames) * 100,
      games: totalGames,
      avgDamage: totalDamage / totalGames,
      kda: totalDeaths > 0 ? (totalKills + totalAssists) / totalDeaths : totalKills + totalAssists,
    }
  }, [champions])

  return (
    <>
      {showSkeleton ? (
        <>
          <ProfileHeader
            key={`${puuid}-${lastUpdated || 'initial'}-loading`}
            gameName={summonerData.account.gameName}
            tagLine={summonerData.account.tagLine}
            summonerLevel={summonerData.summoner.summonerLevel}
            mostPlayedChampion={mostPlayedChampion}
            championImageUrl={championImageUrl}
            profileIconUrl={profileIconUrl}
            region={region}
            name={name}
            puuid={puuid}
            hasActiveJob={!!jobProgress}
            onUpdateStarted={handleManualUpdate}
            lastUpdated={lastUpdated}
            loading={true}
            selectedTab={selectedTab}
            onTabChange={handleTabChange}
            longestWinStreak={longestWinStreak}
            cooldownUntil={cooldownUntil}
            statusMessage={statusMessage}
          />
          <div className="max-w-6xl mx-auto px-8">
            <SummonerLoadingSkeleton />
          </div>
        </>
      ) : (
        <>
          <ProfileHeader
            key={`${puuid}-${lastUpdated || 'initial'}`}
            gameName={summonerData.account.gameName}
            tagLine={summonerData.account.tagLine}
            summonerLevel={summonerData.summoner.summonerLevel}
            mostPlayedChampion={mostPlayedChampion}
            championImageUrl={championImageUrl}
            profileIconUrl={profileIconUrl}
            region={region}
            name={name}
            puuid={puuid}
            hasActiveJob={!!jobProgress}
            onUpdateStarted={handleManualUpdate}
            lastUpdated={lastUpdated}
            selectedTab={selectedTab}
            onTabChange={handleTabChange}
            longestWinStreak={longestWinStreak}
            cooldownUntil={cooldownUntil}
            statusMessage={statusMessage}
          />

          <div className="max-w-6xl mx-auto px-8 pb-8">
            {updateError && (
              <div className="mb-4">
                <UpdateErrorMessage
                  matchesFetched={updateError.matchesFetched}
                  totalMatches={updateError.totalMatches}
                  onDismiss={() => setUpdateError(null)}
                />
              </div>
            )}

            {jobProgress && (
              <div className="mb-4">
                <FetchMessage
                  job={jobProgress}
                  region={PLATFORM_TO_REGIONAL[LABEL_TO_PLATFORM[region.toUpperCase()]]}
                  notifyEnabled={notifyEnabled}
                  onNotifyChange={setNotifyEnabled}
                />
              </div>
            )}

            {profileError && !loading && (
              <div className="mb-4 p-4 rounded-lg bg-red-900/30 border border-red-500/50">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-red-300 font-medium">Database temporarily unavailable</p>
                    <p className="text-red-400/80 text-sm mt-1">
                      {profileError.includes('timeout') || profileError.includes('fetch') 
                        ? 'The database is currently under heavy load. Your data is safe - please try again in a few moments.'
                        : profileError}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => refresh()}
                  className="mt-3 px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-300 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            <div className={selectedTab === 'overview' ? '' : 'hidden'}>{overviewContent}</div>

            {renderedTabs.has('champions') && (
              <div className={selectedTab === 'champions' ? '' : 'hidden'}>{championsContent}</div>
            )}

            {renderedTabs.has('performance') && (
              <div className={selectedTab === 'performance' ? '' : 'hidden'}>
                <div className="py-8 text-center text-white">
                  <p className="text-xl">Performance view coming soon</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
