import { notFound } from "next/navigation"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, getDefaultTag } from "../../../lib/regions"
import Navbar from "../../../components/Navbar"
import SummonerContent from "../../../components/SummonerContent"
import { getSummonerByRiotId, type MatchData, getChampionCenteredUrl, getProfileIconUrl, getLatestVersion } from "../../../lib/riot-api"
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

  // url
  const decodedName = decodeURIComponent(name)
  const summonerName = decodedName.replace("-", "#")

  const [gameName, tagLine] = summonerName.includes("#") 
    ? summonerName.split("#") 
    : [summonerName, getDefaultTag(regionLabel)]

  let summonerData = null
  let matches: MatchData[] = []
  let error = null
  let hasIncompleteData = false
  let lastUpdated: string | null = null

  try {
    summonerData = await getSummonerByRiotId(gameName, tagLine, platformCode)
    
    if (!summonerData) {
      error = "Summoner not found"
    } else {
      const puuid = summonerData.account.puuid
      let hasIncompleteData = false

      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        try {
          // check
          const { data: summonerRecord } = await supabase
            .from('summoners')
            .select('last_updated, game_name')
            .eq('puuid', puuid)
            .single()

          // store timestamp
          lastUpdated = summonerRecord?.last_updated || null

          // incomplete
          hasIncompleteData = !summonerRecord?.game_name || !summonerRecord?.last_updated

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

  // stats
  let wins = 0
  let totalKills = 0
  let totalDeaths = 0
  let totalAssists = 0
  let mostPlayedChampion = ''
  let longestWinStreak = 0
  let totalDamage = 0
  let totalGameDuration = 0

  if (summonerData && matches.length > 0) {
    const championCounts: { [key: string]: number } = {}
    let currentWinStreak = 0
    
    matches.forEach(match => {
      const participant = match.info.participants.find(p => p.puuid === summonerData.account.puuid)
      if (participant) {
        if (participant.win) {
          wins++
          currentWinStreak++
          if (currentWinStreak > longestWinStreak) {
            longestWinStreak = currentWinStreak
          }
        } else {
          currentWinStreak = 0
        }
        
        totalKills += participant.kills
        totalDeaths += participant.deaths
        totalAssists += participant.assists
        totalDamage += participant.totalDamageDealtToChampions
        totalGameDuration += match.info.gameDuration
        
        // champ
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
  const damagePerSecond = totalGameDuration > 0 ? (totalDamage / totalGameDuration).toFixed(0) : '0'

  // ddragon
  const ddragonVersion = await getLatestVersion()
  const profileIconUrl = summonerData ? await getProfileIconUrl(summonerData.summoner.profileIconId) : ''
  const championImageUrl = mostPlayedChampion ? await getChampionCenteredUrl(mostPlayedChampion) : undefined

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
            longestWinStreak={longestWinStreak}
            damagePerSecond={damagePerSecond}
            region={region}
            name={name}
            hasIncompleteData={hasIncompleteData}
            championImageUrl={championImageUrl}
            profileIconUrl={profileIconUrl}
            ddragonVersion={ddragonVersion}
            lastUpdated={lastUpdated}
          />
        )}
      </div>
    </main>
  )
}