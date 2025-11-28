"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import ProfileHeader from "./ProfileHeader"
import MatchHistoryList from "@/components/match/MatchHistoryList"
import ChampionStatsList from "./ChampionStatsList"
import FetchMessage from "./FetchMessage"
import UpdateErrorMessage from "./UpdateErrorMessage"
import SummonerSummaryCard from "./SummonerSummaryCard"
import SummonerTopChampions from "./SummonerTopChampions"
import SummonerLoadingSkeleton from "./SummonerLoadingSkeleton"
import RecentlyPlayedWith from "./RecentlyPlayedWith"
import type { MatchData } from "@/lib/riot-api"
import type { UpdateJobProgress } from "@/types/update-jobs"
import { getDefaultTag, LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "@/lib/regions"

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
    
    // stop flashing when tab becomes visible
    const handleVisibility = () => {
      if (!document.hidden) {
        isFlashing = false
        document.title = originalTitle
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    
    // auto-stop after 30 seconds
    setTimeout(() => {
      isFlashing = false
      document.title = originalTitle
      document.removeEventListener('visibilitychange', handleVisibility)
    }, 30000)
  }
}

// show browser notification (flashes taskbar on Windows)
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

interface ChampionStats {
  championName: string
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  totalDamage: number
  averagePigScore: number | null
}

interface Props {
  summonerData: any
  matches: MatchData[]
  wins: number
  totalGames: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  mostPlayedChampion: string
  longestWinStreak: number
  totalDamage: number
  totalGameDuration: number
  totalDoubleKills: number
  totalTripleKills: number
  totalQuadraKills: number
  totalPentaKills: number
  region: string
  name: string
  championImageUrl?: string
  profileIconUrl: string
  ddragonVersion: string
  championNames: Record<string, string>
  lastUpdated: string | null
  averagePigScore: number | null
  pigScoreGames: number
}

export default function SummonerContent({
  summonerData,
  matches: initialMatches,
  wins: initialWins,
  totalGames: initialTotalGames,
  totalKills: initialTotalKills,
  totalDeaths: initialTotalDeaths,
  totalAssists: initialTotalAssists,
  mostPlayedChampion: initialMostPlayedChampion,
  longestWinStreak: initialLongestWinStreak,
  totalDamage: initialTotalDamage,
  totalGameDuration: initialTotalGameDuration,
  totalDoubleKills: initialTotalDoubleKills,
  totalTripleKills: initialTotalTripleKills,
  totalQuadraKills: initialTotalQuadraKills,
  totalPentaKills: initialTotalPentaKills,
  region,
  name,
  championImageUrl: initialChampionImageUrl,
  profileIconUrl,
  ddragonVersion,
  championNames,
  lastUpdated: initialLastUpdated,
  averagePigScore: initialAveragePigScore,
  pigScoreGames: initialPigScoreGames
}: Props) {
  // get initial tab from URL hash
  const getTabFromHash = useCallback((): 'overview' | 'champions' | 'performance' => {
    if (typeof window === 'undefined') return 'overview'
    const hash = window.location.hash.slice(1) // remove #
    if (hash === 'champions' || hash === 'performance') return hash
    return 'overview'
  }, [])
  
  const [selectedTab, setSelectedTab] = useState<'overview' | 'champions' | 'performance'>('overview')
  const [renderedTabs, setRenderedTabs] = useState<Set<string>>(new Set(['overview']))
  
  // sync tab with URL hash on mount and handle browser back/forward
  useEffect(() => {
    // set initial tab from hash
    const initialTab = getTabFromHash()
    if (initialTab !== 'overview') {
      setSelectedTab(initialTab)
      setRenderedTabs(prev => new Set([...prev, initialTab]))
    }
    
    // handle browser back/forward
    const handlePopState = () => {
      const tab = getTabFromHash()
      setSelectedTab(tab)
      setRenderedTabs(prev => new Set([...prev, tab]))
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [getTabFromHash])
  const [jobProgress, setJobProgress] = useState<UpdateJobProgress | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // state for client-side loaded data
  // always start loading since we fetch fresh data on mount
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<MatchData[]>(initialMatches)
  const [_wins, setWins] = useState(initialWins)
  const [_totalGames, setTotalGames] = useState(initialTotalGames)
  const [_totalKills, setTotalKills] = useState(initialTotalKills)
  const [_totalDeaths, setTotalDeaths] = useState(initialTotalDeaths)
  const [_totalAssists, setTotalAssists] = useState(initialTotalAssists)
  const [mostPlayedChampion, setMostPlayedChampion] = useState(initialMostPlayedChampion)
  const [_longestWinStreak, setLongestWinStreak] = useState(initialLongestWinStreak)
  const [_totalDamage, setTotalDamage] = useState(initialTotalDamage)
  const [_totalGameDuration, setTotalGameDuration] = useState(initialTotalGameDuration)
  const [_totalDoubleKills, setTotalDoubleKills] = useState(initialTotalDoubleKills)
  const [_totalTripleKills, setTotalTripleKills] = useState(initialTotalTripleKills)
  const [_totalQuadraKills, setTotalQuadraKills] = useState(initialTotalQuadraKills)
  const [_totalPentaKills, setTotalPentaKills] = useState(initialTotalPentaKills)
  const [championImageUrl, setChampionImageUrl] = useState(initialChampionImageUrl)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)
  const [_averagePigScore, setAveragePigScore] = useState(initialAveragePigScore)
  const [_pigScoreGames, setPigScoreGames] = useState(initialPigScoreGames)
  const [championStats, setChampionStats] = useState<ChampionStats[]>([])
  const [notifyEnabled, setNotifyEnabled] = useState(false)
  const [updateError, setUpdateError] = useState<{ matchesFetched?: number; totalMatches?: number } | null>(null)

  // preload champion stats on mount
  useEffect(() => {
    async function fetchChampionStats() {
      try {
        const response = await fetch(`/api/player-champion-stats?puuid=${summonerData.account.puuid}`)
        if (response.ok) {
          const data = await response.json()
          setChampionStats(data)
        }
      } catch (error) {
        console.error('Failed to preload champion stats:', error)
      }
    }
    
    fetchChampionStats()
  }, [summonerData.account.puuid])

  // save visited region to localStorage for search bar default
  useEffect(() => {
    localStorage.setItem('selected-region', region.toUpperCase())
  }, [region])

  // reusable function to fetch fresh stats
  const refreshStats = useCallback(async () => {
    try {
      console.log('refreshStats: starting fetch...')
      const response = await fetch(`/api/summoner-stats?puuid=${summonerData.account.puuid}`)
      console.log('refreshStats: response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('refreshStats: received data:', {
          matchesCount: data.matches?.length,
          totalGames: data.totalGames,
          firstMatch: data.matches?.[0]?.metadata?.matchId
        })
        setMatches(data.matches || [])
        console.log('refreshStats: setMatches called with', data.matches?.length, 'matches')
        setWins(data.wins)
        setTotalGames(data.totalGames)
        setTotalKills(data.totalKills)
        setTotalDeaths(data.totalDeaths)
        setTotalAssists(data.totalAssists)
        setMostPlayedChampion(data.mostPlayedChampion)
        setLongestWinStreak(data.longestWinStreak)
        setTotalDamage(data.totalDamage)
        setTotalGameDuration(data.totalGameDuration)
        setTotalDoubleKills(data.totalDoubleKills)
        setTotalTripleKills(data.totalTripleKills)
        setTotalQuadraKills(data.totalQuadraKills)
        setTotalPentaKills(data.totalPentaKills)
        setLastUpdated(data.lastUpdated)
        setAveragePigScore(data.averagePigScore)
        setPigScoreGames(data.pigScoreGames)
        
        // fetch champion image if we have most played champion
        if (data.mostPlayedChampion) {
          const imgResponse = await fetch(`https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${data.mostPlayedChampion}_0.jpg`)
          if (imgResponse.ok) {
            setChampionImageUrl(imgResponse.url)
          }
        }
        
        // also refresh champion stats
        const champResponse = await fetch(`/api/player-champion-stats?puuid=${summonerData.account.puuid}`)
        if (champResponse.ok) {
          const champData = await champResponse.json()
          setChampionStats(champData)
        }
        
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to refresh stats:', error)
      return false
    }
  }, [summonerData.account.puuid])

  // fetch stats on mount - page.tsx doesn't pass match data, we always need to fetch it client-side
  useEffect(() => {
    console.log('Mount effect - fetching stats, initialMatches:', initialMatches.length)
    refreshStats().then((success) => {
      console.log('Stats fetch complete, success:', success)
      setLoading(false)
    })
  }, []) // only run once on mount

  // determine if this is a brand new profile (never updated)
  const isNewProfile = initialTotalGames === 0 && !initialLastUpdated
  const [shouldAutoUpdate, setShouldAutoUpdate] = useState(isNewProfile)

  // check for active job on mount
  useEffect(() => {
    const checkForActiveJob = async () => {
      try {
        const statusResponse = await fetch("/api/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ puuid: summonerData.account.puuid })
        })

        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          
          // update cooldown status
          if (statusData.cooldownUntil) {
            setCooldownUntil(statusData.cooldownUntil)
          }
          
          if (statusData.hasActiveJob && statusData.job) {
            setJobProgress(statusData.job)
          }
        }
      } catch (error) {
        console.error("Failed to check job status:", error)
      }
    }

    checkForActiveJob()
  }, [summonerData.account.puuid])

  // poll for job status
  const pollJobStatus = useCallback(async () => {
    try {
      console.log("Polling job status for puuid:", summonerData.account.puuid)
      
      const response = await fetch("/api/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puuid: summonerData.account.puuid })
      })

      if (!response.ok) {
        console.error("Polling failed:", response.status)
        return
      }

      const data = await response.json()
      console.log("Poll response:", data)

      // update cooldown status
      if (data.cooldownUntil) {
        setCooldownUntil(data.cooldownUntil)
      }

      // if we have job data (active or recently completed), update state
      if (data.job) {
        setJobProgress(data.job)
        
        // if job is completed or failed, refresh data without page reload
        if (data.job.status === 'completed' || data.job.status === 'failed') {
          console.log("Job finished, refreshing data")
          
          const isFailed = data.job.status === 'failed'
          
          // notify user if they opted in (only for successful completion)
          if (notifyEnabled && !isFailed) {
            const originalTitle = document.title
            flashTabNotification("Update Complete!", originalTitle)
            if (document.hidden) {
              showBrowserNotification("ARAM PIG", "Profile update complete!")
            }
          }
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          // capture progress before clearing job
          const fetchedMatches = data.job.fetchedMatches
          const totalMatches = data.job.totalMatches
          
          // wait 1 second to show completion state, then refresh data
          setTimeout(async () => {
            const success = await refreshStats()
            setJobProgress(null)
            // set cooldown after update
            setCooldownUntil(new Date(Date.now() + 5 * 60 * 1000).toISOString())
            
            if (isFailed) {
              // show error message with progress info
              setUpdateError({ matchesFetched: fetchedMatches, totalMatches: totalMatches })
            } else if (success) {
              setStatusMessage("Profile updated successfully!")
            } else {
              setStatusMessage("Failed to refresh data")
            }
          }, 1000)
        }
      } else if (!data.hasActiveJob && !jobProgress) {
        // no job exists and we weren't tracking one - nothing to do
        return
      } else if (!data.hasActiveJob && jobProgress) {
        // job disappeared (cleaned up) but we were tracking it - refresh
        console.log("Job was cleaned up, refreshing data")
        setJobProgress(null)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        const success = await refreshStats()
        // set cooldown after successful update
        setCooldownUntil(new Date(Date.now() + 5 * 60 * 1000).toISOString())
        if (success) {
          setStatusMessage("Profile updated successfully!")
        }
      }
    } catch (error: any) {
      // ignore abort errors (happens when page refreshes during fetch)
      if (error.name === "AbortError" || error.message?.includes("fetch")) {
        return
      }
      console.error("Failed to poll job status:", error)
    }
  }, [summonerData.account.puuid, refreshStats, notifyEnabled])

  // polling interval - only start polling once job has actually started (totalMatches > 0)
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

  const handleManualUpdate = async () => {
    
    // set placeholder job to show ui immediately
    setJobProgress({
      jobId: "pending",
      status: "pending",
      totalMatches: 0,
      fetchedMatches: 0,
      progressPercentage: 0,
      etaSeconds: 0,
      startedAt: new Date().toISOString()
    })
    
    // call the update api
    const decodedName = decodeURIComponent(name)
    const summonerName = decodedName.replace("-", "#")
    const [gameName, tagLine] = summonerName.includes("#") 
      ? summonerName.split("#") 
      : [summonerName, getDefaultTag(region.toUpperCase())]

    const platformCode = LABEL_TO_PLATFORM[region.toUpperCase()]
    const regionalCode = platformCode ? PLATFORM_TO_REGIONAL[platformCode] : "americas"

    try {
      const updateResponse = await fetch("/api/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: regionalCode,
          gameName,
          tagLine,
          platform: platformCode,
        })
      })

      const result = await updateResponse.json()
      
      if (updateResponse.ok) {
        // check if profile was recently updated (5 min cd from server)
        if (result.recentlyUpdated) {
          setJobProgress(null)
          setStatusMessage("Profile updated recently. Please try again later.")
          return
        }
        
        // check if already up to date (no new matches found - no cooldown since no API calls)
        if (result.newMatches === 0) {
          setJobProgress(null)
          setStatusMessage("Your profile is already up to date")
          return
        }
        
        // poll for real job data
        setTimeout(() => pollJobStatus(), 500)
      } else {
        // handle error response from server
        setJobProgress(null)
        setStatusMessage(result.error || "Error updating profile")
      }
    } catch (error) {
      console.error("Update failed:", error)
      setJobProgress(null)
      setStatusMessage("Error updating profile")
    }
  }

  // auto-trigger update for new profiles (after handleManualUpdate is defined)
  useEffect(() => {
    if (shouldAutoUpdate && !jobProgress) {
      setShouldAutoUpdate(false)
      handleManualUpdate()
    }
  }, [shouldAutoUpdate, jobProgress])

  // handle tab changes and mark tabs as rendered
  const handleTabChange = useCallback((tab: 'overview' | 'champions' | 'performance') => {
    setSelectedTab(tab)
    setRenderedTabs(prev => new Set([...prev, tab]))
    
    // update URL hash (overview = no hash, others = #tabname)
    const newHash = tab === 'overview' ? '' : `#${tab}`
    const newUrl = window.location.pathname + window.location.search + newHash
    window.history.pushState(null, '', newUrl)
  }, [])

  // calculate summary stats from champion stats
  const aggregateStats = useMemo(() => {
    if (championStats.length === 0) return null

    const totalGamesAgg = championStats.reduce((sum, c) => sum + c.games, 0)
    const totalWins = championStats.reduce((sum, c) => sum + c.wins, 0)
    const totalKillsAgg = championStats.reduce((sum, c) => sum + c.kills, 0)
    const totalDeathsAgg = championStats.reduce((sum, c) => sum + c.deaths, 0)
    const totalAssistsAgg = championStats.reduce((sum, c) => sum + c.assists, 0)
    
    const gamesWithPigScore = championStats.filter(c => c.averagePigScore !== null)
    const totalPigScore = gamesWithPigScore.reduce((sum, c) => {
      return sum + (c.averagePigScore! * c.games)
    }, 0)
    const totalPigScoreGames = gamesWithPigScore.reduce((sum, c) => sum + c.games, 0)

    return {
      games: totalGamesAgg,
      wins: totalWins,
      losses: totalGamesAgg - totalWins,
      kills: totalKillsAgg,
      deaths: totalDeathsAgg,
      assists: totalAssistsAgg,
      averagePigScore: totalPigScoreGames > 0 ? totalPigScore / totalPigScoreGames : null
    }
  }, [championStats])

  const summaryKda = aggregateStats && aggregateStats.deaths > 0 
    ? ((aggregateStats.kills + aggregateStats.assists) / aggregateStats.deaths).toFixed(2)
    : aggregateStats ? (aggregateStats.kills + aggregateStats.assists).toFixed(2) : '0.00'

  // get top champions sorted by games
  const topChampions = useMemo(() => {
    return [...championStats]
      .sort((a, b) => b.games - a.games)
      .slice(0, 7)
  }, [championStats])

  // callback when more matches are loaded
  const handleMoreMatchesLoaded = useCallback((newMatches: MatchData[]) => {
    setMatches(prev => [...prev, ...newMatches])
  }, [])

  // memoize overview content to prevent re-rendering
  const overviewContent = useMemo(() => (
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="flex flex-col gap-4 xl:w-80 w-full flex-shrink-0">
        <SummonerSummaryCard
          championStatsLoading={championStats.length === 0}
          aggregateStats={aggregateStats}
          summaryKda={summaryKda}
          onTabChange={handleTabChange}
        />
        <SummonerTopChampions
          championStats={championStats}
          topChampions={topChampions}
          ddragonVersion={ddragonVersion}
          championNames={championNames}
          onTabChange={handleTabChange}
        />
        <RecentlyPlayedWith
          matches={matches}
          currentPuuid={summonerData.account.puuid}
          region={region}
          ddragonVersion={ddragonVersion}
        />
      </div>
      <MatchHistoryList
        matches={matches}
        puuid={summonerData.account.puuid}
        region={region}
        ddragonVersion={ddragonVersion}
        championNames={championNames}
        onMatchesLoaded={handleMoreMatchesLoaded}
        initialLoading={loading}
      />
    </div>
  ), [matches, summonerData.account.puuid, region, ddragonVersion, championNames, championStats, aggregateStats, summaryKda, topChampions, handleTabChange, handleMoreMatchesLoaded, loading])

  // memoize champions content
  const championsContent = useMemo(() => (
    <ChampionStatsList
      puuid={summonerData.account.puuid}
      ddragonVersion={ddragonVersion}
      championNames={championNames}
      profileIconUrl={profileIconUrl}
      preloadedStats={championStats.length > 0 ? championStats : undefined}
    />
  ), [summonerData.account.puuid, ddragonVersion, championNames, profileIconUrl, championStats])

  // show skeleton while loading (regardless of new/existing profile)
  const showSkeleton = loading && !jobProgress

  return (
    <>
      {showSkeleton ? (
        <>
          <ProfileHeader
            profileIconId={summonerData.summoner.profileIconId}
            gameName={summonerData.account.gameName}
            tagLine={summonerData.account.tagLine}
            summonerLevel={summonerData.summoner.summonerLevel}
            mostPlayedChampion={mostPlayedChampion}
            championImageUrl={championImageUrl}
            profileIconUrl={profileIconUrl}
            region={region}
            name={name}
            puuid={summonerData.account.puuid}
            hasActiveJob={!!jobProgress}
            onUpdateStarted={handleManualUpdate}
            lastUpdated={lastUpdated}
            loading={true}
            selectedTab={selectedTab}
            onTabChange={handleTabChange}
            longestWinStreak={_longestWinStreak}
            cooldownUntil={cooldownUntil}
            statusMessage={statusMessage}
          />
          <div className="max-w-6xl mx-auto px-2 sm:px-8">
            <SummonerLoadingSkeleton />
          </div>
        </>
      ) : (
        <>
          <ProfileHeader
            profileIconId={summonerData.summoner.profileIconId}
            gameName={summonerData.account.gameName}
            tagLine={summonerData.account.tagLine}
            summonerLevel={summonerData.summoner.summonerLevel}
            mostPlayedChampion={mostPlayedChampion}
            championImageUrl={championImageUrl}
            profileIconUrl={profileIconUrl}
            region={region}
            name={name}
            puuid={summonerData.account.puuid}
            hasActiveJob={!!jobProgress}
            onUpdateStarted={handleManualUpdate}
            lastUpdated={lastUpdated}
            selectedTab={selectedTab}
            onTabChange={handleTabChange}
            longestWinStreak={_longestWinStreak}
            cooldownUntil={cooldownUntil}
            statusMessage={statusMessage}
          />

          <div className="">
            <div className="max-w-6xl mx-auto px-2 sm:px-8">
              {/* show error message if update failed */}
              {updateError && (
                <div className="mb-4">
                  <UpdateErrorMessage 
                    matchesFetched={updateError.matchesFetched}
                    totalMatches={updateError.totalMatches}
                    onDismiss={() => setUpdateError(null)}
                  />
                </div>
              )}
              
              {/* show FetchMessage above all content during update */}
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

              {/* keep all rendered tabs in dom, hide with css */}
              <div className={selectedTab === 'overview' ? '' : 'hidden'}>
                {overviewContent}
              </div>

              {renderedTabs.has('champions') && (
                <div className={selectedTab === 'champions' ? '' : 'hidden'}>
                  {championsContent}
                </div>
              )}

              {renderedTabs.has('performance') && (
                <div className={selectedTab === 'performance' ? '' : 'hidden'}>
                  <div className="py-8 text-center text-white">
                    <p className="text-xl">Performance view coming soon</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
