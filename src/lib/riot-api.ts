import { RiotAPI, RiotAPITypes, PlatformId, DDragon } from "@fightmegg/riot-api"
import { PLATFORM_TO_REGIONAL, type PlatformCode, type RegionalCluster } from "./regions"
import { waitForRateLimit, type RequestType } from "./rate-limiter"

const RIOT_API_KEY = process.env.RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.error("RIOT_API_KEY is not set in environment variables") // in case my key expires
}

const rAPI = new RiotAPI(RIOT_API_KEY!)
const ddragon = new DDragon()

// version
let latestVersion: string | null = null

async function getLatestVersion(): Promise<string> {
  if (!latestVersion) {
    latestVersion = await rAPI.ddragon.versions.latest()
  }
  return latestVersion
}

const REGIONAL_TO_PLATFORM_ID: Record<RegionalCluster, string> = {
  americas: 'americas',
  europe: 'europe',
  asia: 'asia',
  sea: 'sea',
}

const PLATFORM_CODE_TO_PLATFORM_ID: Record<PlatformCode, string> = {
  na1: 'na1',
  euw1: 'euw1',
  eun1: 'eun1',
  kr: 'kr',
  br1: 'br1',
  la1: 'la1',
  la2: 'la2',
  oc1: 'oc1',
  ru: 'ru',
  tr1: 'tr1',
  jp1: 'jp1',
  sg2: 'sg2',
  tw2: 'tw2',
  vn2: 'vn2',
  me1: 'me1',
}

// helper to retry api calls if job id conflicts
// don't retry on 404s (account not found)
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      // don't retry on 404s - account doesn't exist
      if (error?.response?.status === 404) {
        throw error
      }
      
      const isJobConflict = error?.message?.includes('A job with the same id already exists')
      const isLastAttempt = attempt === maxRetries - 1
      
      if (isJobConflict && !isLastAttempt) {
        // wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        continue
      }
      
      throw error
    }
  }
  
  throw new Error('max retries reached')
}

export async function getAccountByRiotId(
  gameName: string, 
  tagLine: string, 
  region: RegionalCluster,
  requestType: RequestType = 'overhead'
) {
  await waitForRateLimit(region, requestType);
  
  try {
    const account = await retryWithDelay(() => 
      rAPI.account.getByRiotId({
        region: REGIONAL_TO_PLATFORM_ID[region] as any,
        gameName,
        tagLine,
      })
    )
    return account
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null
    }
    throw error
  }
}

export async function getSummonerByPuuid(
  puuid: string, 
  platform: PlatformCode,
  requestType: RequestType = 'overhead'
) {
  const region = PLATFORM_TO_REGIONAL[platform];
  await waitForRateLimit(region, requestType);
  
  try {
    const summoner = await retryWithDelay(() =>
      rAPI.summoner.getByPUUID({
        region: PLATFORM_CODE_TO_PLATFORM_ID[platform] as any,
        puuid,
      })
    )
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
  count: number = 20,
  start: number = 0,
  requestType: RequestType = 'priority'
) {
  await waitForRateLimit(region, requestType);
  
  const limitedCount = Math.min(count, 100)
  const matchIds = await retryWithDelay(() =>
    rAPI.matchV5.getIdsByPuuid({
      cluster: REGIONAL_TO_PLATFORM_ID[region] as any,
      puuid,
      params: {
        queue,
        count: limitedCount,
        start,
      },
    })
  )
  return matchIds
}

export async function getMatchById(matchId: string, region: RegionalCluster, requestType: RequestType = 'priority') {
  await waitForRateLimit(region, requestType);
  
  const match = await retryWithDelay(() =>
    rAPI.matchV5.getMatchById({
      cluster: REGIONAL_TO_PLATFORM_ID[region] as any,
      matchId,
    })
  )
  return match as unknown as MatchData
}

// fetch match timeline for item purchase order
export async function getMatchTimeline(matchId: string, region: RegionalCluster, requestType: RequestType = 'priority') {
  await waitForRateLimit(region, requestType);
  
  const timeline = await retryWithDelay(() =>
    rAPI.matchV5.getMatchTimelineById({
      cluster: REGIONAL_TO_PLATFORM_ID[region] as any,
      matchId,
    })
  )
  return timeline as unknown as MatchTimeline
}

export interface MatchTimeline {
  metadata: {
    matchId: string
    participants: string[]
  }
  info: {
    frames: TimelineFrame[]
    frameInterval: number
  }
}

export interface TimelineFrame {
  timestamp: number
  participantFrames: Record<string, any>
  events: TimelineEvent[]
}

export interface TimelineEvent {
  type: string
  timestamp: number
  participantId?: number
  itemId?: number
  // other event fields...
}

import { isCompletedItem } from './tooltip-data'

// extract first 3 item purchases from timeline
export function extractItemPurchases(timeline: MatchTimeline, participantId: number): number[] {
  const purchases: number[] = []
  
  for (const frame of timeline.info.frames) {
    for (const event of frame.events) {
      if (event.type === 'ITEM_PURCHASED' && 
          event.participantId === participantId && 
          event.itemId && 
          isCompletedItem(event.itemId)) {
        
        purchases.push(event.itemId)
        
        // only need first 3 completed items
        if (purchases.length >= 3) {
          return purchases
        }
      }
    }
  }
  
  return purchases
}

export interface MatchData {
  metadata: {
    matchId: string
    participants: string[] // array of PUUIDs not summoner names
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
  gameEndedInEarlySurrender: boolean
  kills: number
  deaths: number
  assists: number
  champLevel: number
  totalDamageDealtToChampions: number
  totalTimeSpentDead?: number
  goldEarned: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  summoner1Id: number
  summoner2Id: number
  doubleKills?: number
  tripleKills?: number
  quadraKills?: number
  pentaKills?: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  pigScore?: number
  firstItem?: number
  secondItem?: number
  thirdItem?: number
  perks?: {
    styles: Array<{
      style: number
      selections: Array<{
        perk: number
      }>
    }>
    statPerks: {
      offense: number
      flex: number
      defense: number
    }
  }
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

// ddragon helpers - normalize champion names for ddragon urls
function normalizeChampionName(championName: string): string {
  const nameMap: Record<string, string> = {
    'FiddleSticks': 'Fiddlesticks',
    'MonkeyKing': 'MonkeyKing',
    'Renata': 'Renata',
  }
  return nameMap[championName] || championName
}

// async versions for server components
export async function getChampionCenteredUrl(championName: string, skinNum: number = 0): Promise<string> {
  const normalizedName = normalizeChampionName(championName)
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${normalizedName}_${skinNum}.jpg`
}

export async function getProfileIconUrl(iconId: number): Promise<string> {
  const version = await getLatestVersion()
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`
}

export { ddragon, getLatestVersion }
