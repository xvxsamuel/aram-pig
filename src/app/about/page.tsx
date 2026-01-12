export default function AboutPage() {
  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <section className="bg-abyss-500 rounded-xl p-6 md:p-8 border border-gold-dark/20">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gold-light">About ARAM PIG</h2>

          <div className="space-y-6 text-text-muted">
            <p className="text-lg leading-relaxed">
              ARAM PIG is the ultimate companion for tracking your ARAM games and helping you improve. We analyze your
              performance, review past games, and see your progress over time.
            </p>

            <div>
              <h2 className="text-2xl font-semibold mb-3 text-white">Features</h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Track all your ARAM matches with detailed statistics</li>
                <li>View KDA, win rate, and champion performance</li>
                <li>See your most played champions</li>
                <li>Analyze team compositions and match outcomes</li>
                <li>Highlight sub-optimal item choices (Coming soon)</li>
                <li>Get a personal rating number indicative of your itemization and tendencies (Coming soon)</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
