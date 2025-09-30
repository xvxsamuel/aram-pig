import { notFound } from "next/navigation"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, getDefaultTag } from "../../../lib/regions"
import SearchBar from "../../../components/SearchBar"
import { getSummonerByRiotId, getMatchIdsByPuuid } from "../../../lib/riot-api"

interface Params {
  region: string
  name: string
}

export default async function SummonerPage({ params }: { params: Params }) {
  const { region, name } = params

  // Check if region is a valid label (e.g., "EUW", "NA")
  const regionLabel = region.toUpperCase()
  const platformCode = LABEL_TO_PLATFORM[regionLabel]
  
  // If not a valid label, try to convert it
  if (!platformCode) {
    notFound()
  }

  // URL Fix - convert "Name-TAG" back to "Name#TAG"
  const decodedName = decodeURIComponent(name)
  const summonerName = decodedName.replace("-", "#")

  // Parse Riot ID (gameName#tagLine)
  // If no tag provided, use default tag for the region
  const [gameName, tagLine] = summonerName.includes("#") 
    ? summonerName.split("#") 
    : [summonerName, getDefaultTag(regionLabel)]

  // Fetch summoner data from Riot API
  let summonerData = null
  let matchIds: string[] = []
  let error = null

  try {
    summonerData = await getSummonerByRiotId(gameName, tagLine, platformCode)
    
    if (!summonerData) {
      error = "Summoner not found"
    } else {
      // Fetch ARAM match history
      const regional = PLATFORM_TO_REGIONAL[platformCode]
      matchIds = await getMatchIdsByPuuid(summonerData.account.puuid, regional, 450, 20)
    }
  } catch (err) {
    console.error("Error fetching summoner data:", err)
    error = "Failed to fetch summoner data"
  }

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <header className="sticky top-0 z-40 bg-black/40 border-b border-gold-light/20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <img src="/title-bar.svg" alt="ARAM Pig" className="h-12 w-auto" />
            </a>
            <SearchBar className="flex-1 max-w-2xl h-12" />
          </div>
        </div>
      </header> 
      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6 mb-6">
            <p className="text-red-400 text-lg">{error}</p>
            <p className="text-subtitle text-sm mt-2">
              Make sure the summoner name and tag are correct (e.g., hide on bush #KR1)
            </p>
          </div>
        )}

        {summonerData && (
          <>
            {/* Summoner info section */}
            <section className="bg-accent-darker/60 rounded-2xl p-6 border border-gold-dark/20 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-xl bg-accent-dark border-2 border-gold-dark/40 flex items-center justify-center overflow-hidden">
                  <img 
                    src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/profileicon/${summonerData.summoner.profileIconId}.png`}
                    alt="Profile Icon"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h1 className="text-3xl font-bold mb-2">
                    {summonerData.account.gameName}
                    <span className="text-subtitle"> #{summonerData.account.tagLine}</span>
                  </h1>
                  <p className="text-subtitle text-lg">
                    Region: <span className="text-gold-light font-semibold">{regionLabel}</span>
                  </p>
                  <p className="text-subtitle">
                    Level {summonerData.summoner.summonerLevel}
                  </p>
                </div>
              </div>
            </section>

            {/* ARAM Stats section */}
            <section className="bg-accent-darker/60 rounded-2xl p-6 border border-gold-dark/20 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-gold-light">ARAM Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-accent-dark/50 rounded-xl p-4 border border-gold-dark/10">
                  <p className="text-subtitle text-sm mb-1">ARAM Games Found</p>
                  <p className="text-3xl font-bold">{matchIds.length}</p>
                </div>
                <div className="bg-accent-dark/50 rounded-xl p-4 border border-gold-dark/10">
                  <p className="text-subtitle text-sm mb-1">Win Rate</p>
                  <p className="text-3xl font-bold">Coming Soon</p>
                </div>
                <div className="bg-accent-dark/50 rounded-xl p-4 border border-gold-dark/10">
                  <p className="text-subtitle text-sm mb-1">KDA</p>
                  <p className="text-3xl font-bold">Coming Soon</p>
                </div>
              </div>
            </section>

            {/* Champion stats section */}
            <section className="bg-accent-darker/60 rounded-2xl p-6 border border-gold-dark/20">
              <h2 className="text-2xl font-bold mb-4 text-gold-light">Top ARAM Champions</h2>
              <p className="text-subtitle">
                Found {matchIds.length} ARAM matches. Detailed statistics coming soon...
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}