interface Props {
  totalGames: number
  wins: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  longestWinStreak: number
  totalDamage: number
  totalGameDuration: number
}

export default function AramStatsCard({ 
  totalGames, 
  wins, 
  totalKills,
  totalDeaths,
  totalAssists,
  longestWinStreak,
  totalDamage,
  totalGameDuration
}: Props) {
  // calculations
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0'
  const avgKDA = totalGames > 0 && totalDeaths > 0 
    ? ((totalKills + totalAssists) / totalDeaths).toFixed(2)
    : totalDeaths === 0 && totalGames > 0 ? 'Perfect' : '0'
  const damagePerMinute = totalGameDuration > 0 ? (totalDamage / (totalGameDuration / 60)).toFixed(0) : '0'

  return (
    <div className="w-full">
      <section className="bg-accent-darker rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="px-6 py-3">
          <h2 className="text-xl font-bold text-left mb-3">Stats</h2>
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
          
          <div className="space-y-3 px-0">
            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Win Rate</span>
              <span className="text-2xl font-bold">{winRate}%</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Total Games</span>
              <span className="text-xl font-bold">{totalGames} ({wins}W {totalGames - wins}L)</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Longest Win Streak</span>
              <span className="text-xl font-bold">{longestWinStreak}</span>
            </div>

            <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent my-4 -mx-6" />

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Average KDA</span>
              <span className="text-xl font-bold">{avgKDA}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Per Game</span>
              <span className="text-xl font-bold">
                {(totalKills/totalGames).toFixed(1)} / {(totalDeaths/totalGames).toFixed(1)} / {(totalAssists/totalGames).toFixed(1)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">DPM</span>
              <span className="text-xl font-bold">{damagePerMinute}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
