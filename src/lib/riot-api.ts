import { RiotAPI, RiotAPITypes, PlatformId, DDragon } from "@fightmegg/riot-api"
import { PLATFORM_TO_REGIONAL, type PlatformCode, type RegionalCluster } from "./regions"

const RIOT_API_KEY = process.env.RIOT_API_KEY

if (!RIOT_API_KEY) {
  console.error("RIOT_API_KEY is not set in environment variables") // dev logging
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

// ddragon
export async function getChampionImageUrl(championName: string): Promise<string> {
  const version = await getLatestVersion()
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`
}

export async function getChampionCenteredUrl(championName: string, skinNum: number = 0): Promise<string> {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${championName}_${skinNum}.jpg`
}

export async function getProfileIconUrl(iconId: number): Promise<string> {
  const version = await getLatestVersion()
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`
}

export async function getSummonerSpellUrl(spellId: number): Promise<string> {
  const version = await getLatestVersion()
  const spellName = getSpellName(spellId)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/Summoner${spellName}.png`
}

export async function getItemImageUrl(itemId: number): Promise<string> {
  const version = await getLatestVersion()
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`
}

// spells
const SUMMONER_SPELL_MAP: Record<number, string> = {
}

// summoner spells
function getSpellName(spellId: number): string {
  const spellMap: Record<number, string> = {
    1: 'Boost',    // cleanse
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste',    // ghost
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Clarity',
    14: 'Ignite',
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Mark',    // snowball
    39: 'Mark',    
  }
  return spellMap[spellId] || 'Flash'
}

export { ddragon, getLatestVersion }
