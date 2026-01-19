'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MatchData } from '@/types/match'
import MatchHistoryItem from '@/components/match/MatchHistoryItem'
import ChampionFilter from '@/components/filters/ChampionFilter'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface Props {
  matches: MatchData[]
  puuid: string
  region: string
  ddragonVersion: string
  championNames: Record<string, string>
  onMatchesLoaded?: (newMatches: MatchData[]) => void
  initialLoading?: boolean
  currentName?: { gameName: string; tagLine: string }
}

export default function MatchHistoryList({
  matches: initialMatches,
  puuid,
  region,
  ddragonVersion,
  championNames,
  onMatchesLoaded,
  initialLoading = false,
  currentName,
}: Props) {
  const [matches, setMatches] = useState(initialMatches)
  const [championFilter, setChampionFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialMatches.length >= 20)
  // track enriched pig scores per match for MOG/LTN badges
  const [enrichedPigScoresMap, setEnrichedPigScoresMap] = useState<Record<string, Record<string, number | null>>>({})

  // sync local state when parent passes new matches
  useEffect(() => {
    setMatches(initialMatches)
    setHasMore(initialMatches.length >= 20)
  }, [initialMatches])

  // update match pig scores when enriched (from MatchDetails callback)
  const handleMatchEnriched = useCallback((matchId: string, pigScores: Record<string, number | null>) => {
    // store enriched pig scores for MOG/LTN calculation
    setEnrichedPigScoresMap(prev => ({
      ...prev,
      [matchId]: pigScores,
    }))
    
    setMatches(prev => prev.map(match => {
      if (match.metadata.matchId !== matchId) return match
      
      // update participants with new pig scores
      const updatedParticipants = match.info.participants.map(p => ({
        ...p,
        pigScore: pigScores[p.puuid] ?? p.pigScore,
      }))
      
      return {
        ...match,
        info: {
          ...match.info,
          participants: updatedParticipants,
        },
      }
    }))
  }, [])

  // filter out matches with no participants at all (shouldn't happen, but safety check)
  const validMatches = matches.filter(match => match.info.participants && match.info.participants.length > 0)

  const filteredMatches = championFilter
    ? validMatches.filter(match => {
        const participant = match.info.participants.find(p => p.puuid === puuid)
        return participant?.championName === championFilter
      })
    : validMatches

  const loadMore = async () => {
    if (loading) return

    setLoading(true)
    try {
      const response = await fetch('/api/load-more-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puuid,
          offset: matches.length,
          limit: 20,
          currentName,
        }),
      })

      if (!response.ok) {
        throw new Error('failed to load more matches')
      }

      const data = await response.json()
      setMatches(prev => [...prev, ...data.matches])
      setHasMore(data.hasMore)
      // notify parent of new matches
      if (onMatchesLoaded && data.matches.length > 0) {
        onMatchesLoaded(data.matches)
      }
    } catch (error) {
      console.error('Error loading more matches:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterDropdown = (
    <ChampionFilter
      value={championFilter}
      onChange={setChampionFilter}
      championNames={championNames}
      ddragonVersion={ddragonVersion}
    />
  )

  return (
    <div className="w-full xl:flex-1 xl:min-w-0">
      <Card title="ARAM History" headerRight={filterDropdown}>
        {initialLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="text-center text-text-muted py-16 text-lg">
            {championFilter ? `No matches found for ${championFilter}` : 'No ARAM matches found'}
          </div>
        ) : (
          <>
            <ul
              role="list"
              aria-label={championFilter ? `Match history for ${championFilter}` : 'Match history'}
              className={`space-y-2 ${!championFilter && hasMore ? '' : 'pb-2'}`}
            >
              {filteredMatches.map(match => (
                <MatchHistoryItem
                  key={match.metadata.matchId}
                  match={match}
                  puuid={puuid}
                  region={region}
                  ddragonVersion={ddragonVersion}
                  championNames={championNames}
                  enrichedPigScores={enrichedPigScoresMap[match.metadata.matchId]}
                  onMatchEnriched={handleMatchEnriched}
                />
              ))}
            </ul>

            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                aria-label={loading ? 'Loading more matches' : 'Load more matches'}
                className="w-full h-12 mt-2 mb-2 px-4 bg-gradient-to-t from-action-100 to-action-200 hover:brightness-130 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white rounded-full animate-spin border-t-transparent" />
                ) : (
                  <>
                    <span>Show More</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
