interface Props {
  totalGames: number
  wins: number
  winRate: string
  avgKDA: string
  totalKills: number
  totalDeaths: number
  totalAssists: number
  longestWinStreak: number
  damagePerSecond: string
}

export default function AramStatsCard({ 
  totalGames, 
  wins, 
  winRate, 
  avgKDA,
  totalKills,
  totalDeaths,
  totalAssists,
  longestWinStreak,
  damagePerSecond
}: Props) {
  return (
    <div className="w-full">
      <section className="bg-accent-darker/60 rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-1">Stats</h2>
          <div className="h-px bg-gradient-to-r from-transparent via-gold-dark/30 to-transparent mb-6" />
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Win Rate</span>
              <span className="text-2xl font-bold">{winRate}%</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Total Games</span>
              <span className="text-xl font-bold">{totalGames} ({wins}W {totalGames - wins}L)</span>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-gold-dark/20 to-transparent my-4" />

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Average KDA</span>
              <span className="text-xl font-bold">{avgKDA}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-subtitle">Per Game</span>
              <span className="text-subtitle">
                {(totalKills/totalGames).toFixed(1)} / {(totalDeaths/totalGames).toFixed(1)} / {(totalAssists/totalGames).toFixed(1)}
              </span>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-gold-dark/20 to-transparent my-4" />

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Longest Win Streak</span>
              <span className="text-xl font-bold">{longestWinStreak}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-subtitle text-sm">Damage per Second</span>
              <span className="text-xl font-bold">{damagePerSecond}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
