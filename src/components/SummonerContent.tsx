"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import ProfileHeader from "./ProfileHeader"
import ProfileSkeleton from "./ProfileSkeleton"
import PigScoreCard from "./PigScoreCard"
import AramStatsCard from "./AramStatsCard"
import MatchHistoryList from "./MatchHistoryList"
import ChampionStatsList from "./ChampionStatsList"
import FetchMessage from "./FetchMessage"
import Toast from "./Toast"
import type { MatchData } from "../lib/riot-api"
import type { UpdateJobProgress } from "../types/update-jobs"
import { getDefaultTag, LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "../lib/regions"

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
  const [selectedTab, setSelectedTab] = useState<'overview' | 'champions' | 'badges'>('overview')
  const [renderedTabs, setRenderedTabs] = useState<Set<string>>(new Set(['overview']))
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

  // Calculate missing pig scores for recent matches
  useEffect(() => {
    // Skip if flag is disabled
    const recalculateEnabled = process.env.NEXT_PUBLIC_RECALCULATE_PIG_SCORES === 'true'
    if (!recalculateEnabled || matches.length === 0) return
    
    async function calculateMissingPigScores() {
      try {
        // Check first few matches to see if they need pig score calculation
        const recentMatches = matches.slice(0, 20) // Check last 20 matches
        
        for (const match of recentMatches) {
          // Always recalculate when flag is enabled (removed the skip check)
          await fetch('/api/calculate-pig-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              matchId: (match as any).match_id,
              puuid: summonerData.account.puuid
            })
          })
        }
      } catch (error) {
        console.error('Failed to calculate missing pig scores:', error)
      }
    }
    
    calculateMissingPigScores()
  }, [matches, summonerData.account.puuid])

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
  const handleTabChange = (tab: 'overview' | 'champions' | 'badges') => {
    setSelectedTab(tab)
    setRenderedTabs(prev => new Set([...prev, tab]))
  }

  // memoize overview content to prevent re-rendering
  const overviewContent = useMemo(() => (
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="flex flex-col gap-4 xl:w-80 w-full">
        <PigScoreCard averagePigScore={averagePigScore} totalGames={pigScoreGames} />
        <AramStatsCard
          totalGames={totalGames}
          wins={wins}
          totalKills={totalKills}
          totalDeaths={totalDeaths}
          totalAssists={totalAssists}
          longestWinStreak={longestWinStreak}
          totalDamage={totalDamage}
          totalGameDuration={totalGameDuration}
          totalDoubleKills={totalDoubleKills}
          totalTripleKills={totalTripleKills}
          totalQuadraKills={totalQuadraKills}
          totalPentaKills={totalPentaKills}
        />
      </div>
      <MatchHistoryList
        matches={matches}
        puuid={summonerData.account.puuid}
        region={region}
        ddragonVersion={ddragonVersion}
        championNames={championNames}
      />
    </div>
  ), [matches, averagePigScore, pigScoreGames, totalGames, wins, totalKills, totalDeaths, totalAssists, longestWinStreak, totalDamage, totalGameDuration, totalDoubleKills, totalTripleKills, totalQuadraKills, totalPentaKills, summonerData.account.puuid, region, ddragonVersion, championNames])

  // memoize champions content
  const championsContent = useMemo(() => (
    <ChampionStatsList
      puuid={summonerData.account.puuid}
      ddragonVersion={ddragonVersion}
      championNames={championNames}
      profileIconUrl={profileIconUrl}
    />
  ), [summonerData.account.puuid, ddragonVersion, championNames, profileIconUrl])

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
            <div className="flex flex-col xl:flex-row gap-4 py-4">
              <div className="flex flex-col gap-4 xl:w-80 w-full">
                {/* pig score card shell */}
                <div className="w-full">
                  <section className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
                    <div className="px-6 py-3">
                      <h2 className="text-xl font-bold text-left mb-3">Personal Item Grade</h2>
                      <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
                      <div className="text-center min-h-[120px] flex items-center justify-center">
                        <div className="relative w-10 h-10">
                          <div className="absolute inset-0 border-3 border-accent-light rounded-full animate-spin border-t-transparent"></div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* stats card shell */}
                <div className="w-full">
                  <section className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
                    <div className="px-6 py-3">
                      <h2 className="text-xl font-bold text-left mb-3">Stats</h2>
                      <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
                      <div className="min-h-[300px] flex items-center justify-center">
                        <div className="relative w-10 h-10">
                          <div className="absolute inset-0 border-3 border-accent-light rounded-full animate-spin border-t-transparent"></div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* match history shell */}
              <div className="flex-1">
                <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
                  <div className="px-6 py-3">
                    <h2 className="text-xl font-bold text-left mb-3">Match History</h2>
                    <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
                    <div className="min-h-[500px] flex items-center justify-center">
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 border-4 border-accent-light rounded-full animate-spin border-t-transparent"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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

              {renderedTabs.has('badges') && (
                <div className={selectedTab === 'badges' ? '' : 'hidden'}>
                  <div className="py-8 text-center text-gray-400">
                    <p className="text-xl">badges view coming soon</p>
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
