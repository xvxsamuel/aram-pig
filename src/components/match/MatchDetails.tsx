'use client'

import { useState, useEffect, useRef } from 'react'
import type { MatchData } from '@/types/match'
import clsx from 'clsx'
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from '@/lib/game'
import {
  OverviewTab,
  BuildTab,
  PerformanceTab,
  ParticipantDetails,
  PigScoreBreakdown,
  ItemTimelineEvent,
} from './tabs'
import { getPigScoreColor } from '@/lib/ui'
import itemsData from '@/data/items.json'

// helper to check if an item is a completed item (legendary, boots, mythic)
const itemsLookup = itemsData as Record<string, { name?: string; itemType?: string }>

// helper to get item type for timeline display
function getItemType(itemId: number): 'legendary' | 'boots' | 'mythic' | 'component' | 'other' {
  const item = itemsLookup[String(itemId)]
  if (!item) return 'other'
  const type = item.itemType as string
  if (type === 'legendary') return 'legendary'
  if (type === 'boots') return 'boots'
  if (type === 'mythic') return 'mythic'
  if (type === 'component') return 'component'
  return 'other'
}

// helper to get item name
function getItemName(itemId: number): string {
  const item = itemsLookup[String(itemId)]
  return item?.name || `Item ${itemId}`
}

// hydrate stored itempurchaseevent[] to full itemtimelineevent[]
// stored data only has itemid/timestamp/action, we add itemtype/itemname client-side
interface StoredItemEvent {
  itemId: number
  timestamp: number
  action: 'buy' | 'sell' | string
}

function hydrateItemTimeline(events: StoredItemEvent[]): ItemTimelineEvent[] {
  return events.map(e => ({
    itemId: e.itemId,
    timestamp: e.timestamp,
    action: e.action === 'sell' ? 'sell' : 'buy',
    itemType: getItemType(e.itemId),
    itemName: getItemName(e.itemId),
  }))
}

interface Props {
  match: MatchData
  currentPuuid: string
  ddragonVersion: string
  region: string
  defaultTab?: 'overview' | 'build' | 'performance'
  onTabChange?: (tab: 'overview' | 'build' | 'performance') => void
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

  // check if match is within 1 year (timeline data availability from riot api)
  const isWithin1Year = Date.now() - match.info.gameCreation < 365 * 24 * 60 * 60 * 1000

  // check if current player already has a pig score (from previous calculation)
  const hasExistingPigScore = currentPlayer?.pigScore !== null && currentPlayer?.pigScore !== undefined

  // check if game was a remake (no pig score for remakes)
  const isRemake = currentPlayer?.gameEndedInEarlySurrender ?? false

  // check if performance tab should be available (within 1 year or has existing score)
  const canShowPerformanceTab = (isWithin1Year && !isRemake) || hasExistingPigScore

  // determine initial tab - fall back to overview if performance not available
  const getValidTab = (tab: 'overview' | 'build' | 'performance') => {
    if (tab === 'performance' && !canShowPerformanceTab) return 'overview'
    return tab
  }

  const [selectedTab, setSelectedTabState] = useState<'overview' | 'build' | 'performance'>(() =>
    getValidTab(defaultTab)
  )

  // sync tab when parent changes defaulttab (e.g., clicking pig button when already expanded)
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
  const [breakdownFetchAttempted, setBreakdownFetchAttempted] = useState(false)
  const [, setEnrichError] = useState<string | null>(null)
  const enrichFetchingRef = useRef(false) // prevent double-fetch

  // enrich match with timeline data and pig scores when component mounts (for recent matches)
  useEffect(() => {
    if (!isWithin1Year || isRemake || pigScoresFetched || enrichFetchingRef.current) return

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
    isWithin1Year,
    isRemake,
    pigScoresFetched,
    region,
  ])

  // Use pig score breakdown from match data (pre-calculated) or fetch if needed
  useEffect(() => {
    if (
      canShowPerformanceTab &&
      !pigScoreBreakdown &&
      !loadingBreakdown &&
      !breakdownFetchAttempted
    ) {
      // First, try to use the breakdown from match data (already calculated during update-profile)
      const cachedBreakdown = currentPlayer?.pigScoreBreakdown as PigScoreBreakdown | undefined
      if (cachedBreakdown && cachedBreakdown.itemDetails && cachedBreakdown.itemDetails.length > 0) {
        // Check if the cached breakdown has all the data we need
        const hasCoreKey = cachedBreakdown.coreKey !== undefined
        const hasStartingDetails = cachedBreakdown.startingItemsDetails !== undefined
        const hasFirstBuy = !!currentPlayer?.firstBuy

        // Use cache if it has coreKey and startingItemsDetails (when firstBuy exists)
        if (hasCoreKey && (!hasFirstBuy || hasStartingDetails)) {
          setPigScoreBreakdown(cachedBreakdown)
          return
        }
      }

      // Don't fetch if game is too old (API will reject it anyway)
      if (!isWithin1Year) {
        setBreakdownFetchAttempted(true)
        return
      }

      // Fallback: fetch from API (will recalculate and cache if needed)
      setLoadingBreakdown(true)
      setBreakdownFetchAttempted(true)
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
  }, [
    selectedTab,
    match.metadata.matchId,
    currentPuuid,
    currentPlayer?.pigScoreBreakdown,
    currentPlayer?.firstBuy,
    pigScoreBreakdown,
    loadingBreakdown,
    breakdownFetchAttempted,
    isWithin1Year,
  ])

  // separate teams
  const team100 = match.info.participants.filter(p => p.teamId === 100)
  const team200 = match.info.participants.filter(p => p.teamId === 200)

  const team100Won = team100[0]?.win || false
  const team200Won = team200[0]?.win || false

  // Calculate max values for bars
  const allParticipants = match.info.participants
  const maxDamageDealt = Math.max(...allParticipants.map(p => p.totalDamageDealtToChampions || 0))

  // Check if any participant has a pig score (only show PIG column if within 1 year, not a remake, OR scores exist OR loading)
  const hasPigScores =
    (isWithin1Year && !isRemake) ||
    loadingPigScores ||
    allParticipants.some(
      p => (pigScores[p.puuid] ?? p.pigScore) !== null && (pigScores[p.puuid] ?? p.pigScore) !== undefined
    )

  // Helper to get pig score for a participant (returns null if not available)
  const getPigScore = (puuid: string): number | null => {
    const fromState = pigScores[puuid]
    if (fromState !== undefined) return fromState
    const fromMatch = allParticipants.find(p => p.puuid === puuid)?.pigScore
    if (fromMatch !== null && fromMatch !== undefined) return fromMatch
    return null
  }

  // Convert pigScores object to Map for OverviewTab
  const pigScoresMap = new Map<string, number | null>()
  for (const p of allParticipants) {
    pigScoresMap.set(p.puuid, getPigScore(p.puuid))
  }

  // Lazy load participant details (timeline + PIG score)
  const loadParticipantDetails = async (puuid: string) => {
    // skip if already loading or loaded
    if (participantDetails.has(puuid)) return

    // First, check if the participant already has the data from match data
    const participant = match.info.participants.find(p => p.puuid === puuid)
    if (participant?.buildOrder && participant?.firstBuy && participant?.killDeathTimeline) {
      // Use data from match - no API call needed
      // Hydrate itemPurchases with item names/types (stored data only has itemId/timestamp/action)
      const hydratedTimeline = participant.itemPurchases
        ? hydrateItemTimeline(participant.itemPurchases as StoredItemEvent[])
        : []
      setParticipantDetails(prev =>
        new Map(prev).set(puuid, {
          ability_order: participant.abilityOrder || undefined,
          item_timeline: hydratedTimeline,
          kill_death_timeline: participant.killDeathTimeline,
          loading: false,
        })
      )
      return
    }

    // Don't fetch timeline for old matches (>365 days) or remakes that don't already have cached data
    if (!isWithin1Year || isRemake) {
      setParticipantDetails(prev =>
        new Map(prev).set(puuid, {
          ability_order: undefined,
          item_timeline: [],
          kill_death_timeline: undefined,
          loading: false,
        })
      )
      return
    }

    // mark as loading - fallback to API for recent matches without pre-calculated data
    setParticipantDetails(prev =>
      new Map(prev).set(puuid, {
        ability_order: undefined,
        item_timeline: [],
        kill_death_timeline: undefined,
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
            ability_order: data.ability_order || undefined,
            item_timeline: data.item_timeline || [],
            kill_death_timeline: data.kill_death_timeline || undefined,
            loading: false,
          })
        )
      }
    } catch (error) {
      console.error('Failed to load participant details:', error)
      setParticipantDetails(prev =>
        new Map(prev).set(puuid, {
          ability_order: undefined,
          item_timeline: [],
          kill_death_timeline: undefined,
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

  // Calculate overall build score for the tab label
  const buildSubScores = pigScoreBreakdown?.buildSubScores
  
  const overallBuildScore = (buildSubScores && canShowPerformanceTab) ? Math.round(
    (buildSubScores.starting ?? 50) * 0.05 +
    (buildSubScores.skills ?? 50) * 0.05 +
    (buildSubScores.keystone ?? 50) * 0.10 +
    (buildSubScores.spells ?? 50) * 0.05 +
    (buildSubScores.core ?? 50) * 0.45 +
    (buildSubScores.items ?? 50) * 0.30
  ) : null

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
            'flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px flex items-center justify-center gap-2',
            selectedTab === 'build'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Build
          {overallBuildScore !== null && (
            <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full flex">
              <div className="bg-abyss-700 rounded-full px-1.5 py-1.5 text-[10px] font-bold leading-none flex items-center gap-1">
                <span style={{ color: getPigScoreColor(overallBuildScore) }}>{overallBuildScore}</span>
                <span className="text-white">PIG</span>
              </div>
            </div>
          )}
        </button>
        {canShowPerformanceTab && (
          <button
            onClick={() => setSelectedTab('performance')}
            className={clsx(
              'flex-1 px-6 py-2.5 font-semibold text-sm transition-all border-b-2 -mb-px flex items-center justify-center gap-2',
              selectedTab === 'performance'
                ? 'border-accent-light text-white'
                : 'border-transparent text-text-muted hover:text-white'
            )}
          >
            Performance
            {pigScoreBreakdown?.componentScores?.performance !== undefined ? (
              <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full flex">
                <div className="bg-abyss-700 rounded-full px-1.5 py-1.5 text-[10px] font-bold leading-none flex items-center gap-1">
                  <span style={{ color: getPigScoreColor(pigScoreBreakdown.componentScores.performance) }}>
                    {pigScoreBreakdown.componentScores.performance}
                  </span>
                  <span className="text-white">PIG</span>
                </div>
              </div>
            ) : getPigScore(currentPuuid) !== null && (
              <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full flex">
                <div className="bg-abyss-700 rounded-full px-1.5 py-1.5 text-[10px] font-bold leading-none flex items-center gap-1">
                  <span style={{ color: getPigScoreColor(getPigScore(currentPuuid)!) }}>
                    {getPigScore(currentPuuid)}
                  </span>
                  <span className="text-white">PIG</span>
                </div>
              </div>
            )}
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {selectedTab === 'overview' ? (
          <OverviewTab
            match={match}
            currentPlayer={currentPlayer}
            currentPuuid={currentPuuid}
            ddragonVersion={ddragonVersion}
            region={region}
            participantDetails={participantDetails}
            pigScoreBreakdown={pigScoreBreakdown}
            loadingBreakdown={loadingBreakdown}
            team100={team100}
            team200={team200}
            team100Won={team100Won}
            team200Won={team200Won}
            hasPigScores={hasPigScores}
            loadingPigScores={loadingPigScores}
            pigScores={pigScoresMap}
            maxDamage={maxDamageDealt}
          />
        ) : selectedTab === 'build' ? (
          <BuildTab
            match={match}
            currentPlayer={currentPlayer}
            currentPuuid={currentPuuid}
            ddragonVersion={ddragonVersion}
            region={region}
            participantDetails={participantDetails}
            pigScoreBreakdown={pigScoreBreakdown}
            loadingBreakdown={loadingBreakdown}
            showPigScores={canShowPerformanceTab}
          />
        ) : (
          <PerformanceTab
            match={match}
            currentPlayer={currentPlayer}
            currentPuuid={currentPuuid}
            ddragonVersion={ddragonVersion}
            region={region}
            participantDetails={participantDetails}
            pigScoreBreakdown={pigScoreBreakdown}
            loadingBreakdown={loadingBreakdown}
          />
        )}
      </div>
    </div>
  )
}
