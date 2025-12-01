// Riot API client wrapper (server-only)
import { RiotAPI, DDragon } from '@fightmegg/riot-api'
import { PLATFORM_TO_REGIONAL, type PlatformCode, type RegionalCluster } from '@/lib/game'
import { waitForRateLimit, type RequestType } from './rate-limiter'
import { getLatestVersion } from '@/lib/ddragon'
import type { MatchData, MatchTimeline } from '@/types/match'

const RIOT_API_KEY = process.env.RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.error('RIOT_API_KEY is not set in environment variables')
}

const rAPI = new RiotAPI(RIOT_API_KEY!)
const ddragon = new DDragon()

// account-v1 endpoints
const REGIONAL_TO_PLATFORM_ID: Record<RegionalCluster, string> = {
  americas: 'americas',
  europe: 'europe',
  asia: 'asia',
  sea: 'europe',
}

// match-v5 endpoints
const REGIONAL_TO_MATCH_ROUTING: Record<RegionalCluster, string> = {
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
async function retryWithDelay<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; message?: string }
      // don't retry on 404s - account doesn't exist
      if (err?.response?.status === 404) {
        throw error
      }

      const isJobConflict = err?.message?.includes('A job with the same ID already exists')
      const isLastAttempt = attempt === maxRetries - 1

      if (isJobConflict && !isLastAttempt) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        continue
      }

      throw error
    }
  }

  throw new Error('Max retries reached')
}

export async function getAccountByRiotId(
  gameName: string,
  tagLine: string,
  region: RegionalCluster,
  requestType: RequestType = 'overhead'
) {
  await waitForRateLimit(region, requestType)

  try {
    const account = await retryWithDelay(() =>
      rAPI.account.getByRiotId({
        region: REGIONAL_TO_PLATFORM_ID[region] as Parameters<typeof rAPI.account.getByRiotId>[0]['region'],
        gameName,
        tagLine,
      })
    )
    return account
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } }
    if (err?.response?.status === 404) {
      return null
    }
    throw error
  }
}

export async function getSummonerByPuuid(puuid: string, platform: PlatformCode, requestType: RequestType = 'overhead') {
  await waitForRateLimit(platform, requestType)

  try {
    const summoner = await retryWithDelay(() =>
      rAPI.summoner.getByPUUID({
        region: PLATFORM_CODE_TO_PLATFORM_ID[platform] as Parameters<typeof rAPI.summoner.getByPUUID>[0]['region'],
        puuid,
      })
    )
    return summoner
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } }
    if (err?.response?.status === 404) {
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
  requestType: RequestType = 'batch',
  startTime?: number,
  endTime?: number
) {
  await waitForRateLimit(region, requestType)

  const limitedCount = Math.min(count, 100)
  const params: Record<string, number> = {
    queue,
    count: limitedCount,
  }

  if (start > 0) params.start = start
  if (startTime) params.startTime = startTime
  if (endTime) params.endTime = endTime

  const matchIds = await retryWithDelay(() =>
    rAPI.matchV5.getIdsByPuuid({
      cluster: REGIONAL_TO_MATCH_ROUTING[region] as Parameters<typeof rAPI.matchV5.getIdsByPuuid>[0]['cluster'],
      puuid,
      params,
    })
  )
  return matchIds
}

export async function getMatchById(matchId: string, region: RegionalCluster, requestType: RequestType = 'batch') {
  await waitForRateLimit(region, requestType)

  const match = await retryWithDelay(() =>
    rAPI.matchV5.getMatchById({
      cluster: REGIONAL_TO_MATCH_ROUTING[region] as Parameters<typeof rAPI.matchV5.getMatchById>[0]['cluster'],
      matchId,
    })
  )
  return match as unknown as MatchData
}

export async function getMatchTimeline(matchId: string, region: RegionalCluster, requestType: RequestType = 'batch') {
  await waitForRateLimit(region, requestType)

  const timeline = await retryWithDelay(() =>
    rAPI.matchV5.getMatchTimelineById({
      cluster: REGIONAL_TO_MATCH_ROUTING[region] as Parameters<typeof rAPI.matchV5.getMatchTimelineById>[0]['cluster'],
      matchId,
    })
  )
  return timeline as unknown as MatchTimeline
}

// internal version that doesn't wait for rate limit (already waited at match level)
export async function getMatchTimelineNoWait(matchId: string, region: RegionalCluster) {
  const timeline = await retryWithDelay(() =>
    rAPI.matchV5.getMatchTimelineById({
      cluster: REGIONAL_TO_MATCH_ROUTING[region] as Parameters<typeof rAPI.matchV5.getMatchTimelineById>[0]['cluster'],
      matchId,
    })
  )
  return timeline as unknown as MatchTimeline
}

export async function getSummonerByRiotId(gameName: string, tagLine: string, platform: PlatformCode) {
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

// async versions for server components
export async function getProfileIconUrl(iconId: number): Promise<string> {
  const version = await getLatestVersion()
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`
}

export { ddragon }
