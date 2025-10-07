import { notFound } from "next/navigation"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, getDefaultTag } from "../../../lib/regions"
import SummonerContent from "../../../components/SummonerContent"
import { getSummonerByRiotId, type MatchData, getChampionCenteredUrl, getProfileIconUrl, getLatestVersion } from "../../../lib/riot-api"
import { supabase } from "../../../lib/supabase"
import { fetchChampionNames } from "../../../lib/champion-names"
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

// disable caching to always fetch fresh data
export const revalidate = 0

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
  let wins = 0
  let totalKills = 0
  let totalDeaths = 0
  let totalAssists = 0
  let mostPlayedChampion = ''
  let longestWinStreak = 0
  let totalDamage = 0
  let totalGameDuration = 0
  let totalGames = 0

  try {
    // try to load from database first to avoid riot api calls
    let loadedFromCache = false
    
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const { data: cachedSummoner } = await supabase
        .from("summoners")
        .select("puuid, game_name, tag_line, summoner_level, profile_icon_id")
        .ilike("game_name", gameName)
        .ilike("tag_line", tagLine)
        .single()
      
      if (cachedSummoner?.puuid) {
        console.log("Loaded summoner from database cache")
        // construct summoner data from cache
        summonerData = {
          account: {
            puuid: cachedSummoner.puuid,
            gameName: cachedSummoner.game_name,
            tagLine: cachedSummoner.tag_line
          },
          summoner: {
            puuid: cachedSummoner.puuid,
            summonerLevel: cachedSummoner.summoner_level,
            profileIconId: cachedSummoner.profile_icon_id
          }
        } as any
        loadedFromCache = true
      }
    }
    
    // only call riot api if not found in cache
    if (!loadedFromCache) {
      console.log("Fetching summoner from Riot API")
      summonerData = await getSummonerByRiotId(gameName, tagLine, platformCode)
    }
    
    if (!summonerData) {
      error = "Summoner not found"
    } else {
      const puuid = summonerData.account.puuid

      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        try {
          const { data: summonerRecord } = await supabase
            .from("summoners")
            .select("last_updated, game_name")
            .eq("puuid", puuid)
            .single()

          lastUpdated = summonerRecord?.last_updated || null

          // data is only incomplete if the profile has never been indexed (no game_name or last_updated)
          // once indexed, user must manually trigger updates via the Update button
          hasIncompleteData = !summonerRecord?.game_name || !summonerRecord?.last_updated

          console.log(`Fetching matches for puuid: ${puuid}`)
          
          // get lightweight match stats from summoner_matches (all matches, for stats calculation)
          const { data: allMatchStats, error: statsError } = await supabase
            .from("summoner_matches")
            .select("match_id, champion_name, kills, deaths, assists, win, damage_dealt_to_champions, game_duration")
            .eq("puuid", puuid)
            .order("match_id", { ascending: false })

          let matchIds: string[] = []
          if (!statsError && allMatchStats) {
            console.log(`Found ${allMatchStats.length} total matches for stats`)
            matchIds = allMatchStats.map(m => m.match_id)
            
            // filter out remakes from calculations (check against match data)
            const matchIdsSet = new Set(matchIds.slice(0, 100)) // only check first 100 for performance
            const { data: matchesWithRemakes } = await supabase
              .from("matches")
              .select("match_id, match_data")
              .in("match_id", Array.from(matchIdsSet))
            
            const remakeMatchIds = new Set<string>()
            if (matchesWithRemakes) {
              matchesWithRemakes.forEach((m: any) => {
                const participants = m.match_data?.info?.participants || []
                // check if any participant has gameEndedInEarlySurrender
                const isRemake = participants.some((p: any) => p.gameEndedInEarlySurrender === true)
                if (isRemake) {
                  remakeMatchIds.add(m.match_id)
                }
              })
            }
            
            // filter out remakes from stats
            const validMatches = allMatchStats.filter(m => !remakeMatchIds.has(m.match_id))
            
            totalGames = validMatches.length
            
            // calculate basic stats from lightweight data (excluding remakes)
            wins = validMatches.filter(m => m.win).length
            totalKills = validMatches.reduce((sum, m) => sum + m.kills, 0)
            totalDeaths = validMatches.reduce((sum, m) => sum + m.deaths, 0)
            totalAssists = validMatches.reduce((sum, m) => sum + m.assists, 0)
            totalDamage = validMatches.reduce((sum, m) => sum + (m.damage_dealt_to_champions || 0), 0)
            totalGameDuration = validMatches.reduce((sum, m) => sum + (m.game_duration || 0), 0)

            // find most played champion (excluding remakes)
            const championCounts: { [key: string]: number } = {}
            validMatches.forEach(m => {
              championCounts[m.champion_name] = (championCounts[m.champion_name] || 0) + 1
            })
            mostPlayedChampion = Object.entries(championCounts)
              .sort(([, a], [, b]) => b - a)[0]?.[0] || ''

            // calculate longest win streak (excluding remakes)
            let currentWinStreak = 0
            validMatches.forEach(m => {
              if (m.win) {
                currentWinStreak++
                if (currentWinStreak > longestWinStreak) {
                  longestWinStreak = currentWinStreak
                }
              } else {
                currentWinStreak = 0
              }
            })
          }
          
          // only fetch full match data for first 20 (for display)
          if (matchIds.length > 0) {
            const displayMatchIds = matchIds.slice(0, 20)
            const { data: displayMatches, error: displayError } = await supabase
              .from("matches")
              .select("match_data")
              .in("match_id", displayMatchIds)

            if (!displayError && displayMatches) {
              // sort to match the order of displayMatchIds
              const matchMap = new Map(displayMatches.map((m: any) => [m.match_data.metadata.matchId, m.match_data]))
              matches = displayMatchIds
                .map(id => matchMap.get(id))
                .filter((m: any) => m !== null) as MatchData[]
              
              console.log(`Loaded ${matches.length} matches for display`)
            }
          } else {
            console.log("No match IDs found")
          }
        } catch (dbError) {
          console.log("Database error:", dbError)
        }
      }
    }
  } catch (err: any) {
    console.error("Error fetching summoner data:", err)
    
    // handle rate limit errors specially
    if (err?.status === 429) {
      error = "Rate limit reached - please wait a moment and refresh"
    } else {
      error = "Failed to fetch summoner data"
    }
  }

  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)
  const profileIconUrl = summonerData ? await getProfileIconUrl(summonerData.summoner.profileIconId) : ''
  const championImageUrl = mostPlayedChampion ? await getChampionCenteredUrl(mostPlayedChampion) : undefined

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className={`max-w-7xl mx-auto px-4 ${error ? 'py-4' : 'pb-8'}`}>
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6 mb-6">
            <p className="text-red-400 text-lg">{error}</p>
            {error.includes("Rate limit") ? (
              <p className="text-subtitle text-sm mt-2">
                we're currently fetching your match history in the background. please wait a few moments without refreshing.
              </p>
            ) : (
              <p className="text-subtitle text-sm mt-2">
                Make sure the summoner name and tag are correct (e.g., hide on bush #KR1)
              </p>
            )}
          </div>
        )}

        {summonerData && (
          <SummonerContent
            summonerData={summonerData}
            matches={matches}
            wins={wins}
            totalGames={totalGames}
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
            championNames={championNames}
            lastUpdated={lastUpdated}
          />
        )}
      </div>
    </main>
  )
}