"use client"

import { useState } from "react"
import type { MatchData } from "../lib/riot-api"
import MatchHistoryItem from "./MatchHistoryItem"

interface Props {
  matches: MatchData[]
  puuid: string
}

export default function MatchHistoryList({ matches, puuid }: Props) {
  const [displayCount, setDisplayCount] = useState(20)
  const displayMatches = matches.slice(0, displayCount)
  const hasMore = displayCount < matches.length
  const remainingCount = matches.length - displayCount

  const showMore = () => {
    setDisplayCount(prev => Math.min(prev + 20, matches.length))
  }

  return (
    <div className="flex-1 min-w-0">
      <section className="bg-accent-darker/60 rounded-xl p-6 border border-gold-dark/20">
        <h2 className="text-2xl font-bold mb-4 text-gold-light">Match History</h2>
        
        {matches.length === 0 ? (
          <div className="text-center text-subtitle py-8">
            No ARAM matches found
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayMatches.map((match) => (
                <MatchHistoryItem 
                  key={match.metadata.matchId} 
                  match={match} 
                  puuid={puuid} 
                />
              ))}
            </div>
            
            {hasMore && (
              <button
                onClick={showMore}
                className="w-full mt-4 px-4 py-3 bg-accent-dark hover:bg-accent-dark/80 rounded-lg font-semibold transition-colors border border-gold-dark/20"
              >
                Show More
              </button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
