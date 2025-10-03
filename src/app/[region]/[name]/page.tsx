import { notFound } from "next/navigation"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, getDefaultTag } from "../../../lib/regions"
import Navbar from "../../../components/Navbar"
import SummonerContent from "../../../components/SummonerContent"
import { getSummonerByRiotId, type MatchData } from "../../../lib/riot-api"
import { supabase } from "../../../lib/supabase"

interface Params {
  region: string
  name: string
}

export default async function SummonerPage({ params }: { params: Promise<Params> }) {
  const { region, name } = await params

  const regionLabel = region.toUpperCase()
  const platformCode = LABEL_TO_PLATFORM[regionLabel]
  
  if (!platformCode) {
    notFound()
  }

  // url fix
  const decodedName = decodeURIComponent(name)
  const summonerName = decodedName.replace("-", "#")

  const [gameName, tagLine] = summonerName.includes("#") 
    ? summonerName.split("#") 
    : [summonerName, getDefaultTag(regionLabel)]

  let summonerData = null
  let matches: MatchData[] = []
  let error = null

  try {
    summonerData = await getSummonerByRiotId(gameName, tagLine, platformCode)
    
    if (!summonerData) {
      error = "Summoner not found"
    } else {
      const puuid = summonerData.account.puuid

      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        try {
          const { data: dbMatches, error: dbError } = await supabase
            .from('summoner_matches')
            .select(`
              match_id,
              matches (
                match_data
              )
            `)
            .eq('puuid', puuid)
            .order('match_id', { ascending: false })

          if (!dbError && dbMatches && dbMatches.length > 0) {
            matches = dbMatches
              .map((record: any) => record.matches?.match_data)
              .filter((m: any) => m !== null) as MatchData[]
            
            console.log(`Loaded ${matches.length} matches from database`)
          }
        } catch (dbError) {
          console.log('Database error:', dbError)
        }
      }
    }
  } catch (err) {
    console.error("Error fetching summoner data:", err)
    error = "Failed to fetch summoner data"
  }

  // stats from matches
  let wins = 0
  let totalKills = 0
  let totalDeaths = 0
  let totalAssists = 0
  let mostPlayedChampion = ''

  if (summonerData && matches.length > 0) {
    const championCounts: { [key: string]: number } = {}
    
    matches.forEach(match => {
      const participant = match.info.participants.find(p => p.puuid === summonerData.account.puuid)
      if (participant) {
        if (participant.win) wins++
        totalKills += participant.kills
        totalDeaths += participant.deaths
        totalAssists += participant.assists
        
        // champ plays count
        championCounts[participant.championName] = (championCounts[participant.championName] || 0) + 1
      }
    })
  
    let maxPlays = 0
    for (const [champion, count] of Object.entries(championCounts)) {
      if (count > maxPlays) {
        maxPlays = count
        mostPlayedChampion = champion
      }
    }
  }

  const winRate = matches.length > 0 ? ((wins / matches.length) * 100).toFixed(1) : '0'
  const avgKDA = matches.length > 0 && totalDeaths > 0 
    ? ((totalKills + totalAssists) / totalDeaths).toFixed(2)
    : totalDeaths === 0 && matches.length > 0 ? 'Perfect' : '0'

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <Navbar />
      <div className={`max-w-7xl mx-auto px-4 ${error ? 'py-4' : ''}`}>
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6 mb-6">
            <p className="text-red-400 text-lg">{error}</p>
            <p className="text-subtitle text-sm mt-2">
              Make sure the summoner name and tag are correct (e.g., hide on bush #KR1)
            </p>
          </div>
        )}

        {summonerData && (
          <SummonerContent
            summonerData={summonerData}
            matches={matches}
            wins={wins}
            winRate={winRate}
            avgKDA={avgKDA}
            totalKills={totalKills}
            totalDeaths={totalDeaths}
            totalAssists={totalAssists}
            mostPlayedChampion={mostPlayedChampion}
            region={region}
            name={name}
          />
        )}
      </div>
    </main>
  )
}