// unified champion stats API - returns all data for a champion with computed statistics
// cached with stale-while-revalidate for performance
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getVariance, getStdDev, type WelfordState } from '@/lib/db'
import { fetchChampionNames, getApiNameFromUrl, getLatestVersion } from '@/lib/ddragon'
import { getLatestPatches } from '@/lib/game'

// cache for 60s, serve stale for 5min while revalidating
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

interface GameStats {
  games: number
  wins: number
}

interface ChampionStatsData {
  games: number
  wins: number
  championStats?: {
    sumDamageToChampions: number
    sumTotalDamage: number
    sumHealing: number
    sumShielding: number
    sumCCTime: number
    sumGameDuration: number
    sumDeaths: number
    welford?: {
      damageToChampionsPerMin?: WelfordState
      totalDamagePerMin?: WelfordState
      healingShieldingPerMin?: WelfordState
      ccTimePerMin?: WelfordState
      deathsPerMin?: WelfordState
    }
  }
  items?: Record<string, Record<string, GameStats>>
  runes?: {
    primary?: Record<string, GameStats>
    secondary?: Record<string, GameStats>
    tertiary?: {
      offense?: Record<string, GameStats>
      flex?: Record<string, GameStats>
      defense?: Record<string, GameStats>
    }
    tree?: {
      primary?: Record<string, GameStats>
      secondary?: Record<string, GameStats>
    }
  }
  spells?: Record<string, GameStats>
  starting?: Record<string, GameStats>
  skills?: Record<string, GameStats>
  core?: Record<
    string,
    {
      games: number
      wins: number
      items?: Record<string, Record<string, GameStats>>
      runes?: {
        primary?: Record<string, GameStats>
        secondary?: Record<string, GameStats>
      }
      spells?: Record<string, GameStats>
      starting?: Record<string, GameStats>
    }
  >
}

// compute derived stats from Welford state
function computeWelfordStats(welford: WelfordState | undefined) {
  if (!welford || welford.n < 2) {
    return { mean: welford?.mean ?? 0, stdDev: 0, variance: 0, sampleSize: welford?.n ?? 0 }
  }
  return {
    mean: welford.mean,
    stdDev: getStdDev(welford),
    variance: getVariance(welford),
    sampleSize: welford.n,
  }
}

// sort and limit object entries by games
function topByGames<T extends GameStats>(
  obj: Record<string, T> | undefined,
  limit: number = 10
): Array<{ key: string; games: number; wins: number; winrate: number }> {
  if (!obj) return []
  return Object.entries(obj)
    .map(([key, val]) => ({
      key,
      games: val.games,
      wins: val.wins,
      winrate: val.games > 0 ? (val.wins / val.games) * 100 : 0,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, limit)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ championName: string }> }) {
  const { championName } = await params
  const { searchParams } = new URL(request.url)
  const requestedPatch = searchParams.get('patch')

  // convert URL name to API name
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)
  const apiName = getApiNameFromUrl(championName, championNames) || championName

  const supabase = createAdminClient()

  // if no patch specified, get latest available patches
  let targetPatch = requestedPatch
  if (!targetPatch) {
    const latestPatches = await getLatestPatches(3)
    targetPatch = latestPatches[0] // most recent patch
  }

  // fetch champion stats data
  const { data, error } = await supabase
    .from('champion_stats')
    .select('*')
    .eq('champion_name', apiName)
    .eq('patch', targetPatch)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    // list available patches for this champion
    const { data: availablePatches } = await supabase
      .from('champion_stats')
      .select('patch, games')
      .eq('champion_name', apiName)
      .order('patch', { ascending: false })

    return NextResponse.json(
      {
        error: 'No data found for this patch',
        championName,
        apiName,
        requestedPatch: targetPatch,
        availablePatches: availablePatches?.map(p => ({ patch: p.patch, games: p.games })) || [],
      },
      { status: 404 }
    )
  }

  const rawData = data.data as ChampionStatsData
  const championStats = rawData.championStats
  const welford = championStats?.welford

  // compute per-minute averages from sums
  const totalGames = rawData.games || 0
  const avgGameDuration =
    totalGames > 0 && championStats?.sumGameDuration
      ? championStats.sumGameDuration / totalGames / 60 // convert to minutes
      : 15 // fallback to 15 min average

  // computed averages (per game)
  const averages = {
    damageToChampions:
      totalGames > 0 && championStats?.sumDamageToChampions ? championStats.sumDamageToChampions / totalGames : 0,
    totalDamage: totalGames > 0 && championStats?.sumTotalDamage ? championStats.sumTotalDamage / totalGames : 0,
    healing: totalGames > 0 && championStats?.sumHealing ? championStats.sumHealing / totalGames : 0,
    shielding: totalGames > 0 && championStats?.sumShielding ? championStats.sumShielding / totalGames : 0,
    healingShielding:
      totalGames > 0 && championStats ? (championStats.sumHealing + championStats.sumShielding) / totalGames : 0,
    ccTime: totalGames > 0 && championStats?.sumCCTime ? championStats.sumCCTime / totalGames : 0,
    deaths: totalGames > 0 && championStats?.sumDeaths ? championStats.sumDeaths / totalGames : 0,
    gameDuration: avgGameDuration,
  }

  // computed per-minute stats with Welford statistics
  const perMinuteStats = {
    damageToChampionsPerMin: computeWelfordStats(welford?.damageToChampionsPerMin),
    totalDamagePerMin: computeWelfordStats(welford?.totalDamagePerMin),
    healingShieldingPerMin: computeWelfordStats(welford?.healingShieldingPerMin),
    ccTimePerMin: computeWelfordStats(welford?.ccTimePerMin),
    deathsPerMin: computeWelfordStats(welford?.deathsPerMin),
  }

  // build response
  const response = {
    championName,
    apiName,
    patch: targetPatch,
    lastUpdated: data.last_updated,

    // basic stats
    overview: {
      games: rawData.games,
      wins: rawData.wins,
      winrate: rawData.games > 0 ? (rawData.wins / rawData.games) * 100 : 0,
    },

    // computed averages per game
    averages,

    // per-minute stats with mean, stdDev, variance from Welford's algorithm
    perMinuteStats,

    // top builds sorted by games
    topItems: {
      slot1: topByGames(rawData.items?.['1'], 10),
      slot2: topByGames(rawData.items?.['2'], 10),
      slot3: topByGames(rawData.items?.['3'], 10),
      slot4: topByGames(rawData.items?.['4'], 10),
      slot5: topByGames(rawData.items?.['5'], 10),
      slot6: topByGames(rawData.items?.['6'], 10),
    },

    // top runes
    topRunes: {
      primary: topByGames(rawData.runes?.primary, 10),
      secondary: topByGames(rawData.runes?.secondary, 10),
      statPerks: {
        offense: topByGames(rawData.runes?.tertiary?.offense, 5),
        flex: topByGames(rawData.runes?.tertiary?.flex, 5),
        defense: topByGames(rawData.runes?.tertiary?.defense, 5),
      },
      trees: {
        primary: topByGames(rawData.runes?.tree?.primary, 5),
        secondary: topByGames(rawData.runes?.tree?.secondary, 5),
      },
    },

    // top summoner spells
    topSpells: topByGames(rawData.spells, 10),

    // top starting items
    topStarters: topByGames(rawData.starting, 15),

    // top skill orders
    topSkillOrders: topByGames(rawData.skills, 10),

    // top core item combinations (first 3 items)
    topCoreBuilds: Object.entries(rawData.core || {})
      .map(([key, val]) => ({
        itemCombo: key,
        items: key.split('_').map(id => parseInt(id)),
        games: val.games,
        wins: val.wins,
        winrate: val.games > 0 ? (val.wins / val.games) * 100 : 0,
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 10),

    // raw data for debugging/advanced use
    raw: {
      championStats: rawData.championStats,
      items: rawData.items,
      runes: rawData.runes,
      spells: rawData.spells,
      starting: rawData.starting,
      skills: rawData.skills,
      core: rawData.core,
    },
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': CACHE_CONTROL },
  })
}
