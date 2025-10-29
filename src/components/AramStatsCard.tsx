interface Props {
  totalGames: number
  wins: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  longestWinStreak: number
  totalDamage: number
  totalGameDuration: number
  totalDoubleKills: number
  totalTripleKills: number
  totalQuadraKills: number
  totalPentaKills: number
}

export default function AramStatsCard({ 
  totalGames, 
  wins, 
  totalKills,
  totalDeaths,
  totalAssists,
  longestWinStreak,
  totalDamage,
  totalGameDuration,
  totalDoubleKills,
  totalTripleKills,
  totalQuadraKills,
  totalPentaKills
}: Props) {
  // calculations
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0'
  const avgKDA = totalGames > 0 && totalDeaths > 0 
    ? ((totalKills + totalAssists) / totalDeaths).toFixed(2)
    : totalDeaths === 0 && totalGames > 0 ? 'Perfect' : '0'
  const damagePerMinute = totalGameDuration > 0 ? (totalDamage / (totalGameDuration / 60)).toFixed(0) : '0'

  return (
    <div className="w-full">
      <section className="bg-abyss-700 rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="px-6 py-3">
          <h2 className="text-xl font-bold text-left mb-3">Stats</h2>
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
          
          <div className="space-y-3 px-0">
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Win Rate</span>
              <span className="text-2xl font-bold">{winRate}%</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Total Games</span>
              <span className="text-xl font-bold">{totalGames} ({wins}W {totalGames - wins}L)</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Longest Win Streak</span>
              <span className="text-xl font-bold">{longestWinStreak}</span>
            </div>

            <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent my-4 -mx-6" />

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Average KDA</span>
              <span className="text-xl font-bold">{avgKDA}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Per Game</span>
              <span className="text-xl font-bold">
                {(totalKills/totalGames).toFixed(1)} / {(totalDeaths/totalGames).toFixed(1)} / {(totalAssists/totalGames).toFixed(1)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">DPM</span>
              <span className="text-xl font-bold">{damagePerMinute}</span>
            </div>

            {(totalDoubleKills > 0 || totalTripleKills > 0 || totalQuadraKills > 0 || totalPentaKills > 0) && (
              <>
                <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent my-4 -mx-6" />
                
                {totalPentaKills > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-sm">Pentakills</span>
                    <span className="text-xl font-bold">{totalPentaKills}</span>
                  </div>
                )}
                
                {totalQuadraKills > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-sm">Quadrakills</span>
                    <span className="text-xl font-bold">{totalQuadraKills}</span>
                  </div>
                )}
                
                {totalTripleKills > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-sm">Triple Kills</span>
                    <span className="text-xl font-bold">{totalTripleKills}</span>
                  </div>
                )}
                
                {totalDoubleKills > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-sm">Double Kills</span>
                    <span className="text-xl font-bold">{totalDoubleKills}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
