"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import ProfileHeader from "./ProfileHeader"
import PigScoreCard from "./PigScoreCard"
import AramStatsCard from "./AramStatsCard"
import MatchHistoryList from "./MatchHistoryList"
import FetchMessage from "./FetchMessage"
import Toast from "./Toast"
import type { MatchData } from "../lib/riot-api"
import type { UpdateJobProgress } from "../types/update-jobs"
import { getDefaultTag, LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "../lib/regions"
import { useLoading } from "../lib/loading-context"

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
  matches,
  wins,
  totalGames,
  totalKills,
  totalDeaths,
  totalAssists,
  mostPlayedChampion,
  longestWinStreak,
  totalDamage,
  totalGameDuration,
  totalDoubleKills,
  totalTripleKills,
  totalQuadraKills,
  totalPentaKills,
  region,
  name,
  championImageUrl,
  profileIconUrl,
  ddragonVersion,
  championNames,
  lastUpdated,
  averagePigScore,
  pigScoreGames
}: Props) {
  const router = useRouter()
  const { startLoading, stopLoading } = useLoading()
  const [jobProgress, setJobProgress] = useState<UpdateJobProgress | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState<string>("Your profile is up to date!")
  const [toastType, setToastType] = useState<"success" | "error">("success")
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // cleanup loading bar on unmount
  useEffect(() => {
    return () => stopLoading()
  }, [stopLoading])

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
            startLoading()
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

      if (data.hasActiveJob && data.job) {
        setJobProgress(data.job)
      } else {
        // job completed - reload to show fresh data
        console.log("Job completed, reloading page")
        setJobProgress(null)
        stopLoading()
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        
        // set flag in sessionStorage to show toast after reload
        sessionStorage.setItem('profileUpdated', 'true')
        
        // reload immediately to show updated data
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

  // polling interval
  useEffect(() => {
    if (!jobProgress) {
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
    startLoading()
    
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

      if (updateResponse.ok) {
        const result = await updateResponse.json()
        
        // check if profile was recently updated (5 min cd from server)
        if (result.recentlyUpdated) {
          setJobProgress(null)
          stopLoading()
          setToastMessage("Profile updated recently. Please try again later.")
          setToastType("error")
          setShowToast(true)
          return
        }
        
        // check if already up to date (no new matches found)
        if (result.newMatches === 0) {
          setJobProgress(null)
          stopLoading()
          setToastMessage("Your profile is up to date!")
          setToastType("success")
          setShowToast(true)
          return
        }
        
        // poll for real job data
        setTimeout(() => pollJobStatus(), 500)
      } else {
        // clear placeholder if failed
        setJobProgress(null)
        stopLoading()
      }
    } catch (error) {
      console.error("Update failed:", error)
      setJobProgress(null)
    }
  }

  return (
    <>
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}
      
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
      />

      <div className="bg-accent-darkest py-8 rounded-3xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          {jobProgress && (
            <FetchMessage job={jobProgress} region={PLATFORM_TO_REGIONAL[LABEL_TO_PLATFORM[region.toUpperCase()]]} />
          )}

          <div className="flex flex-col xl:flex-row gap-6">
            <div className="flex flex-col gap-6 xl:w-80 w-full">
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
        </div>
      </div>
    </>
  )
}
