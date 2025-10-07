interface Props {
  // future
}

export default function PigScoreCard({}: Props) {
  return (
    <div className="w-full">
      <section className="bg-accent-darker rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="px-6 py-3">
          <h2 className="text-xl font-bold text-left mb-3">PIG Score</h2>
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-6 -mx-3" />
          
          <div className="text-center">
            <div className="text-6xl font-bold mb-2">???</div>
            <div className="text-subtitle text-sm">Coming Soon</div>
          </div>
        </div>
      </section>
    </div>
  )
}
