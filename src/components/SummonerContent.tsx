"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import ProfileHeader from "./ProfileHeader"
import MatchHistoryList from "./MatchHistoryList"
import ChampionStatsList from "./ChampionStatsList"
import FetchMessage from "./FetchMessage"
import Toast from "./Toast"
import SummonerSummaryCard from "./SummonerSummaryCard"
import SummonerTopChampions from "./SummonerTopChampions"
import SummonerLoadingSkeleton from "./SummonerLoadingSkeleton"
import RecentlyPlayedWith from "./RecentlyPlayedWith"
import type { MatchData } from "../lib/riot-api"
import type { UpdateJobProgress } from "../types/update-jobs"
import { getDefaultTag, LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "../lib/regions"

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
  const router = useRouter()
  
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
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState<string>("Your profile is up to date!")
  const [toastType, setToastType] = useState<"success" | "error">("success")
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // state for client-side loaded data
  const [loading, setLoading] = useState(initialTotalGames === 0)
  const [matches, setMatches] = useState<MatchData[]>(initialMatches)
  const [wins, setWins] = useState(initialWins)
  const [totalGames, setTotalGames] = useState(initialTotalGames)
  const [totalKills, setTotalKills] = useState(initialTotalKills)
  const [totalDeaths, setTotalDeaths] = useState(initialTotalDeaths)
  const [totalAssists, setTotalAssists] = useState(initialTotalAssists)
  const [mostPlayedChampion, setMostPlayedChampion] = useState(initialMostPlayedChampion)
  const [longestWinStreak, setLongestWinStreak] = useState(initialLongestWinStreak)
  const [totalDamage, setTotalDamage] = useState(initialTotalDamage)
  const [totalGameDuration, setTotalGameDuration] = useState(initialTotalGameDuration)
  const [totalDoubleKills, setTotalDoubleKills] = useState(initialTotalDoubleKills)
  const [totalTripleKills, setTotalTripleKills] = useState(initialTotalTripleKills)
  const [totalQuadraKills, setTotalQuadraKills] = useState(initialTotalQuadraKills)
  const [totalPentaKills, setTotalPentaKills] = useState(initialTotalPentaKills)
  const [championImageUrl, setChampionImageUrl] = useState(initialChampionImageUrl)
  const [lastUpdated, setLastUpdated] = useState(initialLastUpdated)
  const [averagePigScore, setAveragePigScore] = useState(initialAveragePigScore)
  const [pigScoreGames, setPigScoreGames] = useState(initialPigScoreGames)
  const [championStats, setChampionStats] = useState<ChampionStats[]>([])

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

  // fetch stats client-side if not provided (totalGames === 0)
  useEffect(() => {
    if (initialTotalGames > 0) return // already have data
    
    async function fetchStats() {
      try {
        const response = await fetch(`/api/summoner-stats?puuid=${summonerData.account.puuid}`)
        if (response.ok) {
          const data = await response.json()
          console.log('Fetched summoner stats:', {
            matchesCount: data.matches?.length,
            totalGames: data.totalGames,
            averagePigScore: data.averagePigScore
          })
          setMatches(data.matches)
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
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
  }, [summonerData.account.puuid, initialTotalGames])

  // check for profile update flag on mount
  useEffect(() => {
    const wasUpdated = sessionStorage.getItem('profileUpdated')
    if (wasUpdated === 'true') {
      sessionStorage.removeItem('profileUpdated')
      setToastMessage("Profile updated successfully!")
      setToastType("success")
      setShowToast(true)
    }
  }, [])

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

      // if we have job data (active or recently completed), update state
      if (data.job) {
        setJobProgress(data.job)
        
        // if job is completed or failed, reload after showing final state
        if (data.job.status === 'completed' || data.job.status === 'failed') {
          console.log("Job finished, reloading in 2 seconds to show fresh data")
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          // wait 2 seconds to show completion state, then reload
          setTimeout(() => {
            sessionStorage.setItem('profileUpdated', 'true')
            window.location.reload()
          }, 2000)
        }
      } else if (!data.hasActiveJob && !jobProgress) {
        // no job exists and we weren't tracking one - nothing to do
        return
      } else if (!data.hasActiveJob && jobProgress) {
        // job disappeared (cleaned up) but we were tracking it - reload
        console.log("Job was cleaned up, reloading page")
        setJobProgress(null)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        sessionStorage.setItem('profileUpdated', 'true')
        window.location.reload()
      }
    } catch (error: any) {
      // ignore abort errors (happens when page refreshes during fetch)
      if (error.name === "AbortError" || error.message?.includes("fetch")) {
        return
      }
      console.error("Failed to poll job status:", error)
    }
  }, [summonerData.account.puuid, router])

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
          setToastMessage("Profile updated recently. Please try again later.")
          setToastType("error")
          setShowToast(true)
          return
        }
        
        // check if already up to date (no new matches found)
        if (result.newMatches === 0) {
          setJobProgress(null)
          setToastMessage("Your profile is up to date!")
          setToastType("success")
          setShowToast(true)
          return
        }
        
        // poll for real job data
        setTimeout(() => pollJobStatus(), 500)
      } else {
        // handle error response from server
        setJobProgress(null)
        setToastMessage(result.error || "Error updating profile")
        setToastType("error")
        setShowToast(true)
      }
    } catch (error) {
      console.error("Update failed:", error)
      setJobProgress(null)
      setToastMessage("Error updating profile")
      setToastType("error")
      setShowToast(true)
    }
  }

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
          onShowMore={() => handleTabChange('champions')}
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
      />
    </div>
  ), [matches, summonerData.account.puuid, region, ddragonVersion, championNames, championStats, aggregateStats, summaryKda, topChampions, handleTabChange, handleMoreMatchesLoaded])

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

  return (
    <>
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}
      
      {loading ? (
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
          />

          <div className="">
            <div className="max-w-6xl mx-auto px-2 sm:px-8">
              {jobProgress && (
                <FetchMessage job={jobProgress} region={PLATFORM_TO_REGIONAL[LABEL_TO_PLATFORM[region.toUpperCase()]]} />
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
                  <div className="py-8 text-center text-gray-400">
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
