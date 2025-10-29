interface Props {
  averagePigScore: number | null
  totalGames: number
}

export default function PigScoreCard({ averagePigScore, totalGames }: Props) {
  return (
    <div className="w-full">
      <section className="bg-abyss-700 rounded-xl border border-gold-dark/40 overflow-hidden">
        <div className="px-6 py-3">
          <h2 className="text-xl font-bold text-left mb-3">Personal Item Grade</h2>
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-6" />
          
          <div className="text-center">
            {averagePigScore !== null ? (
              <>
                <div className={`text-6xl font-bold mb-2 ${averagePigScore < 50 ? 'text-negative' : 'text-accent-light'}`}>
                  {averagePigScore.toFixed(1)}
                </div>
                <div className="text-text-muted text-sm">
                  across {totalGames} game{totalGames !== 1 ? 's' : ''} (last 30 days)
                </div>
              </>
            ) : (
              <>
                <div className="text-6xl font-bold mb-2 text-gray-500">--</div>
                <div className="text-text-muted text-sm">No recent games with PIG scores</div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
