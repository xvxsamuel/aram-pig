"use client"

import { useState, useEffect, useRef } from "react"
import type { MatchData } from "@/lib/riot-api"
import Image from "next/image"
import Link from "next/link"
import clsx from "clsx"
import { getChampionImageUrl, getItemImageUrl, getRuneImageUrl, getRuneStyleImageUrl, getSummonerSpellUrl } from "@/lib/ddragon-client"
import { getChampionUrlName } from "@/lib/champion-names"
import { getKdaColor, getPigScoreColor } from "@/lib/winrate-colors"
import Tooltip from "@/components/ui/Tooltip"
import runesData from "@/data/runes.json"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "@/lib/regions"

interface Props {
  match: MatchData
  currentPuuid: string
  ddragonVersion: string
  region: string
  isWin: boolean
  isRemake: boolean
}

interface ItemTimelineEvent {
  timestamp: number
  type: 'ITEM_PURCHASED' | 'ITEM_SOLD' | 'ITEM_UNDO'
  itemId: number
}

interface ParticipantDetails {
  puuid: string
  build_order: string | null
  first_buy: string | null
  pig_score: number | null
  item_timeline: ItemTimelineEvent[]
  loading: boolean
}

interface PigScoreBreakdown {
  finalScore: number
  playerStats: {
    damageToChampionsPerMin: number
    totalDamagePerMin: number
    healingShieldingPerMin: number
    ccTimePerMin: number
    deathsPerMin: number
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
  }[]
  totalGames: number
  patch: string
}

export default function MatchDetails({ match, currentPuuid, ddragonVersion, region, isWin: _isWin, isRemake: _isRemake }: Props) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'build' | 'performance'>('overview')
  const [participantDetails, setParticipantDetails] = useState<Map<string, ParticipantDetails>>(new Map())
  const [pigScores, setPigScores] = useState<Record<string, number | null>>({})
  const [loadingPigScores, setLoadingPigScores] = useState(false)
  const [pigScoresFetched, setPigScoresFetched] = useState(false)
  const [pigScoreBreakdown, setPigScoreBreakdown] = useState<PigScoreBreakdown | null>(null)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [_enrichError, setEnrichError] = useState<string | null>(null)
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
  
  // Check if ALL participants have pig scores (for MVP/ACE display)
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
    
    // Only show MVP/ACE if all players have pig scores
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
          if (isWinningTeam) badge = "MVP"
          else badge = "ACE"
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
    
    const { badge, score } = getRankInfo(p.puuid, p.teamId)
    
    const damageDealtPct = maxDamageDealt > 0 ? (p.totalDamageDealtToChampions / maxDamageDealt) * 100 : 0

    return (
      <tr 
        key={p.puuid} 
        className={clsx(
          "border-b border-abyss-500/30 last:border-b-0",
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
                />
              </div>
              <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold bg-abyss-700 text-white">
                {p.champLevel}
              </div>
            </Link>
            
            <div className="flex flex-col gap-0.5">
              <div className="flex gap-0.5">
                <div className="w-3.5 h-3.5 rounded overflow-hidden bg-abyss-800">
                  <Image src={getSummonerSpellUrl(p.summoner1Id, ddragonVersion)} alt="" width={14} height={14} className="w-full h-full" />
                </div>
                <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-abyss-800">
                  <Image src={getRuneImageUrl(p.perks?.styles[0]?.selections[0]?.perk)} alt="" width={14} height={14} className="w-full h-full" />
                </div>
              </div>
              <div className="flex gap-0.5">
                <div className="w-3.5 h-3.5 rounded overflow-hidden bg-abyss-800">
                  <Image src={getSummonerSpellUrl(p.summoner2Id, ddragonVersion)} alt="" width={14} height={14} className="w-full h-full" />
                </div>
                <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-abyss-800">
                  <Image src={getRuneStyleImageUrl(p.perks?.styles[1]?.style)} alt="" width={14} height={14} className="w-full h-full p-0.5" />
                </div>
              </div>
            </div>

            <Link 
              href={profileUrl}
              className={clsx(
                "text-xs font-medium truncate transition-colors",
                isCurrentPlayer ? "text-white" : "text-text-secondary hover:text-gold-light"
              )}
            >
              {playerName}
            </Link>
          </div>
        </td>

        {/* PIG Score */}
        {hasPigScores && (
          <td className="py-1.5 text-center">
            {score !== null ? (
              <div className="flex flex-col items-center">
                <span 
                  className="text-xs font-bold tabular-nums"
                  style={{ color: getPigScoreColor(score) }}
                >
                  {Math.round(score)}
                </span>
                {badge && (
                  <span className="text-[9px] text-text-muted">{badge}</span>
                )}
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
          <div className="text-xs text-white tabular-nums whitespace-nowrap">
            {p.kills} / <span className="text-negative">{p.deaths}</span> / {p.assists}
            <span 
              className="ml-1 font-semibold"
              style={{ color: kda === "Perfect" ? getKdaColor(99) : getKdaColor(Number(kda)) }}
            >
              {kda}
            </span>
          </div>
        </td>

        {/* Damage */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-white tabular-nums">{formatDamage(p.totalDamageDealtToChampions)}</span>
            <div className="w-12 h-1 bg-abyss-800 rounded-full overflow-hidden">
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
                    <tr className="text-[10px] text-text-muted border-b border-abyss-500/30 bg-abyss-800/60">
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
                {/* item Timeline */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Item Timeline</h3>
                  {(() => {
                    const details = participantDetails.get(currentPlayer.puuid)
                    if (details?.loading) {
                      return (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <div className="w-4 h-4 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
                          Loading timeline...
                        </div>
                      )
                    }
                    if (!details?.item_timeline || details.item_timeline.length === 0) {
                      return (
                        <div className="flex gap-2 items-center flex-wrap">
                          {[currentPlayer.item0, currentPlayer.item1, currentPlayer.item2, currentPlayer.item3, currentPlayer.item4, currentPlayer.item5]
                            .filter(itemId => itemId > 0)
                            .map((itemId, idx) => (
                              <div key={idx} className="relative group">
                                <div className="w-11 h-11 rounded border border-gold-dark overflow-hidden bg-abyss-800">
                                  <Image
                                    src={getItemImageUrl(itemId, ddragonVersion)}
                                    alt={`Item ${itemId}`}
                                    width={44}
                                    height={44}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      )
                    }
                    
                    const formatTime = (ms: number) => {
                      const minutes = Math.floor(ms / 60000)
                      const seconds = Math.floor((ms % 60000) / 1000)
                      return `${minutes}:${seconds.toString().padStart(2, '0')}`
                    }
                    
                    return (
                      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-2">
                        {details.item_timeline.map((event, idx) => (
                          <div key={idx} className="flex items-center gap-3 py-1 px-2 rounded hover:bg-white/5 transition-colors">
                            <span className="text-xs text-text-muted font-mono w-10 tabular-nums">{formatTime(event.timestamp)}</span>
                            <div className="w-7 h-7 rounded border border-gold-dark overflow-hidden bg-abyss-800">
                              <Image
                                src={getItemImageUrl(event.itemId, ddragonVersion)}
                                alt={`Item ${event.itemId}`}
                                width={28}
                                height={28}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className={clsx(
                              "text-xs font-medium",
                              event.type === 'ITEM_PURCHASED' && "text-accent-light",
                              event.type === 'ITEM_SOLD' && "text-negative",
                              event.type === 'ITEM_UNDO' && "text-gold-light"
                            )}>
                              {event.type === 'ITEM_PURCHASED' && 'Purchased'}
                              {event.type === 'ITEM_SOLD' && 'Sold'}
                              {event.type === 'ITEM_UNDO' && 'Undo'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* runes */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Runes</h3>
                  <div className="flex gap-8">
                    {/* primary Tree */}
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gold-light mb-2">Primary</div>
                      <div className="flex gap-2">
                        {[currentPlayer.perks?.styles[0]?.selections[0]?.perk,
                          currentPlayer.perks?.styles[0]?.selections[1]?.perk,
                          currentPlayer.perks?.styles[0]?.selections[2]?.perk,
                          currentPlayer.perks?.styles[0]?.selections[3]?.perk]
                          .filter(Boolean)
                          .map((runeId, idx) => {
                            const runeInfo = (runesData as Record<string, any>)[String(runeId)]
                            const runeIcon = runeInfo?.icon
                            return (
                              <Tooltip key={idx} id={runeId!} type="rune">
                                <div className={clsx(
                                  "w-10 h-10 rounded-full overflow-hidden border transition-colors",
                                  idx === 0 ? "border-gold-light bg-gold-dark/30 w-12 h-12" : "border-gold-dark bg-abyss-800"
                                )}>
                                  {runeIcon && (
                                    <Image
                                      src={`https://ddragon.leagueoflegends.com/cdn/img/${runeIcon}`}
                                      alt="Rune"
                                      width={48}
                                      height={48}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                              </Tooltip>
                            )
                          })}
                      </div>
                    </div>

                    {/* Secondary Tree */}
                    <div>
                      <div className="text-xs font-medium text-text-muted mb-2">Secondary</div>
                      <div className="flex gap-2">
                        {[currentPlayer.perks?.styles[1]?.selections[0]?.perk,
                          currentPlayer.perks?.styles[1]?.selections[1]?.perk]
                          .filter(Boolean)
                          .map((runeId, idx) => {
                            const runeInfo = (runesData as Record<string, any>)[String(runeId)]
                            const runeIcon = runeInfo?.icon
                            return (
                              <Tooltip key={idx} id={runeId!} type="rune">
                                <div className="w-9 h-9 rounded-full overflow-hidden border border-gold-dark bg-abyss-800">
                                  {runeIcon && (
                                    <Image
                                      src={`https://ddragon.leagueoflegends.com/cdn/img/${runeIcon}`}
                                      alt="Rune"
                                      width={36}
                                      height={36}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                              </Tooltip>
                            )
                          })}
                      </div>
                    </div>

                    {/* Stat Shards */}
                    <div>
                      <div className="text-xs font-medium text-text-muted mb-2">Shards</div>
                      <div className="flex gap-1.5">
                        {[currentPlayer.perks?.statPerks?.offense,
                          currentPlayer.perks?.statPerks?.flex,
                          currentPlayer.perks?.statPerks?.defense]
                          .filter(Boolean)
                          .map((shardId, idx) => (
                            <div key={idx} className="w-7 h-7 rounded-full bg-abyss-800 border border-gold-dark flex items-center justify-center">
                              <span className="text-[10px] text-text-muted font-bold">+</span>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
