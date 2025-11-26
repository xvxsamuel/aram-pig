"use client"

import { useState } from "react"
import type { MatchData } from "../lib/riot-api"
import MatchHistoryItem from "./MatchHistoryItem"
import ChampionFilter from "./ChampionFilter"

interface Props {
  matches: MatchData[]
  puuid: string
  region: string
  ddragonVersion: string
  championNames: Record<string, string>
  onMatchesLoaded?: (newMatches: MatchData[]) => void
}

export default function MatchHistoryList({ matches: initialMatches, puuid, region, ddragonVersion, championNames, onMatchesLoaded }: Props) {
  const [matches, setMatches] = useState(initialMatches)
  const [championFilter, setChampionFilter] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialMatches.length >= 20)
  
  // filter out incomplete matches (missing participant data)
  const validMatches = matches.filter(match => 
    match.info.participants && match.info.participants.length === 10
  )

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
      const response = await fetch("/api/load-more-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puuid,
          offset: matches.length,
          limit: 20
        })
      })

      if (!response.ok) {
        throw new Error("failed to load more matches")
      }

      const data = await response.json()
      setMatches(prev => [...prev, ...data.matches])
      setHasMore(data.hasMore)
      // notify parent of new matches
      if (onMatchesLoaded && data.matches.length > 0) {
        onMatchesLoaded(data.matches)
      }
    } catch (error) {
      console.error("Error loading more matches:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full xl:flex-1 xl:min-w-0">
      <section className="bg-abyss-600 rounded-lg border border-gold-dark/40">
        <div className="px-4 py-1.5">
          <div className="flex items-center justify-between gap-4 mb-1.5 relative z-20">
            <h2 className="text-xl font-bold flex-shrink-0">Match History</h2>
            <ChampionFilter
              value={championFilter}
              onChange={setChampionFilter}
              championNames={championNames}
              ddragonVersion={ddragonVersion}
            />
          </div>
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-4 -mx-4" />
          
          {filteredMatches.length === 0 ? (
          <div className="text-center text-text-muted py-8 min-h-[200px] flex items-center justify-center">
            {championFilter ? `No matches found for ${championFilter}`: 'No ARAM matches found'}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {filteredMatches.map((match) => (
                <MatchHistoryItem 
                  key={match.metadata.matchId} 
                  match={match} 
                  puuid={puuid}
                  region={region}
                  ddragonVersion={ddragonVersion}
                  championNames={championNames}
                />
              ))}
            </div>
            
            {!championFilter && hasMore && (
              <div className="">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full mt-2 px-4 py-3 bg-gradient-to-t from-action-100 to-action-200 hover:brightness-130 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
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
              </div>
            )}
          </>
        )}
        </div>
      </section>
    </div>
  )
}
