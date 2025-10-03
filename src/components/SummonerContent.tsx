"use client"

import { useState, useEffect } from "react"
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
  winRate: string
  avgKDA: string
  totalKills: number
  totalDeaths: number
  totalAssists: number
  mostPlayedChampion: string
  longestWinStreak: number
  damagePerSecond: string
  region: string
  name: string
  hasIncompleteData: boolean
  championImageUrl?: string
  profileIconUrl: string
  ddragonVersion: string
  lastUpdated: string | null
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
  longestWinStreak,
  damagePerSecond,
  region,
  name,
  hasIncompleteData,
  championImageUrl,
  profileIconUrl,
  ddragonVersion,
  lastUpdated
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
    setLoading({ total: totalMatches, eta })
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
            <FetchMessage totalMatches={loading.total} estimatedSeconds={loading.eta} />
          )}
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex flex-col gap-6 sm:w-80 w-full">
              <PigScoreCard />
              <AramStatsCard
                totalGames={matches.length}
                wins={wins}
                winRate={winRate}
                avgKDA={avgKDA}
                totalKills={totalKills}
                totalDeaths={totalDeaths}
                totalAssists={totalAssists}
                longestWinStreak={longestWinStreak}
                damagePerSecond={damagePerSecond}
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
