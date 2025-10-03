interface Props {
  totalGames: number
  wins: number
  winRate: string
  avgKDA: string
  totalKills: number
  totalDeaths: number
  totalAssists: number
}

export default function PigScoreCard({ 
  totalGames, 
  wins, 
  winRate, 
  avgKDA,
  totalKills,
  totalDeaths,
  totalAssists
}: Props) {
  return (
    <div className="w-80 flex-shrink-0">
      <section className="bg-accent-darker/60 rounded-xl p-6 border border-gold-dark/20 sticky top-24">
        <h2 className="text-2xl font-bold mb-6 text-gold-light text-center">PIG SCORE</h2>
        
        {/* Placeholder Score */}
        <div className="text-center mb-6">
          <div className="text-6xl font-bold text-gold-light mb-2">???</div>
          <div className="text-subtitle text-sm">Coming Soon</div>
        </div>

        {/* ARAM Stats */}
        <div className="space-y-4 pt-6 border-t border-gold-dark/20">
          <h3 className="font-bold text-lg mb-3">ARAM Stats</h3>
          
          <div className="bg-accent-dark/50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-subtitle text-sm">Total Games</span>
              <span className="text-xl font-bold">{totalGames}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Win Rate</span>
              <span className="text-xl font-bold text-blue-400">{winRate}%</span>
            </div>
          </div>

          <div className="bg-accent-dark/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold mb-1">
              {wins}W {totalGames - wins}L
            </div>
            <div className="text-subtitle text-xs">
              Win Rate {winRate}%
            </div>
          </div>

          <div className="bg-accent-dark/50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-subtitle text-sm">Average KDA</span>
              <span className="text-xl font-bold text-gold-light">{avgKDA}</span>
            </div>
            <div className="text-center text-subtitle text-xs">
              {(totalKills/totalGames).toFixed(1)} / {(totalDeaths/totalGames).toFixed(1)} / {(totalAssists/totalGames).toFixed(1)}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
