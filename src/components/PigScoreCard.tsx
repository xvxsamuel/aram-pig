interface Props {
  // future
}

export default function PigScoreCard({}: Props) {
  return (
    <div className="w-full">
      <section className="bg-accent-darker/60 rounded-xl border border-gold-dark/20 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">PIG Score</h2>
          <div className="h-px bg-gradient-to-r from-transparent via-gold-dark/30 to-transparent mb-6" />
          
          <div className="text-center">
            <div className="text-6xl font-bold mb-2">???</div>
            <div className="text-subtitle text-sm">Coming Soon</div>
          </div>
        </div>
      </section>
    </div>
  )
}
