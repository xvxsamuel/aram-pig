import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, type PlatformCode, type RegionalCluster } from "./regions"
import { rateLimiter } from "./rate-limiter"

const RIOT_API_KEY = process.env.RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.error("❌ RIOT_API_KEY is not set in environment variables!")
  console.error("Create a .env.local file with: RIOT_API_KEY=your_key_here")
}

const REGIONAL_ENDPOINTS: Record<RegionalCluster, string> = {
  americas: "americas.api.riotgames.com",
  europe: "europe.api.riotgames.com",
  asia: "asia.api.riotgames.com",
  sea: "sea.api.riotgames.com",
}

function getPlatformEndpoint(platform: PlatformCode): string {
  return `${platform}.api.riotgames.com`
}

export async function getAccountByRiotId(gameName: string, tagLine: string, region: RegionalCluster) {
  await rateLimiter.waitForSlot();
  
  const endpoint = REGIONAL_ENDPOINTS[region]
  const url = `https://${endpoint}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY!,
    },
    next: { revalidate: 3600 }, // Cache for 1 hour
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null // Account not found
    }
    throw new Error(`Riot API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<{
    puuid: string
    gameName: string
    tagLine: string
  }>
}

export async function getSummonerByPuuid(puuid: string, platform: PlatformCode) {
  await rateLimiter.waitForSlot();
  
  const endpoint = getPlatformEndpoint(platform)
  const url = `https://${endpoint}/lol/summoner/v4/summoners/by-puuid/${puuid}`
  
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY!,
    },
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    throw new Error(`Riot API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<{
    id: string
    accountId: string
    puuid: string
    profileIconId: number
    revisionDate: number
    summonerLevel: number
  }>
}

export async function getMatchIdsByPuuid(
  puuid: string,
  region: RegionalCluster,
  queue: number = 450,
  count: number = 20
) {
  await rateLimiter.waitForSlot();
  
  const limitedCount = Math.min(count, 100)
  const endpoint = REGIONAL_ENDPOINTS[region]
  const url = `https://${endpoint}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&count=${limitedCount}`
  
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY!,
    },
    next: { revalidate: 300 },
  })

  if (!response.ok) {
    throw new Error(`Riot API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<string[]>
}

export async function getMatchById(matchId: string, region: RegionalCluster) {
  await rateLimiter.waitForSlot();
  
  const endpoint = REGIONAL_ENDPOINTS[region]
  const url = `https://${endpoint}/lol/match/v5/matches/${matchId}`
  
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY!,
    },
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    throw new Error(`Riot API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<MatchData>
}

export interface MatchData {
  metadata: {
    matchId: string
    participants: string[] // Array of PUUIDs
  }
  info: {
    gameCreation: number
    gameDuration: number
    gameEndTimestamp: number
    gameMode: string
    queueId: number
    participants: ParticipantData[]
  }
}

export interface ParticipantData {
  puuid: string
  summonerName: string
  riotIdGameName: string
  riotIdTagline: string
  championName: string
  championId: number
  teamId: number
  win: boolean
  kills: number
  deaths: number
  assists: number
  champLevel: number
  totalDamageDealtToChampions: number
  goldEarned: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  summoner1Id: number
  summoner2Id: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
}

export async function getSummonerByRiotId(
  gameName: string,
  tagLine: string,
  platform: PlatformCode
) {
  const regional = PLATFORM_TO_REGIONAL[platform]
  
  const account = await getAccountByRiotId(gameName, tagLine, regional)
  if (!account) {
    return null
  }

  const summoner = await getSummonerByPuuid(account.puuid, platform)
  if (!summoner) {
    return null
  }

  return {
    account,
    summoner,
    regional,
  }
}
