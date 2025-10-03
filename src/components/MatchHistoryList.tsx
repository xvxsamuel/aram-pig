import type { MatchData } from "../lib/riot-api"
import MatchHistoryItem from "./MatchHistoryItem"

interface Props {
  matches: MatchData[]
  puuid: string
}

export default function MatchHistoryList({ matches, puuid }: Props) {
  return (
    <div className="flex-1 min-w-0">
      <section className="bg-accent-darker/60 rounded-xl p-6 border border-gold-dark/20">
        <h2 className="text-2xl font-bold mb-4 text-gold-light">Match History</h2>
        
        {matches.length === 0 ? (
          <div className="text-center text-subtitle py-8">
            No ARAM matches found
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((match) => (
              <MatchHistoryItem 
                key={match.metadata.matchId} 
                match={match} 
                puuid={puuid} 
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
