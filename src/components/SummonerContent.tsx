"use client"

import { useState, useEffect } from "react"
import ProfileHeader from "./ProfileHeader"
import PigScoreCard from "./PigScoreCard"
import MatchHistoryList from "./MatchHistoryList"
import LoadingState from "./LoadingState"
import type { MatchData } from "../lib/riot-api"

interface Props {
  summonerData: any
  matches: MatchData[]
  wins: number
  winRate: string
  avgKDA: string
  totalKills: number
  totalDeaths: number
  totalAssists: number
  mostPlayedChampion: string
  region: string
  name: string
}

export default function SummonerContent({
  summonerData,
  matches,
  wins,
  winRate,
  avgKDA,
  totalKills,
  totalDeaths,
  totalAssists,
  mostPlayedChampion,
  region,
  name
}: Props) {
  const [loading, setLoading] = useState<{ total: number; eta: number } | null>(null)
  const [isFirstLoad, setIsFirstLoad] = useState(matches.length === 0)
  const [hasTriedUpdate, setHasTriedUpdate] = useState(false)

  useEffect(() => {
    if (matches.length === 0 && isFirstLoad && !hasTriedUpdate) {
      const updateBtn = document.querySelector('[data-update-button]') as HTMLButtonElement
      if (updateBtn) {
        setHasTriedUpdate(true)
        setTimeout(() => updateBtn.click(), 500)
      }
    }
  }, [matches.length, isFirstLoad, hasTriedUpdate])

  const handleUpdateStart = (totalMatches: number, eta: number, showFullScreen: boolean) => {
    if (showFullScreen) {
      setLoading({ total: totalMatches, eta })
    }
  }

  const handleUpdateComplete = () => {
    setLoading(null)
    setIsFirstLoad(false)
  }

  return (
    <>
      <ProfileHeader
        profileIconId={summonerData.summoner.profileIconId}
        gameName={summonerData.account.gameName}
        tagLine={summonerData.account.tagLine}
        summonerLevel={summonerData.summoner.summonerLevel}
        mostPlayedChampion={mostPlayedChampion}
        region={region}
        name={name}
        puuid={summonerData.account.puuid}
        onUpdateStart={handleUpdateStart}
        onUpdateComplete={handleUpdateComplete}
        hasMatches={matches.length > 0}
      />

      {loading ? (
        <LoadingState totalMatches={loading.total} estimatedSeconds={loading.eta} />
      ) : (
        <div className="flex gap-6">
          <PigScoreCard
            totalGames={matches.length}
            wins={wins}
            winRate={winRate}
            avgKDA={avgKDA}
            totalKills={totalKills}
            totalDeaths={totalDeaths}
            totalAssists={totalAssists}
          />

          <MatchHistoryList
            matches={matches}
            puuid={summonerData.account.puuid}
          />
        </div>
      )}
    </>
  )
}
