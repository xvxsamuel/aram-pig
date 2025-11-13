import { notFound } from "next/navigation"
import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, getDefaultTag } from "../../../lib/regions"
import SummonerContent from "../../../components/SummonerContent"
import { getSummonerByRiotId, type MatchData, getChampionCenteredUrl, getProfileIconUrl, getLatestVersion } from "../../../lib/riot-api"
import { supabase, createAdminClient } from "../../../lib/supabase"
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

// disable caching
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

  const [rawGameName, rawTagLine] = summonerName.includes("#") 
    ? summonerName.split("#") 
    : [summonerName, getDefaultTag(regionLabel)]
  
  // trim whitespace from parsed name parts
  const gameName = rawGameName.trim()
  const tagLine = rawTagLine.trim()

  console.log('URL parsing:', { 
    rawName: name, 
    decodedName, 
    summonerName, 
    gameName, 
    tagLine 
  })

  let summonerData = null
  let matches: MatchData[] = []
  let error = null
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
  let totalDoubleKills = 0
  let totalTripleKills = 0
  let totalQuadraKills = 0
  let totalPentaKills = 0
  let averagePigScore: number | null = null
  let pigScoreGames = 0

  try {
    // try to load from database first to avoid riot api calls
    let loadedFromCache = false
    
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.log(`Cache lookup: searching for ${gameName}#${tagLine} in ${regionLabel}`)
      
      // query with case-insensitive match on game_name and exact match on region
      let query = supabase
        .from("summoners")
        .select("puuid, game_name, tag_line, summoner_level, profile_icon_id, region")
        .eq("region", regionLabel)
        .ilike("game_name", gameName)
      
      // handle tag line comparison (account for null values in old data)
      if (tagLine) {
        query = query.ilike("tag_line", tagLine)
      }
      
      const { data: cachedSummoner, error: cacheError } = await query.single()
      
      console.log('Cache query result:', { cachedSummoner, error: cacheError?.message })
      
      if (cacheError) {
        if (cacheError.code !== 'PGRST116') {
          console.warn(`Cache lookup error: ${cacheError.message}`)
        } else {
          console.log('Cache miss: no matching summoner found')
        }
      }
      
      if (cachedSummoner?.puuid && cachedSummoner?.game_name && cachedSummoner?.tag_line) {
        console.log(`Loaded summoner from database cache (${cachedSummoner.game_name}#${cachedSummoner.tag_line})`)
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
      console.log(`Cache miss: Fetching summoner from Riot API: (${gameName}#${tagLine})`)
      summonerData = await getSummonerByRiotId(gameName, tagLine, platformCode)
      
      // store fetched summoner in database w/ admin client
      if (summonerData) {
        const accountTagLine = summonerData.account.tagLine || tagLine // fallback to parsed tagLine
        console.log(`API returned: ${summonerData.account.gameName}${accountTagLine} Region:${regionLabel}`)
        const adminClient = createAdminClient()
        const { error: upsertError } = await adminClient
          .from('summoners')
          .upsert({
            puuid: summonerData.account.puuid,
            game_name: summonerData.account.gameName,
            tag_line: accountTagLine,
            summoner_level: summonerData.summoner.summonerLevel,
            profile_icon_id: summonerData.summoner.profileIconId,
            region: regionLabel,
            last_updated: new Date().toISOString(),
          }, {
            onConflict: 'puuid'
          })
        
        if (upsertError) {
          console.error('Failed to cache summoner in database:', upsertError)
        } else {
          console.log(`Successfully cached summoner in database`)
        }
      }
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

          console.log(`Fetching matches for puuid: ${puuid}`)
          
          // get lightweight match stats from summoner_matches (exclude remakes from stats)
          const { data: allMatchStats, error: statsError } = await supabase
            .from("summoner_matches")
            .select("match_id, champion_name, kills, deaths, assists, win, damage_dealt_to_champions, game_duration, game_ended_in_early_surrender, double_kills, triple_kills, quadra_kills, penta_kills, pig_score")
            .eq("puuid", puuid)
            .order("match_id", { ascending: false })

          let matchIds: string[] = []
          if (!statsError && allMatchStats) {
            console.log(`Found ${allMatchStats.length} total matches`)
            matchIds = allMatchStats.map(m => m.match_id)
            
            // filter out remakes from stats calculation
            const validMatches = allMatchStats.filter(m => !m.game_ended_in_early_surrender)
            console.log(`${validMatches.length} matches after excluding remakes`)
            
            totalGames = validMatches.length
            
            // calculate basic stats from lightweight data (excluding remakes)
            wins = validMatches.filter(m => m.win).length
            totalKills = validMatches.reduce((sum, m) => sum + m.kills, 0)
            totalDeaths = validMatches.reduce((sum, m) => sum + m.deaths, 0)
            totalAssists = validMatches.reduce((sum, m) => sum + m.assists, 0)
            totalDamage = validMatches.reduce((sum, m) => sum + (m.damage_dealt_to_champions || 0), 0)
            totalGameDuration = validMatches.reduce((sum, m) => sum + (m.game_duration || 0), 0)
            totalDoubleKills = validMatches.reduce((sum, m) => sum + (m.double_kills || 0), 0)
            totalTripleKills = validMatches.reduce((sum, m) => sum + (m.triple_kills || 0), 0)
            totalQuadraKills = validMatches.reduce((sum, m) => sum + (m.quadra_kills || 0), 0)
            totalPentaKills = validMatches.reduce((sum, m) => sum + (m.penta_kills || 0), 0)

            // calculate average pig score (only from games with pig scores, last 30 days)
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
            const matchesWithPigScore = validMatches.filter(m => m.pig_score !== null && m.pig_score !== undefined)
            
            if (matchesWithPigScore.length > 0) {
              // fetch match dates for pig score matches
              const pigScoreMatchIds = matchesWithPigScore.map(m => m.match_id)
              const { data: matchDates } = await supabase
                .from("matches")
                .select("match_id, game_creation")
                .in("match_id", pigScoreMatchIds)
              
              if (matchDates) {
                const matchDateMap = new Map(matchDates.map(m => [m.match_id, m.game_creation]))
                const recentMatchesWithPigScore = matchesWithPigScore.filter(m => {
                  const matchDate = matchDateMap.get(m.match_id)
                  return matchDate && matchDate >= thirtyDaysAgo
                })
                
                if (recentMatchesWithPigScore.length > 0) {
                  const totalPigScore = recentMatchesWithPigScore.reduce((sum, m) => sum + (m.pig_score || 0), 0)
                  averagePigScore = totalPigScore / recentMatchesWithPigScore.length
                  pigScoreGames = recentMatchesWithPigScore.length
                }
              }
            }

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
          
          // fetch full match data for first 20 (for display)
          if (matchIds.length > 0) {
            const displayMatchIds = matchIds.slice(0, 20)
            
            // get match metadata
            const { data: matchRecords, error: matchError } = await supabase
              .from("matches")
              .select("match_id, game_creation, game_duration")
              .in("match_id", displayMatchIds)

            // get all participants for these matches
            const { data: participants, error: participantsError } = await supabase
              .from("summoner_matches")
              .select("*")
              .in("match_id", displayMatchIds)

            if (!matchError && !participantsError && matchRecords && participants) {
              // reconstruct match data structure
              matches = displayMatchIds.map(matchId => {
                const match = matchRecords.find(m => m.match_id === matchId)
                const matchParticipants = participants.filter(p => p.match_id === matchId)
                
                if (!match || matchParticipants.length === 0) return null

                return {
                  metadata: {
                    matchId: match.match_id,
                    participants: matchParticipants.map(p => p.puuid)
                  },
                  info: {
                    gameCreation: match.game_creation,
                    gameDuration: match.game_duration,
                    gameEndTimestamp: match.game_creation + (match.game_duration * 1000),
                    gameMode: "ARAM",
                    queueId: 450,
                    participants: matchParticipants.map(p => ({
                      puuid: p.puuid,
                      summonerName: p.summoner_name || "",
                      riotIdGameName: p.riot_id_game_name || "",
                      riotIdTagline: p.riot_id_tagline || "",
                      championName: p.champion_name,
                      championId: 0,
                      teamId: p.team_id || 100,
                      win: p.win,
                      gameEndedInEarlySurrender: p.game_ended_in_early_surrender || false,
                      kills: p.kills,
                      deaths: p.deaths,
                      assists: p.assists,
                      champLevel: p.champ_level || 18,
                      totalDamageDealtToChampions: p.damage_dealt_to_champions,
                      goldEarned: p.gold_earned,
                      totalMinionsKilled: p.total_minions_killed,
                      neutralMinionsKilled: 0,
                      summoner1Id: p.summoner1_id || 0,
                      summoner2Id: p.summoner2_id || 0,
                      item0: p.item0 || 0,
                      item1: p.item1 || 0,
                      item2: p.item2 || 0,
                      item3: p.item3 || 0,
                      item4: p.item4 || 0,
                      item5: p.item5 || 0,
                      pigScore: p.pig_score,
                      firstItem: p.first_item,
                      secondItem: p.second_item,
                      thirdItem: p.third_item,
                      perks: {
                        styles: [
                          {
                            style: p.perk_primary_style || 0,
                            selections: [
                              { perk: p.perk0 || 0 },
                              { perk: p.perk1 || 0 },
                              { perk: p.perk2 || 0 },
                              { perk: p.perk3 || 0 },
                            ]
                          },
                          {
                            style: p.perk_sub_style || 0,
                            selections: [
                              { perk: p.perk4 || 0 },
                              { perk: p.perk5 || 0 },
                            ]
                          }
                        ],
                        statPerks: {
                          offense: p.stat_perk0 || 0,
                          flex: p.stat_perk1 || 0,
                          defense: p.stat_perk2 || 0,
                        }
                      }
                    }))
                  }
                }
              }).filter(m => m !== null) as MatchData[]
              
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
    <main className="min-h-screen bg-abyss-700 text-white">
      <div className={`max-w-7xl mx-auto px-4 ${error ? 'py-4' : 'pb-8'}`}>
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6 mb-6">
            <p className="text-red-400 text-lg">{error}</p>
            {error.includes("Rate limit") ? (
              <p className="text-subtitle text-sm mt-2">
                We're currently fetching your match history in the background. Please wait a few moments without refreshing.
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
            totalDoubleKills={totalDoubleKills}
            totalTripleKills={totalTripleKills}
            totalQuadraKills={totalQuadraKills}
            totalPentaKills={totalPentaKills}
            region={region}
            name={name}
            championImageUrl={championImageUrl}
            profileIconUrl={profileIconUrl}
            ddragonVersion={ddragonVersion}
            championNames={championNames}
            lastUpdated={lastUpdated}
            averagePigScore={averagePigScore}
            pigScoreGames={pigScoreGames}
          />
        )}
      </div>
    </main>
  )
}