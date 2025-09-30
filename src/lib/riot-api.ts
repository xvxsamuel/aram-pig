import { LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL, type PlatformCode, type RegionalCluster } from "./regions"

const RIOT_API_KEY = process.env.RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.warn("RIOT_API_KEY is not set in environment variables")
}

// Regional routing values for Riot API
const REGIONAL_ENDPOINTS: Record<RegionalCluster, string> = {
  americas: "americas.api.riotgames.com",
  europe: "europe.api.riotgames.com",
  asia: "asia.api.riotgames.com",
  sea: "sea.api.riotgames.com",
}

// Platform routing values
function getPlatformEndpoint(platform: PlatformCode): string {
  return `${platform}.api.riotgames.com`
}

// Account API - Get account by Riot ID (name + tagline)
export async function getAccountByRiotId(gameName: string, tagLine: string, region: RegionalCluster) {
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

// Summoner API - Get summoner by PUUID
export async function getSummonerByPuuid(puuid: string, platform: PlatformCode) {
  const endpoint = getPlatformEndpoint(platform)
  const url = `https://${endpoint}/lol/summoner/v4/summoners/by-puuid/${puuid}`
  
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY!,
    },
    next: { revalidate: 3600 }, // Cache for 1 hour
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

// Match API - Get match IDs by PUUID
export async function getMatchIdsByPuuid(
  puuid: string,
  region: RegionalCluster,
  queue: number = 450, // 450 = ARAM
  count: number = 20
) {
  const endpoint = REGIONAL_ENDPOINTS[region]
  const url = `https://${endpoint}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&count=${count}`
  
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY!,
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  })

  if (!response.ok) {
    throw new Error(`Riot API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<string[]>
}

// Helper function to get summoner data by Riot ID
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
