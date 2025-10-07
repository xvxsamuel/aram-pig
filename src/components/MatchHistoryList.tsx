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
}

export default function MatchHistoryList({ matches: initialMatches, puuid, region, ddragonVersion, championNames }: Props) {
  const [matches, setMatches] = useState(initialMatches)
  const [championFilter, setChampionFilter] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialMatches.length >= 20)
  
  const filteredMatches = championFilter
    ? matches.filter(match => {
        const participant = match.info.participants.find(p => p.puuid === puuid)
        return participant?.championName === championFilter
      })
    : matches

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
    } catch (error) {
      console.error("Error loading more matches:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full xl:flex-1 xl:min-w-0">
      <section className="bg-accent-darker rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="text-xl font-bold flex-shrink-0">Recent Matches</h2>
            <ChampionFilter
              value={championFilter}
              onChange={setChampionFilter}
              championNames={championNames}
              ddragonVersion={ddragonVersion}
            />
          </div>
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
          
          {filteredMatches.length === 0 ? (
          <div className="text-center text-subtitle py-8">
            {championFilter ? `No matches found for "${championFilter}"` : 'No ARAM matches found'}
          </div>
        ) : (
          <>
            <div className="space-y-2 px-3">
              {filteredMatches.map((match) => (
                <MatchHistoryItem 
                  key={match.metadata.matchId} 
                  match={match} 
                  puuid={puuid}
                  region={region}
                  ddragonVersion={ddragonVersion}
                />
              ))}
            </div>
            
            {!championFilter && hasMore && (
              <div className="px-3">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full mt-4 px-4 py-3 bg-gradient-to-t from-accent-r-dark to-accent-r-light hover:brightness-130 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="relative w-5 h-5 flex-shrink-0">
                      <div className="absolute inset-0 border-2 border-accent-darker rounded-full"></div>
                      <div className="absolute inset-0 border-2 border-gold-light rounded-full animate-spin border-t-transparent"></div>
                    </div>
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
