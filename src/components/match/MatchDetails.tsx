'use client'

import { useState, useEffect, useRef } from 'react'
import type { MatchData } from '@/types/match'
import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import {
  getChampionImageUrl,
  getItemImageUrl,
  getRuneImageUrl,
  getRuneStyleImageUrl,
  getSummonerSpellUrl,
  getChampionUrlName,
} from '@/lib/ddragon'
import { getKdaColor, getPigScoreColor } from '@/lib/ui'
import Tooltip from '@/components/ui/Tooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import runesData from '@/data/runes.json'
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from '@/lib/game'

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

interface CompletedItem {
  itemId: number
  timestamp: number
  itemName: string
  itemType: 'legendary' | 'boots' | 'mythic' | 'other'
}

interface TakedownEvent {
  t: number // timestamp in seconds
  gold: number // victim gold
  tf: boolean // teamfight
  wasKill: boolean // true = kill, false = assist (display only)
  pos?: number // position score 0-100 (higher = in enemy territory/pushing)
  value?: number // quality value 0-100
  x?: number // raw x coordinate for map display
  y?: number // raw y coordinate for map display
}

interface DeathEvent {
  t: number
  gold: number // player gold at death
  tf: boolean
  pos?: number // position score 0-100 (higher = in enemy territory/pushing)
  value?: number // quality value 0-100
  x?: number // raw x coordinate for map display
  y?: number // raw y coordinate for map display
}

interface TowerEvent {
  t: number // timestamp in seconds
  x: number // raw x coordinate
  y: number // raw y coordinate
  team: 'ally' | 'enemy' // which team's tower was destroyed
}

interface KillDeathTimeline {
  takedowns: TakedownEvent[]
  deaths: DeathEvent[]
  towers?: TowerEvent[]
  deathScore: number
  takedownScore: number
}

interface ParticipantDetails {
  puuid: string
  build_order: string | null
  ability_order: string | null
  first_buy: string | null
  pig_score: number | null
  item_timeline: ItemTimelineEvent[]
  completed_items: CompletedItem[]
  kill_death_timeline: KillDeathTimeline | null
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
  componentScores: {
    performance: number
    build: number
    timeline: number
    kda: number
  }
  metrics: {
    name: string
    score: number
    weight: number
    playerValue?: number
    avgValue?: number
    percentOfAvg?: number
    zScore?: number
  }[]
  itemDetails?: ItemPenaltyDetail[]
  scoringInfo?: {
    targetPercentile: number
    averageScore: number
    description: string
  }
  totalGames: number
  patch: string
  matchPatch?: string
  usedFallbackPatch?: boolean
}

export default function MatchDetails({
  match,
  currentPuuid,
  ddragonVersion,
  region,
  defaultTab = 'overview',
  onTabChange,
}: Props) {
  const currentPlayer = match.info.participants.find(p => p.puuid === currentPuuid)

  // check if match is within 30 days (timeline data availability from Riot API)
  const isWithin30Days = Date.now() - match.info.gameCreation < 30 * 24 * 60 * 60 * 1000

  // check if current player already has a PIG score (from previous calculation)
  const hasExistingPigScore = currentPlayer?.pigScore !== null && currentPlayer?.pigScore !== undefined

  // check if game was a remake (no PIG score for remakes)
  const isRemake = currentPlayer?.gameEndedInEarlySurrender ?? false

  // Check if performance tab should be available (within 30 days OR has existing score)
  const canShowPerformanceTab = (isWithin30Days && !isRemake) || hasExistingPigScore

  // Determine initial tab - fall back to overview if performance not available
  const getValidTab = (tab: 'overview' | 'build' | 'performance') => {
    if (tab === 'performance' && !canShowPerformanceTab) return 'overview'
    return tab
  }

  const [selectedTab, setSelectedTabState] = useState<'overview' | 'build' | 'performance'>(() =>
    getValidTab(defaultTab)
  )

  // sync tab when parent changes defaultTab (e.g., clicking PIG button when already expanded)
  useEffect(() => {
    setSelectedTabState(getValidTab(defaultTab))
  }, [defaultTab, canShowPerformanceTab])

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

  // enrich match with timeline data and pig scores when component mounts (for recent matches)
  useEffect(() => {
    if (!isWithin30Days || isRemake || pigScoresFetched || enrichFetchingRef.current) return

    // check if ALL players already have pig scores (match already enriched)
    const allHavePigScores = match.info.participants.every(p => p.pigScore !== null && p.pigScore !== undefined)

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
        region: regionalCluster,
      }),
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
          body: JSON.stringify({ matchId: match.metadata.matchId }),
        })
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data?.results) {
              setPigScores(data.results)
              setEnrichError(null) // clear error if fallback succeeds
            }
          })
          .catch(() => {}) // ignore fallback errors
      })
      .finally(() => setLoadingPigScores(false))
  }, [
    match.metadata.matchId,
    match.info.participants,
    match.info.gameCreation,
    isWithin30Days,
    isRemake,
    pigScoresFetched,
    region,
  ])

  // fetch pig score breakdown when performance tab is selected
  useEffect(() => {
    if (selectedTab === 'performance' && !pigScoreBreakdown && !loadingBreakdown) {
      setLoadingBreakdown(true)
      fetch(`/api/pig-score-breakdown?matchId=${match.metadata.matchId}&puuid=${currentPuuid}`)
        .then(res => (res.ok ? res.json() : null))
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

  // Check if any participant has a pig score (only show PIG column if within 30 days, not a remake, OR scores exist OR loading)
  const hasPigScores =
    (isWithin30Days && !isRemake) ||
    loadingPigScores ||
    allParticipants.some(
      p => (pigScores[p.puuid] ?? p.pigScore) !== null && (pigScores[p.puuid] ?? p.pigScore) !== undefined
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
        if (isWinningTeam) badge = 'MOG'
        else badge = 'TRY'
      }
    }

    return { rank, badge, score }
  }

  // Lazy load participant details (timeline + PIG score)
  const loadParticipantDetails = async (puuid: string) => {
    // skip if already loading or loaded
    if (participantDetails.has(puuid)) return

    // mark as loading
    setParticipantDetails(prev =>
      new Map(prev).set(puuid, {
        puuid,
        build_order: null,
        ability_order: null,
        first_buy: null,
        pig_score: null,
        item_timeline: [],
        completed_items: [],
        kill_death_timeline: null,
        loading: true,
      })
    )

    try {
      const response = await fetch('/api/match-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.metadata.matchId,
          puuid,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setParticipantDetails(prev =>
          new Map(prev).set(puuid, {
            puuid,
            build_order: data.build_order,
            ability_order: data.ability_order,
            first_buy: data.first_buy,
            pig_score: data.pig_score,
            item_timeline: data.item_timeline || [],
            completed_items: data.completed_items || [],
            kill_death_timeline: data.kill_death_timeline || null,
            loading: false,
          })
        )
      }
    } catch (error) {
      console.error('Failed to load participant details:', error)
      setParticipantDetails(prev =>
        new Map(prev).set(puuid, {
          puuid,
          build_order: null,
          ability_order: null,
          first_buy: null,
          pig_score: null,
          item_timeline: [],
          completed_items: [],
          kill_death_timeline: null,
          loading: false,
        })
      )
    }
  }

  // load details for current player when switching to build or performance tab
  useEffect(() => {
    if ((selectedTab === 'build' || selectedTab === 'performance') && currentPlayer) {
      loadParticipantDetails(currentPlayer.puuid)
    }
  }, [selectedTab, match.metadata.matchId])

  const renderPlayerRow = (p: any, isCurrentPlayer: boolean, isWinningTeam: boolean) => {
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
    const kda = p.deaths === 0 ? 'Perfect' : ((p.kills + p.assists) / p.deaths).toFixed(2)
    const playerName = p.riotIdGameName || p.summonerName
    const playerTag = p.riotIdTagline || ''
    const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`

    const { rank, badge, score } = getRankInfo(p.puuid, p.teamId)

    const damageDealtPct = maxDamageDealt > 0 ? (p.totalDamageDealtToChampions / maxDamageDealt) * 100 : 0

    return (
      <tr
        key={p.puuid}
        className={clsx(
          'border-b border-abyss-900/25 last:border-b-0',
          isWinningTeam ? (isCurrentPlayer ? 'bg-win-light' : 'bg-win') : isCurrentPlayer ? 'bg-loss-light' : 'bg-loss'
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
                    <Image
                      src={getSummonerSpellUrl(p.summoner1Id, ddragonVersion)}
                      alt=""
                      width={14}
                      height={14}
                      className="w-full h-full"
                      unoptimized
                    />
                  </div>
                  <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-abyss-800">
                    <Image
                      src={getRuneImageUrl(p.perks?.styles[0]?.selections[0]?.perk)}
                      alt=""
                      width={14}
                      height={14}
                      className="w-full h-full"
                      unoptimized
                    />
                  </div>
                </div>
                <div className="flex gap-0.5">
                  <div className="w-3.5 h-3.5 rounded overflow-hidden bg-abyss-800">
                    <Image
                      src={getSummonerSpellUrl(p.summoner2Id, ddragonVersion)}
                      alt=""
                      width={14}
                      height={14}
                      className="w-full h-full"
                      unoptimized
                    />
                  </div>
                  <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-abyss-800">
                    <Image
                      src={getRuneStyleImageUrl(p.perks?.styles[1]?.style)}
                      alt=""
                      width={14}
                      height={14}
                      className="w-full h-full p-0.5"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <div className="gap-1">
                {isCurrentPlayer ? (
                  <span className="text-xs font-medium text-white truncate">{playerName}</span>
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
                <span className="text-sm font-bold tabular-nums" style={{ color: getPigScoreColor(score) }}>
                  {Math.round(score)}
                </span>
                <span
                  className={clsx(
                    'text-[10px]',
                    badge === 'MOG'
                      ? 'text-gold-light font-base'
                      : badge === 'TRY'
                        ? 'text-gold-light font-base'
                        : 'text-text-muted'
                  )}
                >
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
              {p.kills} <span className="text-text-muted">/</span> <span className="text-white">{p.deaths}</span>{' '}
              <span className="text-text-muted">/</span> {p.assists}
            </div>
            <span
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: kda === 'Perfect' ? getKdaColor(99) : getKdaColor(Number(kda)) }}
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
              <div className="h-full bg-negative rounded-full" style={{ width: `${damageDealtPct}%` }} />
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
            {items.map((item, idx) =>
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
            )}
          </div>
        </td>
      </tr>
    )
  }

  const isPlayerInTeam100 = team100.some(p => p.puuid === currentPuuid)
  const teamsToRender = isPlayerInTeam100
    ? [
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: true },
        { players: team200, won: team200Won, name: 'Red Team', isFirst: false },
      ]
    : [
        { players: team200, won: team200Won, name: 'Red Team', isFirst: true },
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: false },
      ]

  return (
    <div className="bg-abyss-600">
      {/* tab navigation */}
      <div className="flex border-b border-gold-dark/20">
        <button
          onClick={() => setSelectedTab('overview')}
          className={clsx(
            'flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px',
            selectedTab === 'overview'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setSelectedTab('build')}
          className={clsx(
            'flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px',
            selectedTab === 'build'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Build
        </button>
        {canShowPerformanceTab && (
          <button
            onClick={() => setSelectedTab('performance')}
            className={clsx(
              'flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px',
              selectedTab === 'performance'
                ? 'border-accent-light text-white'
                : 'border-transparent text-text-muted hover:text-white'
            )}
          >
            Performance
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {selectedTab === 'overview' ? (
          <div className="flex flex-col">
            {teamsToRender.map((team, teamIdx) => (
              <div key={team.name} className={clsx(teamIdx === 0 && 'border-b border-abyss-500/50')}>
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
                        <span
                          className={clsx('text-sm font-semibold', team.won ? 'text-accent-light' : 'text-negative')}
                        >
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
                  <tbody>{team.players.map(p => renderPlayerRow(p, p.puuid === currentPuuid, team.won))}</tbody>
                </table>
              </div>
            ))}
          </div>
        ) : selectedTab === 'build' ? (
          <div className="p-4 space-y-4">
            {currentPlayer && (
              <>
                {/* Items Timeline with Components */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-xs font-medium text-text-muted mb-3">Items</h3>
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

                    const itemTimeline = details?.item_timeline || []

                    if (itemTimeline.length === 0) {
                      // fallback: show final items without timestamps
                      return (
                        <div className="flex gap-2 items-center flex-wrap">
                          {[
                            currentPlayer.item0,
                            currentPlayer.item1,
                            currentPlayer.item2,
                            currentPlayer.item3,
                            currentPlayer.item4,
                            currentPlayer.item5,
                          ]
                            .filter(itemId => itemId > 0)
                            .map((itemId, idx) => (
                              <Tooltip key={idx} id={itemId} type="item">
                                <div className="w-10 h-10 rounded border border-gold-dark overflow-hidden bg-abyss-800">
                                  <Image
                                    src={getItemImageUrl(itemId, ddragonVersion)}
                                    alt={`Item ${itemId}`}
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                </div>
                              </Tooltip>
                            ))}
                          <span className="text-xs text-text-muted ml-2">(Timeline unavailable)</span>
                        </div>
                      )
                    }

                    // group items by minute and filter to only purchases
                    const purchases = itemTimeline.filter(e => e.type === 'ITEM_PURCHASED')

                    // group by minute (round down to nearest minute)
                    const groupedByMinute = new Map<number, typeof purchases>()
                    for (const event of purchases) {
                      const minute = Math.floor(event.timestamp / 60000)
                      if (!groupedByMinute.has(minute)) {
                        groupedByMinute.set(minute, [])
                      }
                      groupedByMinute.get(minute)!.push(event)
                    }

                    // sort groups by minute
                    const sortedGroups = Array.from(groupedByMinute.entries()).sort((a, b) => a[0] - b[0])

                    return (
                      <div className="flex flex-wrap gap-4">
                        {sortedGroups.map(([minute, items]) => (
                          <div key={minute} className="flex flex-col items-center gap-1.5">
                            <div className="flex gap-1 items-center">
                              {items
                                .map((item, idx) => (
                                  <Tooltip key={idx} id={item.itemId} type="item">
                                    <div className="w-8 h-8 rounded border border-gold-dark/50 overflow-hidden bg-abyss-800 relative">
                                      <Image
                                        src={getItemImageUrl(item.itemId, ddragonVersion)}
                                        alt={`Item ${item.itemId}`}
                                        width={32}
                                        height={32}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                      />
                                      {items.filter(i => i.itemId === item.itemId).length > 1 &&
                                        items.indexOf(item) === items.findIndex(i => i.itemId === item.itemId) && (
                                          <span className="absolute -bottom-0.5 -right-0.5 text-[9px] bg-abyss-900 text-white px-1 rounded-sm font-bold">
                                            {items.filter(i => i.itemId === item.itemId).length}
                                          </span>
                                        )}
                                    </div>
                                  </Tooltip>
                                ))
                                .filter((_el, idx) => {
                                  // dedupe by finding first occurrence of each itemId
                                  const itemId = items[idx].itemId
                                  return items.findIndex(i => i.itemId === itemId) === idx
                                })}
                            </div>
                            <span className="text-[10px] text-text-muted tabular-nums">{minute} min</span>
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
                              <div
                                className={clsx(
                                  'w-7 h-7 rounded border bg-abyss-800 flex items-center justify-center text-xs font-bold',
                                  ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                                  abilityTextColors[ability]
                                )}
                              >
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
                                'w-6 h-6 rounded border bg-abyss-800 text-[12px] font-bold flex items-center justify-center',
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
                              <span className="text-[10px] text-gold-light font-medium">
                                {treeInfo?.name || 'Primary'}
                              </span>
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
                              <span className="text-[10px] text-text-muted font-medium">
                                {treeInfo?.name || 'Secondary'}
                              </span>
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
                        {[
                          currentPlayer.perks?.statPerks?.offense,
                          currentPlayer.perks?.statPerks?.flex,
                          currentPlayer.perks?.statPerks?.defense,
                        ].map((shardId, idx) => (
                          <div
                            key={idx}
                            className="w-6 h-6 rounded-full bg-abyss-800 border border-gold-dark/50 flex items-center justify-center"
                          >
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
            {loadingBreakdown || !pigScoreBreakdown ? (
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
                      <span
                        className="text-2xl font-bold tabular-nums"
                        style={{ color: getPigScoreColor(pigScoreBreakdown.finalScore) }}
                      >
                        {pigScoreBreakdown.finalScore}
                      </span>
                      <span className="text-xs text-text-muted">/ 100</span>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mb-4">
                    Based on {pigScoreBreakdown.totalGames.toLocaleString()} games on patch {pigScoreBreakdown.patch}
                    {pigScoreBreakdown.usedFallbackPatch && pigScoreBreakdown.matchPatch && (
                      <span
                        className="text-gold-light ml-1"
                        title={`Match played on patch ${pigScoreBreakdown.matchPatch}, but no data available for that patch. Using closest available patch data.`}
                      >
                        (match: {pigScoreBreakdown.matchPatch} ⚠)
                      </span>
                    )}
                  </p>

                  {/* Component Scores Summary */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-2 text-center">
                      <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Performance</div>
                      <div
                        className={clsx(
                          'text-lg font-bold',
                          pigScoreBreakdown.componentScores.performance >= 85
                            ? 'text-accent-light'
                            : pigScoreBreakdown.componentScores.performance >= 70
                              ? 'text-gold-light'
                              : 'text-negative'
                        )}
                      >
                        {pigScoreBreakdown.componentScores.performance}
                      </div>
                      <div className="text-[9px] text-text-muted">50%</div>
                    </div>
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-2 text-center">
                      <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Build</div>
                      <div
                        className={clsx(
                          'text-lg font-bold',
                          pigScoreBreakdown.componentScores.build >= 85
                            ? 'text-accent-light'
                            : pigScoreBreakdown.componentScores.build >= 70
                              ? 'text-gold-light'
                              : 'text-negative'
                        )}
                      >
                        {pigScoreBreakdown.componentScores.build}
                      </div>
                      <div className="text-[9px] text-text-muted">20%</div>
                    </div>
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-2 text-center">
                      <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Timeline</div>
                      <div
                        className={clsx(
                          'text-lg font-bold',
                          pigScoreBreakdown.componentScores.timeline >= 85
                            ? 'text-accent-light'
                            : pigScoreBreakdown.componentScores.timeline >= 70
                              ? 'text-gold-light'
                              : 'text-negative'
                        )}
                      >
                        {pigScoreBreakdown.componentScores.timeline}
                      </div>
                      <div className="text-[9px] text-text-muted">20%</div>
                    </div>
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-2 text-center">
                      <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">KDA</div>
                      <div
                        className={clsx(
                          'text-lg font-bold',
                          pigScoreBreakdown.componentScores.kda >= 85
                            ? 'text-accent-light'
                            : pigScoreBreakdown.componentScores.kda >= 70
                              ? 'text-gold-light'
                              : 'text-negative'
                        )}
                      >
                        {pigScoreBreakdown.componentScores.kda}
                      </div>
                      <div className="text-[9px] text-text-muted">10%</div>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="space-y-2.5">
                    {pigScoreBreakdown.metrics.map((m, idx) => {
                      const isGood = m.score >= 85
                      const isBad = m.score < 50
                      const isModerate = !isGood && !isBad

                      return (
                        <div key={idx} className="flex items-center gap-3">
                          {/* Status indicator */}
                          <div
                            className={clsx(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              isGood && 'bg-accent-light',
                              isModerate && 'bg-gold-light',
                              isBad && 'bg-negative'
                            )}
                          />

                          {/* Stat name */}
                          <span className="text-xs text-white w-36 flex-shrink-0">{m.name}</span>

                          {/* Progress bar */}
                          <div className="flex-1 h-1.5 bg-abyss-800 rounded-full overflow-hidden">
                            <div
                              className={clsx(
                                'h-full rounded-full transition-all',
                                isGood && 'bg-gradient-to-r from-accent-light/80 to-accent-light',
                                isModerate && 'bg-gradient-to-r from-gold-dark to-gold-light',
                                isBad && 'bg-gradient-to-r from-negative/80 to-negative'
                              )}
                              style={{ width: `${Math.max(5, m.score)}%` }}
                            />
                          </div>

                          {/* Score value */}
                          <span
                            className={clsx(
                              'text-xs font-mono w-12 text-right tabular-nums',
                              isGood && 'text-accent-light',
                              isModerate && 'text-gold-light',
                              isBad && 'text-negative'
                            )}
                          >
                            {m.score.toFixed(0)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Kill/Death Timeline */}
                {(() => {
                  const details = participantDetails.get(currentPuuid)
                  const timeline = details?.kill_death_timeline
                  const gameDurationSec = match.info.gameDuration

                  if (!timeline || (timeline.takedowns.length === 0 && timeline.deaths.length === 0)) {
                    return null
                  }

                  // combine all events into a sorted timeline (including towers)
                  const events: Array<{
                    type: 'takedown' | 'death' | 'tower'
                    t: number
                    gold?: number
                    tf?: boolean
                    wasKill?: boolean
                    pos?: number
                    value?: number
                    x?: number
                    y?: number
                    team?: 'ally' | 'enemy'
                  }> = [
                    ...timeline.takedowns.map(k => ({ type: 'takedown' as const, ...k })),
                    ...timeline.deaths.map(d => ({ type: 'death' as const, ...d })),
                    ...(timeline.towers || []).map(t => ({ type: 'tower' as const, ...t })),
                  ].sort((a, b) => a.t - b.t)

                  // ARAM map constants for coordinate conversion
                  const MAP_MIN = { x: -28, y: -19 }
                  const MAP_MAX = { x: 12849, y: 12858 }

                  // Convert game coordinates to map percentage (0-100)
                  const coordToPercent = (x: number, y: number) => ({
                    x: ((x - MAP_MIN.x) / (MAP_MAX.x - MAP_MIN.x)) * 100,
                    y: ((y - MAP_MIN.y) / (MAP_MAX.y - MAP_MIN.y)) * 100,
                  })

                  const formatTime = (secs: number) => {
                    const mins = Math.floor(secs / 60)
                    const s = secs % 60
                    return `${mins}:${s.toString().padStart(2, '0')}`
                  }

                  return (
                    <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-white">Kill/Death Timeline</h3>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-accent-light"></span>
                            <span className="text-text-muted">{timeline.takedowns.length} takedowns</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-negative"></span>
                            <span className="text-text-muted">{timeline.deaths.length} deaths</span>
                          </span>
                          {timeline.towers && timeline.towers.length > 0 && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rotate-45 bg-gold-light"></span>
                              <span className="text-text-muted">{timeline.towers.length} towers</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quality Scores */}
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-abyss-800/50 rounded p-2">
                          <div className="text-[10px] text-text-muted mb-1">Takedown Quality</div>
                          <div className="flex items-baseline gap-1.5">
                            <span
                              className={clsx(
                                'text-lg font-bold tabular-nums',
                                timeline.takedownScore >= 70
                                  ? 'text-accent-light'
                                  : timeline.takedownScore >= 50
                                    ? 'text-gold-light'
                                    : 'text-negative'
                              )}
                            >
                              {timeline.takedownScore}
                            </span>
                            <span className="text-[10px] text-text-muted">/100</span>
                          </div>
                        </div>
                        <div className="bg-abyss-800/50 rounded p-2">
                          <div className="text-[10px] text-text-muted mb-1">Death Quality</div>
                          <div className="flex items-baseline gap-1.5">
                            <span
                              className={clsx(
                                'text-lg font-bold tabular-nums',
                                timeline.deathScore >= 70
                                  ? 'text-accent-light'
                                  : timeline.deathScore >= 50
                                    ? 'text-gold-light'
                                    : 'text-negative'
                              )}
                            >
                              {timeline.deathScore}
                            </span>
                            <span className="text-[10px] text-text-muted">/100</span>
                          </div>
                        </div>
                      </div>

                      {/* Visual Timeline Bar */}
                      <div className="relative h-8 bg-abyss-800 rounded-lg mb-3 overflow-visible">
                        {/* Minute markers - major (labeled) and minor (unlabeled) */}
                        {(() => {
                          const gameMins = Math.ceil(gameDurationSec / 60)
                          const markers: React.ReactNode[] = []

                          // generate markers every minute
                          for (let min = 0; min <= gameMins; min++) {
                            const pct = ((min * 60) / gameDurationSec) * 100
                            if (pct > 100) continue

                            const isMajor = min % 5 === 0 // 0, 5, 10, 15, 20...

                            markers.push(
                              <div
                                key={min}
                                className={clsx(
                                  'absolute',
                                  isMajor
                                    ? 'h-full border-l border-abyss-500'
                                    : 'h-2/3 top-1/2 -translate-y-1/2 border-l border-abyss-600/50'
                                )}
                                style={{ left: `${pct}%` }}
                              >
                                {isMajor && (
                                  <span className="absolute -bottom-4 left-0 -translate-x-1/2 text-[9px] text-text-muted tabular-nums">
                                    {min}m
                                  </span>
                                )}
                              </div>
                            )
                          }

                          return markers
                        })()}

                        {/* Event markers */}
                        {events.map((event, idx) => {
                          const leftPct = (event.t / gameDurationSec) * 100
                          const isTower = event.type === 'tower'
                          const isTakedown = event.type === 'takedown'
                          const isDeath = event.type === 'death'
                          const isKill = isTakedown && event.wasKill
                          const value = event.value ?? 50
                          const eventLabel = isTower
                            ? event.team === 'enemy'
                              ? 'Tower Destroyed'
                              : 'Tower Lost'
                            : isTakedown
                              ? isKill
                                ? 'Kill'
                                : 'Assist'
                              : 'Death'

                          // color based on value: high value = bright, low value = dim
                          const getValueColor = (v: number, isTakedown: boolean) => {
                            if (isTakedown) {
                              return v >= 70 ? 'text-accent-light' : v >= 40 ? 'text-gold-light' : 'text-text-muted'
                            } else {
                              // for deaths, high value = good death (teamfight, low gold)
                              return v >= 70 ? 'text-gold-light' : v >= 40 ? 'text-negative' : 'text-negative'
                            }
                          }

                          // Map position if coordinates available
                          const hasPosition = event.x !== undefined && event.y !== undefined
                          const mapPos = hasPosition ? coordToPercent(event.x!, event.y!) : null

                          return (
                            <div
                              key={`${event.type}-${idx}`}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                              style={{ left: `${leftPct}%` }}
                            >
                              <SimpleTooltip
                                content={
                                  <div className="text-xs">
                                    {/* Map visualization */}
                                    {hasPosition && (
                                      <div className="relative w-[120px] h-[120px] mb-2 rounded overflow-hidden border border-abyss-600">
                                        {/* ARAM Map background */}
                                        <img
                                          src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/map/map12.png`}
                                          alt="ARAM Map"
                                          className="absolute inset-0 w-full h-full object-cover"
                                        />
                                        {/* Event marker on map */}
                                        {mapPos && (
                                          <div
                                            className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2"
                                          style={{
                                            left: `${mapPos.x}%`,
                                            // Flip Y axis since map image has origin at top-left but game coords have origin at bottom-left
                                            top: `${100 - mapPos.y}%`,
                                          }}
                                        >
                                          {isTower ? (
                                            // Tower icon - diamond shape
                                            <div
                                              className={clsx(
                                                'w-3 h-3 rotate-45 border',
                                                event.team === 'enemy'
                                                  ? 'bg-accent-light/90 border-white'
                                                  : 'bg-negative/90 border-white'
                                              )}
                                            />
                                          ) : (
                                            // Champion icon for kills/deaths
                                            <div
                                              className={clsx(
                                                'w-5 h-5 rounded-full border-[1.5px] overflow-hidden',
                                                isTakedown ? 'border-accent-light' : 'border-negative',
                                                event.tf && 'ring-1 ring-blue-400'
                                              )}
                                            >
                                              <img
                                                src={getChampionImageUrl(
                                                  currentPlayer?.championName || '',
                                                  ddragonVersion
                                                )}
                                                alt={currentPlayer?.championName}
                                                className="w-full h-full object-cover"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Event info */}
                                  <div className="min-w-[120px]">
                                    <div
                                      className={clsx(
                                        'font-semibold mb-1.5 flex items-center justify-between',
                                        isTower
                                          ? event.team === 'enemy'
                                            ? 'text-accent-light'
                                            : 'text-negative'
                                          : isTakedown
                                            ? 'text-accent-light'
                                            : 'text-negative'
                                      )}
                                    >
                                      <span>
                                        {eventLabel} at {formatTime(event.t)}
                                      </span>
                                      {!isTower && (
                                        <span
                                          className={clsx(
                                            'ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold',
                                            isTakedown
                                              ? value >= 70
                                                ? 'bg-accent-light/20'
                                                : value >= 40
                                                  ? 'bg-gold-light/20'
                                                  : 'bg-abyss-600'
                                              : value >= 70
                                                ? 'bg-gold-light/20'
                                                : 'bg-negative/20',
                                            getValueColor(value, isTakedown)
                                          )}
                                        >
                                          {value}
                                        </span>
                                      )}
                                    </div>
                                    {!isTower && (
                                      <div className="space-y-0.5">
                                        {event.gold !== undefined && event.gold > 0 && (
                                          <div className="text-text-muted flex justify-between">
                                            <span>{isTakedown ? 'Victim gold:' : 'Gold spent:'}</span>
                                            <span className="text-gold-light">{event.gold.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {event.pos !== undefined && (
                                          <div className="text-text-muted flex justify-between">
                                            <span>Position:</span>
                                            <span
                                              className={clsx(
                                                event.pos >= 60
                                                  ? 'text-accent-light'
                                                  : event.pos <= 40
                                                    ? 'text-negative'
                                                    : 'text-text-muted'
                                              )}
                                            >
                                              {event.pos >= 60 ? 'Pushing' : event.pos <= 40 ? 'At base' : 'Mid-lane'}
                                            </span>
                                          </div>
                                        )}
                                        {event.tf && (
                                          <div className="text-blue-400">
                                            Teamfight {isTakedown ? 'takedown' : 'death'}
                                          </div>
                                        )}
                                        {isDeath && event.gold !== undefined && event.gold > 2000 && (
                                          <div className="text-negative text-[10px]">Held too much gold!</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              }
                            >
                              {isTower ? (
                                // Tower marker - diamond shape
                                <div
                                  className={clsx(
                                    'w-2 h-2 rotate-45 cursor-pointer transition-transform hover:scale-150',
                                    event.team === 'enemy'
                                      ? 'bg-accent-light border border-accent-light/50'
                                      : 'bg-negative border border-negative/50'
                                  )}
                                />
                              ) : (
                                // Kill/death marker - circle
                                <div
                                  className={clsx(
                                    'w-2 h-2 rounded-full cursor-pointer transition-transform hover:scale-150',
                                    isTakedown ? 'bg-accent-light' : 'bg-negative',
                                    event.tf && 'ring-1 ring-blue-400/50'
                                  )}
                                />
                              )}
                              </SimpleTooltip>
                            </div>
                          )
                        })}
                      </div>

                      {/* Event List */}
                      <div className="space-y-1.5 mt-6 max-h-32 overflow-y-auto">
                        {events.map((event, idx) => {
                          const isTower = event.type === 'tower'
                          const isTakedown = event.type === 'takedown'
                          const _isDeath = event.type === 'death'
                          const isKill = isTakedown && event.wasKill
                          const value = event.value ?? 50
                          const pos = event.pos
                          const eventLabel = isTower
                            ? event.team === 'enemy'
                              ? 'Tower ✓'
                              : 'Tower ✗'
                            : isTakedown
                              ? isKill
                                ? 'Kill'
                                : 'Assist'
                              : 'Death'
                          return (
                            <div key={`list-${event.type}-${idx}`} className="flex items-center gap-2 text-xs">
                              <span className="text-text-muted w-10 text-right tabular-nums">
                                {formatTime(event.t)}
                              </span>
                              {isTower ? (
                                // Tower marker - diamond
                                <span
                                  className={clsx(
                                    'w-1.5 h-1.5 rotate-45',
                                    event.team === 'enemy' ? 'bg-accent-light' : 'bg-negative'
                                  )}
                                />
                              ) : (
                                // Kill/death marker - circle
                                <span
                                  className={clsx(
                                    'w-1.5 h-1.5 rounded-full',
                                    isTakedown ? 'bg-accent-light' : 'bg-negative'
                                  )}
                                />
                              )}
                              <span
                                className={clsx(
                                  'font-medium w-12',
                                  isTower
                                    ? event.team === 'enemy'
                                      ? 'text-accent-light'
                                      : 'text-negative'
                                    : isTakedown
                                      ? 'text-accent-light'
                                      : 'text-negative'
                                )}
                              >
                                {eventLabel}
                              </span>
                              {!isTower && (
                                <span
                                  className={clsx(
                                    'w-8 text-center tabular-nums font-medium rounded px-1',
                                    isTakedown
                                      ? value >= 70
                                        ? 'text-accent-light bg-accent-light/10'
                                        : value >= 40
                                          ? 'text-gold-light bg-gold-light/10'
                                          : 'text-text-muted bg-abyss-600/50'
                                      : value >= 70
                                        ? 'text-gold-light bg-gold-light/10'
                                        : 'text-negative bg-negative/10'
                                  )}
                                >
                                  {value}
                                </span>
                              )}
                              {!isTower && event.gold !== undefined && event.gold > 0 && (
                                <span className="text-text-muted">
                                  <span className="text-gold-light">{event.gold.toLocaleString()}g</span>
                                </span>
                              )}
                              {!isTower && pos !== undefined && (
                                <span
                                  className={clsx(
                                    'px-1.5 py-0.5 text-[10px] rounded',
                                    pos >= 60
                                      ? 'bg-accent-light/20 text-accent-light'
                                      : pos <= 40
                                        ? 'bg-negative/20 text-negative'
                                        : 'bg-abyss-600/50 text-text-muted'
                                  )}
                                >
                                  {pos >= 60 ? 'PUSH' : pos <= 40 ? 'BASE' : 'MID'}
                                </span>
                              )}
                              {!isTower && event.tf && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded">
                                  TF
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Detailed Stats Comparison */}
                <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
                  <h3 className="text-sm font-semibold text-white mb-4">Stats vs Champion Average</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Damage to Champions */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
                        Damage to Champions /min
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.damageToChampionsPerMin.toFixed(0)}
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.damageToChampionsPerMin.toFixed(0)} avg
                        </span>
                      </div>
                      {(() => {
                        const m = pigScoreBreakdown.metrics.find(m => m.name === 'Damage to Champions')
                        if (!m?.percentOfAvg) return null
                        return (
                          <div
                            className={clsx(
                              'text-xs mt-1 font-medium',
                              m.percentOfAvg >= 100
                                ? 'text-accent-light'
                                : m.percentOfAvg >= 80
                                  ? 'text-gold-light'
                                  : 'text-negative'
                            )}
                          >
                            {m.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>

                    {/* Total Damage */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
                        Total Damage /min
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.totalDamagePerMin.toFixed(0)}
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.totalDamagePerMin.toFixed(0)} avg
                        </span>
                      </div>
                      {(() => {
                        const m = pigScoreBreakdown.metrics.find(m => m.name === 'Total Damage')
                        if (!m?.percentOfAvg) return null
                        return (
                          <div
                            className={clsx(
                              'text-xs mt-1 font-medium',
                              m.percentOfAvg >= 100
                                ? 'text-accent-light'
                                : m.percentOfAvg >= 80
                                  ? 'text-gold-light'
                                  : 'text-negative'
                            )}
                          >
                            {m.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>

                    {/* Healing/Shielding */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
                        Healing + Shielding /min
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.healingShieldingPerMin.toFixed(0)}
                        </span>
                        <span className="text-xs text-text-muted">
                          vs {pigScoreBreakdown.championAvgStats.healingShieldingPerMin.toFixed(0)} avg
                        </span>
                      </div>
                      {(() => {
                        const m = pigScoreBreakdown.metrics.find(m => m.name === 'Healing/Shielding')
                        if (!m?.percentOfAvg) return null
                        return (
                          <div
                            className={clsx(
                              'text-xs mt-1 font-medium',
                              m.percentOfAvg >= 100
                                ? 'text-accent-light'
                                : m.percentOfAvg >= 80
                                  ? 'text-gold-light'
                                  : 'text-negative'
                            )}
                          >
                            {m.percentOfAvg.toFixed(0)}% of average
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
                        const m = pigScoreBreakdown.metrics.find(m => m.name === 'CC Time')
                        if (!m?.percentOfAvg) return null
                        return (
                          <div
                            className={clsx(
                              'text-xs mt-1 font-medium',
                              m.percentOfAvg >= 100
                                ? 'text-accent-light'
                                : m.percentOfAvg >= 80
                                  ? 'text-gold-light'
                                  : 'text-negative'
                            )}
                          >
                            {m.percentOfAvg.toFixed(0)}% of average
                          </div>
                        )
                      })()}
                    </div>

                    {/* Deaths per Min */}
                    <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3 col-span-2">
                      <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
                        Deaths per Minute
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {pigScoreBreakdown.playerStats.deathsPerMin.toFixed(2)}
                        </span>
                        <span className="text-xs text-text-muted">(optimal: 0.5-0.7)</span>
                      </div>
                      {(() => {
                        const dpm = pigScoreBreakdown.playerStats.deathsPerMin
                        const isOptimal = dpm >= 0.5 && dpm <= 0.7
                        const isTooFew = dpm < 0.5
                        return (
                          <div
                            className={clsx(
                              'text-xs mt-1 font-medium',
                              isOptimal ? 'text-accent-light' : isTooFew ? 'text-gold-light' : 'text-negative'
                            )}
                          >
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
                            <div
                              className={clsx(
                                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                isGood && 'bg-accent-light',
                                !isGood && !isBad && 'bg-gold-light',
                                isBad && 'bg-negative'
                              )}
                            />
                            <span className="text-xs text-text-muted w-16 flex-shrink-0">
                              {slotNames[item.slot] || `Slot ${item.slot + 1}`}
                            </span>
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
                                <span
                                  className={clsx(
                                    'text-xs',
                                    isGood ? 'text-accent-light' : isBad ? 'text-negative' : 'text-gold-light'
                                  )}
                                >
                                  {item.reason === 'optimal'
                                    ? 'Top 5 choice'
                                    : item.reason === 'boots'
                                      ? 'Boots (no penalty)'
                                      : item.reason === 'suboptimal'
                                        ? `Suboptimal (-${item.penalty.toFixed(1)})`
                                        : item.reason === 'off-meta'
                                          ? 'Off-meta pick'
                                          : 'Unknown item'}
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
                    <p className="text-xs text-text-muted mb-3">{pigScoreBreakdown.scoringInfo.description}</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-abyss-800/50 rounded p-2">
                        <div className="text-text-muted mb-1">Target Performance</div>
                        <div className="text-white font-medium">Top ~16% (mean + 1σ)</div>
                      </div>
                      <div className="bg-abyss-800/50 rounded p-2">
                        <div className="text-text-muted mb-1">Average = Score</div>
                        <div className="text-gold-light font-medium">70 points</div>
                      </div>
                    </div>

                    {/* Z-Score details for stats that have them */}
                    {pigScoreBreakdown.metrics.some(m => m.zScore !== undefined) && (
                      <div className="mt-3 pt-3 border-t border-abyss-600">
                        <div className="text-[11px] text-text-muted mb-2 uppercase tracking-wide">
                          Your Z-Scores (vs other players)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {pigScoreBreakdown.metrics
                            .filter(m => m.zScore !== undefined)
                            .map((m, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-text-muted">{m.name}</span>
                                <span
                                  className={clsx(
                                    'font-mono tabular-nums',
                                    (m.zScore ?? 0) >= 1
                                      ? 'text-accent-light'
                                      : (m.zScore ?? 0) >= 0
                                        ? 'text-gold-light'
                                        : 'text-negative'
                                  )}
                                >
                                  {(m.zScore ?? 0) >= 0 ? '+' : ''}
                                  {m.zScore?.toFixed(2)}σ
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
