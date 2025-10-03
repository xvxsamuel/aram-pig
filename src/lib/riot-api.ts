import { RiotAPI, RiotAPITypes, PlatformId } from "@fightmegg/riot-api"
import { PLATFORM_TO_REGIONAL, type PlatformCode, type RegionalCluster } from "./regions"

const RIOT_API_KEY = process.env.RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.error("RIOT_API_KEY is not set in environment variables")
}

// Initialize Riot API client with automatic rate limiting
const rAPI = new RiotAPI(RIOT_API_KEY!)

// Map our regional clusters to library's PlatformId
const REGIONAL_TO_PLATFORM_ID: Record<RegionalCluster, PlatformId> = {
  americas: PlatformId.AMERICAS,
  europe: PlatformId.EUROPE,
  asia: PlatformId.ASIA,
  sea: PlatformId.SEA,
}

const PLATFORM_CODE_TO_PLATFORM_ID: Record<PlatformCode, PlatformId> = {
  na1: PlatformId.NA1,
  euw1: PlatformId.EUW1,
  eun1: PlatformId.EUNE1,
  kr: PlatformId.KR,
  br1: PlatformId.BR1,
  la1: PlatformId.LA1,
  la2: PlatformId.LA2,
  oc1: PlatformId.OC1,
  ru: PlatformId.RU,
  tr1: PlatformId.TR1,
  jp1: PlatformId.JP1,
  sg2: PlatformId.SG2,
  tw2: PlatformId.TW2,
  vn2: PlatformId.VN2,
  me1: PlatformId.ME1,
}

export async function getAccountByRiotId(gameName: string, tagLine: string, region: RegionalCluster) {
  try {
    const account = await rAPI.account.getByRiotId({
      region: REGIONAL_TO_PLATFORM_ID[region] as any,
      gameName,
      tagLine,
    })
    return account
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null
    }
    throw error
  }
}

export async function getSummonerByPuuid(puuid: string, platform: PlatformCode) {
  try {
    const summoner = await rAPI.summoner.getByPUUID({
      region: PLATFORM_CODE_TO_PLATFORM_ID[platform] as any,
      puuid,
    })
    return summoner
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null
    }
    throw error
  }
}

export async function getMatchIdsByPuuid(
  puuid: string,
  region: RegionalCluster,
  queue: number = 450,
  count: number = 20
) {
  const limitedCount = Math.min(count, 100)
  const matchIds = await rAPI.matchV5.getIdsByPuuid({
    cluster: REGIONAL_TO_PLATFORM_ID[region] as any,
    puuid,
    params: {
      queue,
      count: limitedCount,
    },
  })
  return matchIds
}

export async function getMatchById(matchId: string, region: RegionalCluster) {
  const match = await rAPI.matchV5.getMatchById({
    cluster: REGIONAL_TO_PLATFORM_ID[region] as any,
    matchId,
  })
  return match as unknown as MatchData
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
