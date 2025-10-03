import Navbar from "../../components/Navbar"

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <section className="bg-accent-darker/60 rounded-xl p-8 border border-gold-dark/20">
          <h1 className="text-4xl font-bold mb-6 text-gold-light">About ARAM Pig</h1>
          
          <div className="space-y-6 text-gray-300">
            <p className="text-lg leading-relaxed">
              ARAM Pig is your ultimate companion for tracking ARAM (All Random All Mid) match history 
              in League of Legends. We help you analyze your performance, review past games, and see 
              your progress over time.
            </p>

            <div>
              <h2 className="text-2xl font-semibold mb-3 text-white">Features</h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Track all your ARAM matches with detailed statistics</li>
                <li>View KDA, win rate, and champion performance</li>
                <li>See your most played champions</li>
                <li>Analyze team compositions and match outcomes</li>
                <li>Fast and responsive design</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-3 text-white">How It Works</h2>
              <p className="leading-relaxed">
                Simply search for any summoner by their Riot ID (Game Name + Tag) and region. 
                We'll fetch all available ARAM matches and display comprehensive statistics. 
                Click the Update button to refresh your match history with the latest games.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-3 text-white">Technology</h2>
              <p className="leading-relaxed">
                Built with Next.js, TypeScript, and powered by the Riot Games API. 
                All match data is stored securely and updated in real-time.
              </p>
            </div>

            <div className="pt-6 border-t border-gold-dark/20">
              <p className="text-sm text-gray-400">
                ARAM Pig isn't endorsed by Riot Games and doesn't reflect the views or opinions 
                of Riot Games or anyone officially involved in producing or managing Riot Games 
                properties. Riot Games, and all associated properties are trademarks or registered 
                trademarks of Riot Games, Inc.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
