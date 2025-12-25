import { notFound } from 'next/navigation'
import { LABEL_TO_PLATFORM, getDefaultTag } from '@/lib/game'
import SummonerContent from '@/components/summoner/SummonerContent'
import SummonerNotFound from '@/components/summoner/SummonerNotFound'
import { getSummonerByRiotId, getProfileIconUrl } from '@/lib/riot/api'
import { getLatestVersion, fetchChampionNames } from '@/lib/ddragon'
import { supabase } from '@/lib/db'
import type { Metadata } from 'next'

interface Params {
  region: string
  name: string
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { region, name } = await params
  const decodedName = decodeURIComponent(name)
  const lastHyphen = decodedName.lastIndexOf('-')
  const displayName = lastHyphen !== -1 
    ? decodedName.slice(0, lastHyphen) + '#' + decodedName.slice(lastHyphen + 1)
    : decodedName
  
  const regionLabel = region.toUpperCase()
  const platformCode = LABEL_TO_PLATFORM[regionLabel]
  
  // try to get proper capitalization from database
  let properDisplayName = displayName
  if (platformCode && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const [gameName, tagLine] = displayName.includes('#')
        ? displayName.split('#')
        : [displayName, getDefaultTag(regionLabel)]
      
      const { data: cachedSummoner, error } = await supabase
        .from('summoners')
        .select('game_name, tag_line')
        .ilike('game_name', gameName)
        .ilike('tag_line', tagLine)
        .eq('region', platformCode)
        .single()
      
      if (error) {
        console.error('[Metadata] Failed to fetch summoner:', error)
      } else if (cachedSummoner?.game_name && cachedSummoner?.tag_line) {
        properDisplayName = `${cachedSummoner.game_name}#${cachedSummoner.tag_line}`
      }
    } catch (err) {
      console.error('[Metadata] Error querying summoner:', err)
    }
  }

  return {
    title: `${properDisplayName} - ${region.toUpperCase()} | ARAM PIG`,
    description: `View ${properDisplayName}'s ARAM stats, match history, win rate, KDA, and performance on ${region.toUpperCase()} server.`,
    openGraph: {
      title: `${properDisplayName} - ${region.toUpperCase()} | ARAM PIG`,
      description: `View ${properDisplayName}'s ARAM stats, match history, win rate, KDA, and performance.`,
      url: `https://arampig.lol/${region}/${name}`,
      siteName: 'ARAM PIG',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: `${properDisplayName} ARAM Stats`,
        },
      ],
      locale: 'en_US',
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${properDisplayName} - ${region.toUpperCase()} | ARAM PIG`,
      description: `View ${properDisplayName}'s ARAM stats, match history, win rate, KDA, and performance.`,
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
  const lastHyphen = decodedName.lastIndexOf('-')
  const summonerName = lastHyphen !== -1 
    ? decodedName.slice(0, lastHyphen) + '#' + decodedName.slice(lastHyphen + 1)
    : decodedName

  const [gameName, tagLine] = summonerName.includes('#')
    ? summonerName.split('#')
    : [summonerName, getDefaultTag(regionLabel)]

  let summonerData = null
  let error = null

  // wrap all async operations in try-catch
  let ddragonVersion = ''
  let championNames: Record<string, string> = {}
  
  try {
    ;[ddragonVersion, championNames] = await Promise.all([
      getLatestVersion().catch(err => {
        console.error('[SummonerPage] Failed to fetch ddragon version:', err)
        return '15.11.1' // fallback
      }),
      getLatestVersion()
        .then(v => fetchChampionNames(v))
        .catch(err => {
          console.error('[SummonerPage] Failed to fetch champion names:', err)
          return {} // fallback
        }),
    ])
  } catch (err) {
    console.error('[SummonerPage] Failed to fetch ddragon data:', err)
    ddragonVersion = '15.11.1'
    championNames = {}
  }

  try {
    // try to load from database first to avoid riot api calls
    let loadedFromCache = false

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const { data: cachedSummoner, error: cacheError } = await supabase
        .from('summoners')
        .select('puuid, game_name, tag_line, summoner_level, profile_icon_id, region')
        .ilike('game_name', gameName)
        .ilike('tag_line', tagLine)
        .eq('region', platformCode)
        .single()

      if (cacheError && cacheError.code !== 'PGRST116') {
        console.warn(`Cache lookup error: ${cacheError.message}`)
      }

      if (cachedSummoner?.puuid && cachedSummoner?.game_name && cachedSummoner?.tag_line) {
        console.log(`Loaded summoner from database cache (${gameName}#${tagLine})`)
        // construct summoner data from cache
        summonerData = {
          account: {
            puuid: cachedSummoner.puuid,
            gameName: cachedSummoner.game_name,
            tagLine: cachedSummoner.tag_line,
          },
          summoner: {
            puuid: cachedSummoner.puuid,
            summonerLevel: cachedSummoner.summoner_level,
            profileIconId: cachedSummoner.profile_icon_id,
          },
        } as any
        loadedFromCache = true
      }
    }

    // call riot api if not found in cache
    if (!loadedFromCache) {
      console.log(`Cache miss - fetching summoner from Riot API (${gameName}#${tagLine})`)

      try {
        summonerData = await getSummonerByRiotId(gameName, tagLine, platformCode)

        // cache the summoner data after fetching from API
        if (summonerData) {
          console.log('Caching summoner data...')
          const { error: cacheError } = await supabase.from('summoners').upsert(
            {
              puuid: summonerData.account.puuid,
              game_name: summonerData.account.gameName,
              tag_line: summonerData.account.tagLine,
              summoner_level: summonerData.summoner.summonerLevel,
              profile_icon_id: summonerData.summoner.profileIconId,
              region: platformCode,
              last_updated: null, // Don't set timestamp on initial cache - only when matches are fetched
            },
            {
              onConflict: 'puuid',
              ignoreDuplicates: false,
            }
          )

          if (cacheError) {
            console.error('Failed to cache summoner:', cacheError)
          } else {
            console.log('Summoner cached successfully')
          }
        }
      } catch (apiError: any) {
        console.error('Riot API error:', apiError)
        // let summonerData remain null, will check for alternatives below
      }

      // after fetching from api, check if summoner exists in db with different region
      if (!summonerData) {
        // api didn't find them, check if they exist in other regions
        const { data: otherRegionSummoner } = await supabase
          .from('summoners')
          .select('region, game_name, tag_line')
          .ilike('game_name', gameName)
          .ilike('tag_line', tagLine)
          .neq('region', platformCode)
          .limit(1)
          .single()

        if (otherRegionSummoner) {
          console.log(`Summoner found in ${otherRegionSummoner.region}, not ${platformCode}`)
          error = `wrong-region:${otherRegionSummoner.region}:${otherRegionSummoner.game_name}:${otherRegionSummoner.tag_line}`
        }
      }
    }

    if (!summonerData && !error) {
      error = 'Summoner not found'
    }
  } catch (err: any) {
    console.error('Error fetching summoner data:', err)

    // don't overwrite wrong-region error
    if (!error || !error.startsWith('wrong-region:')) {
      // handle rate limit errors specially
      if (err?.status === 429) {
        error = 'Rate limit reached - please wait a moment and refresh'
      } else {
        error = 'Failed to fetch summoner data'
      }
    }
  }

  // fetch profile icon if summoner data exists
  const profileIconUrl = summonerData ? await getProfileIconUrl(summonerData.summoner.profileIconId).catch(err => {
    console.error('[SummonerPage] Failed to fetch profile icon:', err)
    return ''
  }) : ''

  // fetch last_updated and check if has matches for new profile detection
  let lastUpdated: string | null = null
  let hasMatches = false
  if (summonerData) {
    const { data: summonerRecord } = await supabase
      .from('summoners')
      .select('last_updated')
      .eq('puuid', summonerData.account.puuid)
      .single()

    lastUpdated = summonerRecord?.last_updated || null

    // quick check if any matches exist
    const { count } = await supabase
      .from('summoner_matches')
      .select('match_id', { count: 'exact', head: true })
      .eq('puuid', summonerData.account.puuid)
      .limit(1)

    hasMatches = (count || 0) > 0
  }

  // fetch all summoners with matching name for suggestions
  let suggestedSummoners: any[] = []
  if (error && error.startsWith('wrong-region:')) {
    const { data: allMatches } = await supabase
      .from('summoners')
      .select('puuid, game_name, tag_line, region, profile_icon_id')
      .ilike('game_name', gameName)
      .ilike('tag_line', tagLine)

    if (allMatches) {
      suggestedSummoners = allMatches
    }
  }

  return (
    <main className="min-h-screen bg-abyss-700 text-white">
      {error ? (
        <div className="max-w-6xl mx-auto px-4 py-4">
          {error.includes('Rate limit') && (
            <SummonerNotFound
              searchedRegion={regionLabel}
              suggestedSummoners={[]}
              ddragonVersion={ddragonVersion}
              errorMessage="Rate limit reached"
              errorHint="We're currently fetching your match history in the background. Please wait a few moments without refreshing."
            />
          )}

          {!error.includes('Rate limit') && (
            <SummonerNotFound
              searchedRegion={regionLabel}
              suggestedSummoners={suggestedSummoners}
              ddragonVersion={ddragonVersion}
            />
          )}
        </div>
      ) : (
        summonerData && (
          <SummonerContent
            summonerData={summonerData}
            region={region}
            name={name}
            profileIconUrl={profileIconUrl}
            ddragonVersion={ddragonVersion}
            championNames={championNames}
            lastUpdated={lastUpdated}
            hasMatches={hasMatches}
          />
        )
      )}
    </main>
  )
}
