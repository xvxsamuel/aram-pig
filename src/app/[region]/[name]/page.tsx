import { notFound } from "next/navigation"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, getDefaultTag } from "../../../lib/regions"
import SummonerContent from "../../../components/SummonerContent"
import { getSummonerByRiotId, type MatchData, getChampionCenteredUrl, getProfileIconUrl, getLatestVersion } from "../../../lib/riot-api"
import { supabase } from "../../../lib/supabase"
import type { Metadata } from 'next'

interface Params {
  region: string
  name: string
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { region, name } = await params
  const decodedName = decodeURIComponent(name)
  const displayName = decodedName.replace("-", "#")
  
  return {
    title: `${displayName} - ${region.toUpperCase()} | ARAM PIG`,
    description: `View ${displayName}'s ARAM stats, match history, win rate, KDA, and performance on ${region.toUpperCase()} server.`,
    openGraph: {
      title: `${displayName} - ${region.toUpperCase()} | ARAM PIG`,
      description: `View ${displayName}'s ARAM stats, match history, win rate, KDA, and performance.`,
      url: `https://arampig.lol/${region}/${name}`,
      siteName: 'ARAM PIG',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: `${displayName} ARAM Stats`,
        },
      ],
      locale: 'en_US',
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} - ${region.toUpperCase()} | ARAM PIG`,
      description: `View ${displayName}'s ARAM stats, match history, win rate, KDA, and performance.`,
      images: ['/og-image.png'],
    },
  }
}

export default async function SummonerPage({ params }: { params: Promise<Params> }) {
  const { region, name } = await params

  const regionLabel = region.toUpperCase()
  const platformCode = LABEL_TO_PLATFORM[regionLabel]
  
  if (!platformCode) {
    notFound()
  }

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
          const { data: summonerRecord } = await supabase
            .from('summoners')
            .select('last_updated, game_name')
            .eq('puuid', puuid)
            .single()

          lastUpdated = summonerRecord?.last_updated || null

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
            
            console.log(`loaded ${matches.length} matches`)
          }
        } catch (dbError) {
          console.log('db error:', dbError)
        }
      }
    }
  } catch (err) {
    console.error("Error fetching summoner data:", err)
    error = "Failed to fetch summoner data"
  }

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

  const ddragonVersion = await getLatestVersion()
  const profileIconUrl = summonerData ? await getProfileIconUrl(summonerData.summoner.profileIconId) : ''
  const championImageUrl = mostPlayedChampion ? await getChampionCenteredUrl(mostPlayedChampion) : undefined

  return (
    <main className="min-h-screen bg-accent-darker text-white">
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
            totalKills={totalKills}
            totalDeaths={totalDeaths}
            totalAssists={totalAssists}
            mostPlayedChampion={mostPlayedChampion}
            longestWinStreak={longestWinStreak}
            totalDamage={totalDamage}
            totalGameDuration={totalGameDuration}
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