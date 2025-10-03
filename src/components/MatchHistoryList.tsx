"use client"

import { useState, useMemo } from "react"
import type { MatchData } from "../lib/riot-api"
import MatchHistoryItem from "./MatchHistoryItem"
import ChampionFilter from "./ChampionFilter"

interface Props {
  matches: MatchData[]
  puuid: string
  region: string
  ddragonVersion: string
}

export default function MatchHistoryList({ matches, puuid, region, ddragonVersion }: Props) {
  const [displayCount, setDisplayCount] = useState(20)
  const [championFilter, setChampionFilter] = useState("")
  
  // get unique champions
  const uniqueChampions = useMemo(() => {
    const champSet = new Set<string>()
    matches.forEach(match => {
      const participant = match.info.participants.find(p => p.puuid === puuid)
      if (participant) {
        champSet.add(participant.championName)
      }
    })
    return Array.from(champSet)
  }, [matches, puuid])
  
  const filteredMatches = championFilter
    ? matches.filter(match => {
        const participant = match.info.participants.find(p => p.puuid === puuid)
        return participant?.championName === championFilter
      })
    : matches
  
  const displayMatches = filteredMatches.slice(0, displayCount)
  const hasMore = displayCount < filteredMatches.length

  const showMore = () => {
    setDisplayCount(prev => Math.min(prev + 20, filteredMatches.length))
  }

  return (
    <div className="flex-1 min-w-0">
      <section className="bg-accent-darker/60 rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold flex-shrink-0">Recent Matches</h2>
            <ChampionFilter
              value={championFilter}
              onChange={(champ) => {
                setChampionFilter(champ)
                setDisplayCount(20)
              }}
              champions={uniqueChampions}
              ddragonVersion={ddragonVersion}
            />
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-gold-dark/30 to-transparent mb-6" />
          
          {filteredMatches.length === 0 ? (
          <div className="text-center text-subtitle py-8">
            {championFilter ? `No matches found for "${championFilter}"` : 'No ARAM matches found'}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayMatches.map((match) => (
                <MatchHistoryItem 
                  key={match.metadata.matchId} 
                  match={match} 
                  puuid={puuid}
                  region={region}
                  ddragonVersion={ddragonVersion}
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
        </div>
      </section>
    </div>
  )
}
