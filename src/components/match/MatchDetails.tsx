"use client"

import { useState, useEffect, useRef } from "react"
import type { MatchData } from "@/types/match"
import Image from "next/image"
import Link from "next/link"
import clsx from "clsx"
import { getChampionImageUrl, getItemImageUrl, getRuneImageUrl, getRuneStyleImageUrl, getSummonerSpellUrl, getChampionUrlName } from "@/lib/ddragon"
import { getKdaColor, getPigScoreColor } from "@/lib/ui"
import Tooltip from "@/components/ui/Tooltip"
import runesData from "@/data/runes.json"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "@/lib/game"

interface Props {
  match: MatchData
  currentPuuid: string
  ddragonVersion: string
  region: string
  defaultTab?: 'overview' | 'build' | 'performance'
  onTabChange?: (tab: 'overview' | 'build' | 'performance') => void
}

interface ItemTimelineEvent {
  timestamp: number
  type: 'ITEM_PURCHASED' | 'ITEM_SOLD' | 'ITEM_UNDO'
  itemId: number
}

interface ParticipantDetails {
  puuid: string
  build_order: string | null
  ability_order: string | null
  first_buy: string | null
  pig_score: number | null
  item_timeline: ItemTimelineEvent[]
  loading: boolean
}

interface ItemPenaltyDetail {
  slot: number
  itemId: number
  itemName?: string
  penalty: number
  reason: 'optimal' | 'suboptimal' | 'off-meta' | 'unknown' | 'boots'
  playerWinrate?: number
  topWinrate?: number
  isInTop5: boolean
}

interface PigScoreBreakdown {
  finalScore: number
  playerStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
    deathsPerMin: number
    killParticipation?: number
  }
  championAvgStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
  }
  penalties: {
    name: string
    penalty: number
    maxPenalty: number
    playerValue?: number
    avgValue?: number
    percentOfAvg?: number
    zScore?: number
    targetZScore?: number
    stdDev?: number
    relevanceWeight?: number
  }[]
  itemDetails?: ItemPenaltyDetail[]
  scoringInfo?: {
    targetZScore: number
    meanPenaltyPercent: number
    description: string
  }
  totalGames: number
  patch: string
  matchPatch?: string
  usedFallbackPatch?: boolean
}

export default function MatchDetails({ match, currentPuuid, ddragonVersion, region, defaultTab = 'overview', onTabChange }: Props) {
  const [selectedTab, setSelectedTabState] = useState<'overview' | 'build' | 'performance'>(defaultTab)
  
  // sync tab when parent changes defaultTab (e.g., clicking PIG button when already expanded)
  useEffect(() => {
    setSelectedTabState(defaultTab)
  }, [defaultTab])
  
  // helper to update tab and notify parent
  const setSelectedTab = (tab: 'overview' | 'build' | 'performance') => {
    setSelectedTabState(tab)
    onTabChange?.(tab)
  }
  const [participantDetails, setParticipantDetails] = useState<Map<string, ParticipantDetails>>(new Map())
  const [pigScores, setPigScores] = useState<Record<string, number | null>>({})
  const [loadingPigScores, setLoadingPigScores] = useState(false)
  const [pigScoresFetched, setPigScoresFetched] = useState(false)
  const [pigScoreBreakdown, setPigScoreBreakdown] = useState<PigScoreBreakdown | null>(null)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [, setEnrichError] = useState<string | null>(null)
  const enrichFetchingRef = useRef(false) // prevent double-fetch
  const currentPlayer = match.info.participants.find(p => p.puuid === currentPuuid)
  
  // check if match is within 30 days
  const isWithin30Days = (Date.now() - match.info.gameCreation) < (30 * 24 * 60 * 60 * 1000)

  // enrich match with timeline data and pig scores when component mounts (for recent matches)
  useEffect(() => {
    if (!isWithin30Days || pigScoresFetched || enrichFetchingRef.current) return
    
    // check if ALL players already have pig scores (match already enriched)
    const allHavePigScores = match.info.participants.every(p => 
      p.pigScore !== null && p.pigScore !== undefined
    )
    
    if (allHavePigScores) {
      // use cached pig scores from match data
      const cached: Record<string, number | null> = {}
      for (const p of match.info.participants) {
        cached[p.puuid] = p.pigScore ?? null
      }
      setPigScores(cached)
      setPigScoresFetched(true)
      return
    }
    
    enrichFetchingRef.current = true // prevent concurrent fetches
    setLoadingPigScores(true)
    setPigScoresFetched(true) // mark as fetched to prevent re-runs
    setEnrichError(null)
    
    // convert region label (euw, na) to regional cluster (europe, americas)
    const platform = LABEL_TO_PLATFORM[region.toUpperCase()]
    const regionalCluster = platform ? PLATFORM_TO_REGIONAL[platform] : region
    
    // use new enrich-match endpoint to fetch timeline, calculate pig scores, and update stats
    fetch('/api/enrich-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        matchId: match.metadata.matchId,
        region: regionalCluster
      })
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Failed to enrich match')
          })
        }
        return res.json()
      })
      .then(data => {
        if (data?.results) {
          setPigScores(data.results)
          if (data.cached) {
            console.log('Pig scores loaded from cache')
          } else {
            console.log(`Match enriched: ${data.enriched} participants, ${data.statsUpdated} stats updated`)
          }
        }
      })
      .catch(err => {
        console.error('Failed to enrich match:', err)
        setEnrichError(err.message || 'Failed to load pig scores')
        // fallback: try the old calculate-pig-score endpoint
        fetch('/api/calculate-pig-score', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId: match.metadata.matchId })
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.results) {
              setPigScores(data.results)
              setEnrichError(null) // clear error if fallback succeeds
            }
          })
          .catch(() => {}) // ignore fallback errors
      })
      .finally(() => setLoadingPigScores(false))
  }, [match.metadata.matchId, match.info.participants, match.info.gameCreation, isWithin30Days, pigScoresFetched, region])

  // fetch pig score breakdown when performance tab is selected
  useEffect(() => {
    if (selectedTab === 'performance' && !pigScoreBreakdown && !loadingBreakdown) {
      setLoadingBreakdown(true)
      fetch(`/api/pig-score-breakdown?matchId=${match.metadata.matchId}&puuid=${currentPuuid}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && !data.error) {
            setPigScoreBreakdown(data)
          }
        })
        .catch(err => console.error('Failed to fetch pig score breakdown:', err))
        .finally(() => setLoadingBreakdown(false))
    }
  }, [selectedTab, match.metadata.matchId, currentPuuid, pigScoreBreakdown, loadingBreakdown])

  // separate teams
  const team100 = match.info.participants.filter(p => p.teamId === 100)
  const team200 = match.info.participants.filter(p => p.teamId === 200)
  
  const team100Won = team100[0]?.win || false
  const team200Won = team200[0]?.win || false

  const formatDamage = (dmg: number) => new Intl.NumberFormat('en-US').format(dmg)

  // Calculate max values for bars
  const allParticipants = match.info.participants
  const maxDamageDealt = Math.max(...allParticipants.map(p => p.totalDamageDealtToChampions || 0))
  
  // Check if any participant has a pig score (only show PIG column if within 30 days OR scores exist OR loading)
  const hasPigScores = isWithin30Days || loadingPigScores || allParticipants.some(p => 
    (pigScores[p.puuid] ?? p.pigScore) !== null && (pigScores[p.puuid] ?? p.pigScore) !== undefined
  )
  
  // Check if ALL participants have pig scores (for MOG/TRY display)
  const allHavePigScores = allParticipants.every(p => {
    const score = pigScores[p.puuid] ?? p.pigScore
    return score !== null && score !== undefined
  })

  // Helper to get pig score for a participant (returns null if not available)
  const getPigScore = (puuid: string): number | null => {
    const fromState = pigScores[puuid]
    if (fromState !== undefined) return fromState
    const fromMatch = allParticipants.find(p => p.puuid === puuid)?.pigScore
    if (fromMatch !== null && fromMatch !== undefined) return fromMatch
    return null
  }

  // Calculate ranks based on pig score
  const sortedByScore = [...allParticipants].sort((a, b) => {
    const scoreA = getPigScore(a.puuid) ?? 0
    const scoreB = getPigScore(b.puuid) ?? 0
    return scoreB - scoreA
  })

  const getRankInfo = (puuid: string, teamId: number) => {
    const score = getPigScore(puuid)
    const rankIndex = sortedByScore.findIndex(p => p.puuid === puuid)
    const rank = rankIndex + 1
    
    // Only show MOG/TRY if all players have pig scores
    let badge = null
    if (allHavePigScores && score !== null) {
      const winningTeamId = allParticipants.find(p => p.win)?.teamId
      const isWinningTeam = teamId === winningTeamId
      
      const teamPlayers = allParticipants.filter(p => p.teamId === teamId)
      const highestInTeam = teamPlayers.reduce((prev, current) => {
          const prevScore = getPigScore(prev.puuid) ?? 0
          const currScore = getPigScore(current.puuid) ?? 0
          return currScore > prevScore ? current : prev
      })
      
      if (highestInTeam.puuid === puuid) {
          if (isWinningTeam) badge = "MOG"
          else badge = "TRY"
      }
    }
    
    return { rank, badge, score }
  }

  // Lazy load participant details (timeline + PIG score)
  const loadParticipantDetails = async (puuid: string) => {
    // skip if already loading or loaded
    if (participantDetails.has(puuid)) return
    
    // m  ark as loading
    setParticipantDetails(prev => new Map(prev).set(puuid, {
      puuid,
      build_order: null,
      ability_order: null,
      first_buy: null,
      pig_score: null,
      item_timeline: [],
      loading: true
    }))
    
    try {
      const response = await fetch('/api/match-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.metadata.matchId,
          puuid,
          region: region.toUpperCase()
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setParticipantDetails(prev => new Map(prev).set(puuid, {
          puuid,
          build_order: data.build_order,
          ability_order: data.ability_order,
          first_buy: data.first_buy,
          pig_score: data.pig_score,
          item_timeline: data.item_timeline || [],
          loading: false
        }))
      }
    } catch (error) {
      console.error('Failed to load participant details:', error)
      setParticipantDetails(prev => new Map(prev).set(puuid, {
        puuid,
        build_order: null,
        ability_order: null,
        first_buy: null,
        pig_score: null,
        item_timeline: [],
        loading: false
      }))
    }
  }
  
  // load details for current player when switching to build tab
  useEffect(() => {
    if (selectedTab === 'build' && currentPlayer) {
      loadParticipantDetails(currentPlayer.puuid)
    }
  }, [selectedTab, match.metadata.matchId])

  const renderPlayerRow = (p: any, isCurrentPlayer: boolean, isWinningTeam: boolean) => {
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
    const kda = p.deaths === 0 ? "Perfect" : ((p.kills + p.assists) / p.deaths).toFixed(2)
    const playerName = p.riotIdGameName || p.summonerName
    const playerTag = p.riotIdTagline || ""
    const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
    
    const { rank, badge, score } = getRankInfo(p.puuid, p.teamId)
    
    const damageDealtPct = maxDamageDealt > 0 ? (p.totalDamageDealtToChampions / maxDamageDealt) * 100 : 0

    return (
      <tr 
        key={p.puuid} 
        className={clsx(
          "border-b border-abyss-900/25 last:border-b-0",
          isWinningTeam 
            ? (isCurrentPlayer ? "bg-win-light" : "bg-win") 
            : (isCurrentPlayer ? "bg-loss-light" : "bg-loss")
        )}
      >
        {/* champion & player info */}
        <td className="py-1.5 pl-3 pr-2">
          <div className="flex items-center gap-1.5">
            <Link 
              href={`/champions/${getChampionUrlName(p.championName, {})}`}
              className="relative flex-shrink-0 hover:brightness-75 transition-all"
            >
              <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800">
                <Image
                  src={getChampionImageUrl(p.championName, ddragonVersion)}
                  alt={p.championName}
                  width={32}
                  height={32}
                  className="w-full h-full scale-110 object-cover"
                  unoptimized
                />
              </div>
              <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold bg-abyss-700 text-white">
                {p.champLevel}
              </div>
            </Link>
            <div className="flex flex-row gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex gap-0.5">
                  <div className="w-3.5 h-3.5 rounded overflow-hidden bg-abyss-800">
                    <Image src={getSummonerSpellUrl(p.summoner1Id, ddragonVersion)} alt="" width={14} height={14} className="w-full h-full" unoptimized />
                  </div>
                  <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-abyss-800">
                    <Image src={getRuneImageUrl(p.perks?.styles[0]?.selections[0]?.perk)} alt="" width={14} height={14} className="w-full h-full" unoptimized />
                  </div>
                </div>
                <div className="flex gap-0.5">
                  <div className="w-3.5 h-3.5 rounded overflow-hidden bg-abyss-800">
                    <Image src={getSummonerSpellUrl(p.summoner2Id, ddragonVersion)} alt="" width={14} height={14} className="w-full h-full" unoptimized />
                  </div>
                  <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-abyss-800">
                    <Image src={getRuneStyleImageUrl(p.perks?.styles[1]?.style)} alt="" width={14} height={14} className="w-full h-full p-0.5" unoptimized />
                  </div>
                </div>
              </div>
              <div className="gap-1">
                {isCurrentPlayer ? (
                  <span className="text-xs font-medium text-white truncate">
                    {playerName}
                  </span>
                ) : (
                  <Link
                    href={profileUrl}
                    className="text-xs font-medium truncate transition-colors text-text-secondary hover:text-gold-light"
                  >
                    {playerName}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* PIG Score */}
        {hasPigScores && (
          <td className="py-1.25 text-center">
            {score !== null ? (
              <div className="flex flex-col items-center">
                <span 
                  className="text-sm font-bold tabular-nums"
                  style={{ color: getPigScoreColor(score) }}
                >
                  {Math.round(score)}
                </span>
                <span className={clsx(
                  "text-[10px]",
                  badge === "MOG" ? "text-gold-light font-base" : 
                  badge === "TRY" ? "text-gold-light font-base" : 
                  "text-text-muted"
                )}>
                  {badge || `#${rank}`}
                </span>
              </div>
            ) : loadingPigScores ? (
              <div className="w-3 h-3 mx-auto border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light" />
            ) : (
              <span className="text-text-muted text-xs">-</span>
            )}
          </td>
        )}

        {/* KDA */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center">
            <div className="text-xs tabular-nums whitespace-nowrap">
              {p.kills} <span className="text-text-muted">/</span> <span className="text-white">{p.deaths}</span> <span className="text-text-muted">/</span> {p.assists}
            </div>
            <span 
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: kda === "Perfect" ? getKdaColor(99) : getKdaColor(Number(kda)) }}
            >
              {kda}
            </span>
          </div>
        </td>

        {/* Damage */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-white tabular-nums">{formatDamage(p.totalDamageDealtToChampions)}</span>
            <div className="w-12 h-1.5 bg-abyss-800/75 rounded-sm overflow-hidden">
              <div 
                className="h-full bg-negative rounded-full" 
                style={{ width: `${damageDealtPct}%` }}
              />
            </div>
          </div>
        </td>

        {/* CS */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center">
            <span className="text-xs text-text-secondary tabular-nums">{p.totalMinionsKilled}</span>
            <span className="text-[10px] text-text-muted tabular-nums">
              {(p.totalMinionsKilled / (match.info.gameDuration / 60)).toFixed(1)}/m
            </span>
          </div>
        </td>

        {/* Items */}
        <td className="py-1">
          <div className="flex gap-0.5 justify-center">
            {items.map((item, idx) => (
              item > 0 ? (
                <Tooltip key={idx} id={item} type="item">
                  <div className="w-6 h-6 rounded overflow-hidden bg-abyss-800 border border-gold-dark">
                    <Image
                      src={getItemImageUrl(item, ddragonVersion)}
                      alt=""
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </Tooltip>
              ) : (
                <div key={idx} className="w-6 h-6 rounded bg-abyss-800/50 border border-gold-dark/50" />
              )
            ))}
          </div>
        </td>
      </tr>
    )
  }

  const isPlayerInTeam100 = team100.some(p => p.puuid === currentPuuid)
  const teamsToRender = isPlayerInTeam100 
    ? [
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: true },
        { players: team200, won: team200Won, name: 'Red Team', isFirst: false }
      ]
    : [
        { players: team200, won: team200Won, name: 'Red Team', isFirst: true },
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: false }
      ]

  return (
    <div className="bg-abyss-600">
      {/* tab navigation */}
      <div className="flex border-b border-gold-dark/20">
        <button
          onClick={() => setSelectedTab('overview')}
          className={clsx(
            "flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px",
            selectedTab === 'overview'
              ? "border-accent-light text-white"
              : "border-transparent text-text-muted hover:text-white"
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setSelectedTab('build')}
          className={clsx(
            "flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px",
            selectedTab === 'build'
              ? "border-accent-light text-white"
              : "border-transparent text-text-muted hover:text-white"
          )}
        >
          Build
        </button>
        <button
          onClick={() => setSelectedTab('performance')}
          className={clsx(
            "flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px",
            selectedTab === 'performance'
              ? "border-accent-light text-white"
              : "border-transparent text-text-muted hover:text-white"
          )}
        >
          Performance
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {selectedTab === 'overview' ? (
          <div className="flex flex-col">
            {teamsToRender.map((team, teamIdx) => (
              <div 
                key={team.name}
                className={clsx(
                  teamIdx === 0 && "border-b border-abyss-500/50"
                )}
              >
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[28%]" />
                    {hasPigScores && <col className="w-[10%]" />}
                    <col className="w-[13%]" />
                    <col className="w-[13%]" />
                    <col className="w-[8%]" />
                    <col className="w-[28%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-[10px] text-text-muted border-b border-abyss-700 bg-abyss-700">
                      <th className="py-1.5 pl-3 text-left font-normal">
                        <span className={clsx(
                          "text-sm font-semibold",
                          team.won ? "text-accent-light" : "text-negative"
                        )}>
                          {team.won ? 'Victory' : 'Defeat'}
                        </span>
                        <span className="text-xs text-text-muted ml-1.5">({team.name})</span>
                      </th>
                      {hasPigScores && <th className="py-1.5 text-center font-normal">PIG</th>}
                      <th className="py-1.5 text-center font-normal">KDA</th>
                      <th className="py-1.5 text-center font-normal">Damage</th>
                      <th className="py-1.5 text-center font-normal">CS</th>
                      <th className="py-1.5 text-center font-normal">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.players.map(p => renderPlayerRow(p, p.puuid === currentPuuid, team.won))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : selectedTab === 'build' ? (
          <div className="p-4 space-y-4">
            {currentPlayer && (
              <>
                {/* Item Builds - grouped by time */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-xs font-medium text-text-muted mb-3">Item Builds</h3>
                  {(() => {
                    const details = participantDetails.get(currentPlayer.puuid)
                    if (details?.loading) {
                      return (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <div className="w-4 h-4 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
                          Loading...
                        </div>
                      )
                    }
                    
                    // group purchases by time intervals (2-3 min windows)
                    const purchases = (details?.item_timeline || []).filter(e => e.type === 'ITEM_PURCHASED')
                    
                    if (purchases.length === 0) {
                      // fallback: show final items
                      return (
                        <div className="flex gap-1.5 items-center flex-wrap">
                          {[currentPlayer.item0, currentPlayer.item1, currentPlayer.item2, currentPlayer.item3, currentPlayer.item4, currentPlayer.item5]
                            .filter(itemId => itemId > 0)
                            .map((itemId, idx) => (
                              <Tooltip key={idx} id={itemId} type="item">
                                <div className="w-9 h-9 rounded border border-gold-dark overflow-hidden bg-abyss-800">
                                  <Image
                                    src={getItemImageUrl(itemId, ddragonVersion)}
                                    alt={`Item ${itemId}`}
                                    width={36}
                                    height={36}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                </div>
                              </Tooltip>
                            ))}
                        </div>
                      )
                    }
                    
                    // group items by 2-minute intervals
                    const groups: { time: number; items: number[] }[] = []
                    let currentGroup: { time: number; items: number[] } | null = null
                    const INTERVAL = 2 * 60 * 1000 // 2 minutes
                    
                    for (const purchase of purchases) {
                      if (!currentGroup || purchase.timestamp - currentGroup.time > INTERVAL) {
                        if (currentGroup) groups.push(currentGroup)
                        currentGroup = { time: purchase.timestamp, items: [purchase.itemId] }
                      } else {
                        currentGroup.items.push(purchase.itemId)
                      }
                    }
                    if (currentGroup) groups.push(currentGroup)
                    
                    const formatMin = (ms: number) => `${Math.floor(ms / 60000)} min`
                    
                    return (
                      <div className="flex items-start gap-2 overflow-x-auto pb-2">
                        {groups.map((group, gIdx) => (
                          <div key={gIdx} className="flex items-center gap-2">
                            {gIdx > 0 && (
                              <span className="text-text-muted text-lg">&gt;</span>
                            )}
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex flex-col gap-0.5 p-1.5 bg-abyss-800/50 rounded border border-gold-dark/30">
                                {group.items.slice(0, 4).map((itemId, iIdx) => (
                                  <Tooltip key={iIdx} id={itemId} type="item">
                                    <div className="w-8 h-8 rounded border border-gold-dark overflow-hidden bg-abyss-800">
                                      <Image
                                        src={getItemImageUrl(itemId, ddragonVersion)}
                                        alt={`Item ${itemId}`}
                                        width={32}
                                        height={32}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                      />
                                    </div>
                                  </Tooltip>
                                ))}
                                {group.items.length > 4 && (
                                  <div className="text-[10px] text-text-muted text-center">+{group.items.length - 4}</div>
                                )}
                              </div>
                              <span className="text-[10px] text-text-muted">{formatMin(group.time)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* Skill Order */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-xs font-medium text-text-muted mb-3">Skill Order</h3>
                  {(() => {
                    const details = participantDetails.get(currentPlayer.puuid)
                    const abilityOrder = details?.ability_order
                    
                    if (details?.loading) {
                      return (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <div className="w-4 h-4 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
                          Loading...
                        </div>
                      )
                    }
                    
                    if (!abilityOrder) {
                      return <span className="text-xs text-text-muted">No skill data available</span>
                    }
                    
                    const abilities = abilityOrder.split(' ')
                    
                    // determine skill max order (Q, W, E first maxed)
                    const counts = { Q: 0, W: 0, E: 0 }
                    const maxOrder: string[] = []
                    for (const ability of abilities) {
                      if (ability === 'R') continue
                      if (ability in counts) {
                        counts[ability as keyof typeof counts]++
                        // maxed at 5 points
                        if (counts[ability as keyof typeof counts] === 5 && !maxOrder.includes(ability)) {
                          maxOrder.push(ability)
                        }
                      }
                    }
                    // add any abilities not yet maxed (in order of most points)
                    const remaining = ['Q', 'W', 'E'].filter(a => !maxOrder.includes(a))
                    remaining.sort((a, b) => counts[b as keyof typeof counts] - counts[a as keyof typeof counts])
                    maxOrder.push(...remaining)
                    
                    const abilityTextColors: Record<string, string> = {
                      Q: 'text-kda-3',
                      W: 'text-kda-4',
                      E: 'text-kda-5',
                    }
                    
                    return (
                      <div className="space-y-3">
                        {/* Max order display */}
                        <div className="flex items-center gap-2">
                          {maxOrder.map((ability, idx) => (
                            <div key={ability} className="flex items-center gap-1.5">
                              {idx > 0 && <span className="text-text-muted text-sm">&gt;</span>}
                              <div className={clsx(
                                "w-7 h-7 rounded border bg-abyss-800 flex items-center justify-center text-xs font-bold",
                                ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                                abilityTextColors[ability]
                              )}>
                                {ability === 'R' ? <h2 className="text-xs">{ability}</h2> : ability}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* full sequence */}
                        <div className="flex flex-wrap gap-1">
                          {abilities.map((ability, idx) => (
                            <div 
                              key={idx}
                              className={clsx(
                                "w-6 h-6 rounded border bg-abyss-800 text-[12px] font-bold flex items-center justify-center",
                                ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                                abilityTextColors[ability]
                              )}
                            >
                              {ability === 'R' ? <h2 className="text-[12px]">{ability}</h2> : ability}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Runes */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-xs font-medium text-text-muted mb-3">Runes</h3>
                  <div className="flex gap-8">
                    {/* Primary Tree */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        {(() => {
                          const treeId = currentPlayer.perks?.styles[0]?.style
                          const treeInfo = treeId ? (runesData as Record<string, any>)[String(treeId)] : null
                          return (
                            <>
                              {treeInfo?.icon && (
                                <div className="w-6 h-6 rounded-full overflow-hidden">
                                  <Image
                                    src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                                    alt={treeInfo.name || 'Primary'}
                                    width={24}
                                    height={24}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                </div>
                              )}
                              <span className="text-[10px] text-gold-light font-medium">{treeInfo?.name || 'Primary'}</span>
                            </>
                          )
                        })()}
                      </div>
                      <div className="flex gap-2">
                        {/* Keystone */}
                        {(() => {
                          const runeId = currentPlayer.perks?.styles[0]?.selections[0]?.perk
                          const runeInfo = runeId ? (runesData as Record<string, any>)[String(runeId)] : null
                          return runeInfo?.icon ? (
                            <Tooltip id={runeId!} type="rune">
                              <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-gold-light bg-abyss-800">
                                <Image
                                  src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                  alt={runeInfo.name || 'Keystone'}
                                  width={44}
                                  height={44}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              </div>
                            </Tooltip>
                          ) : null
                        })()}
                        {/* Other primary runes */}
                        {[1, 2, 3].map(idx => {
                          const runeId = currentPlayer.perks?.styles[0]?.selections[idx]?.perk
                          const runeInfo = runeId ? (runesData as Record<string, any>)[String(runeId)] : null
                          return runeInfo?.icon ? (
                            <Tooltip key={idx} id={runeId!} type="rune">
                              <div className="w-8 h-8 rounded-full overflow-hidden border border-gold-dark bg-abyss-800">
                                <Image
                                  src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                  alt={runeInfo.name || 'Rune'}
                                  width={32}
                                  height={32}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              </div>
                            </Tooltip>
                          ) : null
                        })}
                      </div>
                    </div>
                    
                    {/* Secondary Tree */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        {(() => {
                          const treeId = currentPlayer.perks?.styles[1]?.style
                          const treeInfo = treeId ? (runesData as Record<string, any>)[String(treeId)] : null
                          return (
                            <>
                              {treeInfo?.icon && (
                                <div className="w-6 h-6 rounded-full overflow-hidden">
                                  <Image
                                    src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                                    alt={treeInfo.name || 'Secondary'}
                                    width={24}
                                    height={24}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                </div>
                              )}
                              <span className="text-[10px] text-text-muted font-medium">{treeInfo?.name || 'Secondary'}</span>
                            </>
                          )
                        })()}
                      </div>
                      <div className="flex gap-2">
                        {[0, 1].map(idx => {
                          const runeId = currentPlayer.perks?.styles[1]?.selections[idx]?.perk
                          const runeInfo = runeId ? (runesData as Record<string, any>)[String(runeId)] : null
                          return runeInfo?.icon ? (
                            <Tooltip key={idx} id={runeId!} type="rune">
                              <div className="w-8 h-8 rounded-full overflow-hidden border border-gold-dark bg-abyss-800">
                                <Image
                                  src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                  alt={runeInfo.name || 'Rune'}
                                  width={32}
                                  height={32}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              </div>
                            </Tooltip>
                          ) : null
                        })}
                      </div>
                    </div>
                    
                    {/* Stat Shards */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-text-muted font-medium">Shards</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[currentPlayer.perks?.statPerks?.offense,
                          currentPlayer.perks?.statPerks?.flex,
                          currentPlayer.perks?.statPerks?.defense]
                          .map((shardId, idx) => (
                            <div key={idx} className="w-6 h-6 rounded-full bg-abyss-800 border border-gold-dark/50 flex items-center justify-center">
                              <span className="text-[9px] text-text-muted font-medium">+</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {(loadingBreakdown || !pigScoreBreakdown) ? (
              <div className="min-h-[200px] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
              </div>
            ) : (
              <>
                {/* PIG Score Summary */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">PIG Score Breakdown</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tabular-nums" style={{ color: getPigScoreColor(pigScoreBreakdown.finalScore) }}>
                        {pigScoreBreakdown.finalScore}
                      </span>
                      <span className="text-xs text-text-muted">/ 100</span>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mb-4">
                    Based on {pigScoreBreakdown.totalGames.toLocaleString()} games on patch {pigScoreBreakdown.patch}
                    {pigScoreBreakdown.usedFallbackPatch && pigScoreBreakdown.matchPatch && (
                      <span className="text-gold-light ml-1" title={`Match played on patch ${pigScoreBreakdown.matchPatch}, but no data available for that patch. Using closest available patch data.`}>
                        (match: {pigScoreBreakdown.matchPatch} ⚠)
                      </span>
                    )}
                  </p>
                  
                  {/* Penalties Grid */}
                  <div className="space-y-2.5">
                    {pigScoreBreakdown.penalties.map((p, idx) => {
                      const isGood = p.penalty === 0
                      const isBad = p.penalty >= p.maxPenalty * 0.5
                      const isModerate = !isGood && !isBad
                      
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          {/* Status indicator */}
                          <div className={clsx(
                            "w-1.5 h-1.5 rounded-full flex-shrink-0",
                            isGood && "bg-accent-light",
                            isModerate && "bg-gold-light",
                            isBad && "bg-negative"
                          )} />
                          
                          {/* Stat name */}
                          <span className="text-xs text-white w-36 flex-shrink-0">{p.name}</span>
                          
                          {/* Progress bar */}
                          <div className="flex-1 h-1.5 bg-abyss-800 rounded-full overflow-hidden">
                            <div 
                              className={clsx(
                                "h-full rounded-full transition-all",
                                isGood && "bg-gradient-to-r from-accent-light/80 to-accent-light",
                                isModerate && "bg-gradient-to-r from-gold-dark to-gold-light",
                                isBad && "bg-gradient-to-r from-negative/80 to-negative"
                              )}
                              style={{ width: `${Math.max(5, 100 - (p.penalty / p.maxPenalty) * 100)}%` }}
                            />
                          </div>
                          
                          {/* Penalty value */}
                          <span className={clsx(
                            "text-xs font-mono w-12 text-right tabular-nums",
                            isGood && "text-accent-light",
                            isModerate && "text-gold-light",
                            isBad && "text-negative"
                          )}>
                            {p.penalty === 0 ? 'MAX' : `-${p.penalty.toFixed(1)}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Detailed Stats Comparison */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-sm font-semibold text-white mb-4">Stats vs Champion Average</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Damage to Champions */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">Damage to Champions /min</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.damageToChampionsPerMin.toFixed(0)}
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.damageToChampionsPerMin.toFixed(0)} avg
                        </span>
                      </div>
                      {(() => {
                        const p = pigScoreBreakdown.penalties.find(p => p.name === 'Damage to Champions')
                        if (!p?.percentOfAvg) return null
                        return (
                          <div className={clsx(
                            "text-xs mt-1 font-medium",
                            p.percentOfAvg >= 100 ? "text-accent-light" : p.percentOfAvg >= 80 ? "text-gold-light" : "text-negative"
                          )}>
                            {p.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>
                    
                    {/* Total Damage */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">Total Damage /min</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.totalDamagePerMin.toFixed(0)}
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.totalDamagePerMin.toFixed(0)} avg
                        </span>
                      </div>
                      {(() => {
                        const p = pigScoreBreakdown.penalties.find(p => p.name === 'Total Damage')
                        if (!p?.percentOfAvg) return null
                        return (
                          <div className={clsx(
                            "text-xs mt-1 font-medium",
                            p.percentOfAvg >= 100 ? "text-accent-light" : p.percentOfAvg >= 80 ? "text-gold-light" : "text-negative"
                          )}>
                            {p.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>
                    
                    {/* Healing/Shielding */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">Healing + Shielding /min</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.healingShieldingPerMin.toFixed(0)}
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.healingShieldingPerMin.toFixed(0)} avg
                        </span>
                      </div>
                      {(() => {
                        const p = pigScoreBreakdown.penalties.find(p => p.name === 'Healing/Shielding')
                        if (!p?.percentOfAvg) return null
                        return (
                          <div className={clsx(
                            "text-xs mt-1 font-medium",
                            p.percentOfAvg >= 100 ? "text-accent-light" : p.percentOfAvg >= 80 ? "text-gold-light" : "text-negative"
                          )}>
                            {p.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>
                    
                    {/* CC Time */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">CC Time /min</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.ccTimePerMin.toFixed(1)}s
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.ccTimePerMin.toFixed(1)}s avg
                        </span>
                      </div>
                      {(() => {
                        const p = pigScoreBreakdown.penalties.find(p => p.name === 'CC Time')
                        if (!p?.percentOfAvg) return null
                        return (
                          <div className={clsx(
                            "text-xs mt-1 font-medium",
                            p.percentOfAvg >= 100 ? "text-accent-light" : p.percentOfAvg >= 80 ? "text-gold-light" : "text-negative"
                          )}>
                            {p.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>
                    
                    {/* Deaths per Min */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3 col-span-2">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">Deaths per Minute</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.deathsPerMin.toFixed(2)}
                        </span>
                        <span className="text-xs text-text-muted">
                          (optimal: 0.5-0.7)
                        </span>
                      </div>
                      {(() => {
                        const dpm = pigScoreBreakdown.playerStats.deathsPerMin
                        const isOptimal = dpm >= 0.5 && dpm <= 0.7
                        const isTooFew = dpm < 0.5
                        return (
                          <div className={clsx(
                            "text-xs mt-1 font-medium",
                            isOptimal ? "text-accent-light" : isTooFew ? "text-gold-light" : "text-negative"
                          )}>
                            {isOptimal ? 'Optimal engagement' : isTooFew ? 'Could engage more' : 'Too many deaths'}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {/* Item Build Breakdown */}
                {pigScoreBreakdown.itemDetails && pigScoreBreakdown.itemDetails.length > 0 && (
                  <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Item Build Analysis</h3>
                    <div className="space-y-2">
                      {pigScoreBreakdown.itemDetails.map((item, idx) => {
                        const isGood = item.reason === 'optimal' || item.reason === 'boots'
                        const isBad = item.reason === 'off-meta' || item.penalty >= 2
                        const slotNames = ['1st Item', '2nd Item', '3rd Item']
                        
                        return (
                          <div key={idx} className="flex items-center gap-3 py-1">
                            <div className={clsx(
                              "w-1.5 h-1.5 rounded-full flex-shrink-0",
                              isGood && "bg-accent-light",
                              !isGood && !isBad && "bg-gold-light",
                              isBad && "bg-negative"
                            )} />
                            <span className="text-xs text-text-muted w-16 flex-shrink-0">{slotNames[item.slot] || `Slot ${item.slot + 1}`}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {item.itemId > 0 && (
                                  <Image
                                    src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${item.itemId}.png`}
                                    alt={`Item ${item.itemId}`}
                                    width={20}
                                    height={20}
                                    className="rounded"
                                    unoptimized
                                  />
                                )}
                                <span className={clsx(
                                  "text-xs",
                                  isGood ? "text-accent-light" : isBad ? "text-negative" : "text-gold-light"
                                )}>
                                  {item.reason === 'optimal' ? 'Top 5 choice' : 
                                   item.reason === 'boots' ? 'Boots (no penalty)' :
                                   item.reason === 'suboptimal' ? `Suboptimal (-${item.penalty.toFixed(1)})` :
                                   item.reason === 'off-meta' ? 'Off-meta pick' : 'Unknown item'}
                                </span>
                              </div>
                              {item.playerWinrate !== undefined && item.topWinrate !== undefined && (
                                <div className="text-[10px] text-text-muted mt-0.5">
                                  {item.playerWinrate.toFixed(1)}% WR vs {item.topWinrate.toFixed(1)}% top WR
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Scoring Formula Info */}
                {pigScoreBreakdown.scoringInfo && (
                  <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                    <h3 className="text-sm font-semibold text-white mb-2">How PIG Score Works</h3>
                    <p className="text-xs text-text-muted mb-3">
                      {pigScoreBreakdown.scoringInfo.description}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-abyss-800/50 rounded p-2">
                        <div className="text-text-muted mb-1">Target Performance</div>
                        <div className="text-white font-medium">Top ~16% (mean + 1σ)</div>
                      </div>
                      <div className="bg-abyss-800/50 rounded p-2">
                        <div className="text-text-muted mb-1">Average = Penalty</div>
                        <div className="text-gold-light font-medium">25% of max</div>
                      </div>
                    </div>
                    
                    {/* Z-Score details for stats that have them */}
                    {pigScoreBreakdown.penalties.some(p => p.zScore !== undefined) && (
                      <div className="mt-3 pt-3 border-t border-abyss-600">
                        <div className="text-[11px] text-text-muted mb-2 uppercase tracking-wide">Your Z-Scores (vs other players)</div>
                        <div className="grid grid-cols-2 gap-2">
                          {pigScoreBreakdown.penalties
                            .filter(p => p.zScore !== undefined)
                            .map((p, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-text-muted">{p.name}</span>
                                <span className={clsx(
                                  "font-mono tabular-nums",
                                  (p.zScore ?? 0) >= 1 ? "text-accent-light" : 
                                  (p.zScore ?? 0) >= 0 ? "text-gold-light" : "text-negative"
                                )}>
                                  {(p.zScore ?? 0) >= 0 ? '+' : ''}{p.zScore?.toFixed(2)}σ
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
