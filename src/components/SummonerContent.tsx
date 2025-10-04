"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import ProfileHeader from "./ProfileHeader"
import PigScoreCard from "./PigScoreCard"
import AramStatsCard from "./AramStatsCard"
import MatchHistoryList from "./MatchHistoryList"
import FetchMessage from "./FetchMessage"
import type { MatchData } from "../lib/riot-api"

interface Props {
  summonerData: any
  matches: MatchData[]
  wins: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  mostPlayedChampion: string
  longestWinStreak: number
  totalDamage: number
  totalGameDuration: number
  region: string
  name: string
  hasIncompleteData: boolean
  championImageUrl?: string
  profileIconUrl: string
  ddragonVersion: string
  lastUpdated: string | null
}

interface LoadingState {
  total: number
  eta: number
  startTime: number
  puuid: string
  initialMatchCount: number
}

export default function SummonerContent({
  summonerData,
  matches,
  wins,
  totalKills,
  totalDeaths,
  totalAssists,
  mostPlayedChampion,
  longestWinStreak,
  totalDamage,
  totalGameDuration,
  region,
  name,
  hasIncompleteData,
  championImageUrl,
  profileIconUrl,
  ddragonVersion,
  lastUpdated
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<LoadingState | null>(null)
  const [isFirstLoad, setIsFirstLoad] = useState(matches.length === 0)
  const [hasTriedUpdate, setHasTriedUpdate] = useState(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // restore loading from localStorage on mount (i hope you can do it like this and it has no downsides)
  useEffect(() => {
    const stored = localStorage.getItem('loading-state')
    if (stored) {
      try {
        const loadingState: LoadingState = JSON.parse(stored)
        // only restore if it's for the same summoner
        if (loadingState.puuid === summonerData.account.puuid) {
          setLoading(loadingState)
        } else {
          // different summoner, clear old state
          localStorage.removeItem('loading-state')
        }
      } catch (e) {
        localStorage.removeItem('loading-state')
      }
    }
  }, [summonerData.account.puuid])

  // poll for new matches while loading
  useEffect(() => {
    if (!loading) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    // 15 min polling reset just in case
    const elapsedSeconds = Math.floor((Date.now() - loading.startTime) / 1000)
    if (elapsedSeconds > 900) {
      console.log("Loading timeout exceeded, clearing state")
      localStorage.removeItem("loading-state")
      setLoading(null)
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    // check for new matches
    if (matches.length > loading.initialMatchCount) {
      console.log("Loading complete! New matches detected")
      localStorage.removeItem("loading-state")
      setLoading(null)
      setIsFirstLoad(false)
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    pollIntervalRef.current = setInterval(() => {
      console.log("Polling for updates...")
      router.refresh()
    }, 5000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [loading, matches.length, router])

  useEffect(() => {
    if (matches.length === 0 && isFirstLoad && !hasTriedUpdate) {
      const updateBtn = document.querySelector("[data-update-button]") as HTMLButtonElement
      if (updateBtn) {
        setHasTriedUpdate(true)
        setTimeout(() => updateBtn.click(), 500)
      }
    }
  }, [matches.length, isFirstLoad, hasTriedUpdate])

  const handleUpdateStart = (totalMatches: number, eta: number, showFullScreen: boolean) => {
    const loadingState: LoadingState = {
      total: totalMatches,
      eta,
      startTime: Date.now(),
      puuid: summonerData.account.puuid,
      initialMatchCount: matches.length
    }
    setLoading(loadingState)
    // keep in localstorage
    localStorage.setItem("loading-state", JSON.stringify(loadingState))
  }

  const handleUpdateComplete = () => {
    // persist loading between refreshes
  }

  return (
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
        onUpdateStart={handleUpdateStart}
        onUpdateComplete={handleUpdateComplete}
        hasMatches={matches.length > 0}
        lastUpdated={lastUpdated}
      />

      <div className="bg-accent-darkest py-8 rounded-3xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          {loading && (
            <FetchMessage 
              totalMatches={loading.total} 
              estimatedSeconds={loading.eta}
              startTime={loading.startTime}
            />
          )}
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex flex-col gap-6 sm:w-80 w-full">
              <PigScoreCard />
              <AramStatsCard
                totalGames={matches.length}
                wins={wins}
                totalKills={totalKills}
                totalDeaths={totalDeaths}
                totalAssists={totalAssists}
                longestWinStreak={longestWinStreak}
                totalDamage={totalDamage}
                totalGameDuration={totalGameDuration}
              />
            </div>
            <MatchHistoryList
              matches={matches}
              puuid={summonerData.account.puuid}
              region={region}
              ddragonVersion={ddragonVersion}
            />
          </div>
        </div>
      </div>
    </>
  )
}
