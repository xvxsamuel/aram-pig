// ddragon (data dragon) asset url helpers
import runesDataImport from '@/data/runes.json'

const runesDataObj = runesDataImport as Record<string, { icon?: string }>

// cache ddragon version with timestamp (cache for 1 hour)
let latestVersion: string | null = null
let versionFetchedAt: number = 0
const VERSION_CACHE_DURATION = 60 * 60 * 1000 // 1 hour in ms

// promise coalescing for version fetch
let versionFetchPromise: Promise<string> | null = null

// cache patches - only refreshed when ddragon version changes
let cachedPatches: string[] | null = null
let patchesVersion: string | null = null // Track which DDragon version the patches were fetched for

// convert ddragon version (15.x.y) to aram patch format (25.x)
function convertVersionToPatch(version: string): string {
  const parts = version.split('.')
  const major = parseInt(parts[0])
  const minor = parts[1]
  const convertedMajor = major + 10
  return `${convertedMajor}.${minor}`
}

export async function getLatestVersion(): Promise<string> {
  const now = Date.now()
  
  // return cached version if still valid
  if (latestVersion && (now - versionFetchedAt) < VERSION_CACHE_DURATION) {
    return latestVersion
  }

  // return existing promise if fetch is already in progress
  if (versionFetchPromise) {
    return versionFetchPromise
  }
  
  const previousVersion = latestVersion
  
  // create new fetch promise
  versionFetchPromise = (async () => {
    try {
      const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
        next: { revalidate: 3600 }, // next.js cache for 1 hour
      })
      const versions: string[] = await response.json()
      latestVersion = versions[0]
      versionFetchedAt = Date.now()
      
      // check if version changed - if so, refresh patches
      if (previousVersion && previousVersion !== latestVersion) {
        console.log(`[DDragon] Version changed: ${previousVersion} → ${latestVersion}`)
        // invalidate patch cache so it gets refreshed on next request
        cachedPatches = null
        patchesVersion = null
      } else if (!previousVersion) {
        console.log(`[DDragon] Version loaded: ${latestVersion}`)
      }
      
      // cache patches from the same api response (no extra fetch needed!)
      if (!cachedPatches || patchesVersion !== latestVersion) {
        cachedPatches = versions.slice(0, 3).map(convertVersionToPatch)
        patchesVersion = latestVersion
        console.log(`[DDragon] Patches cached: ${cachedPatches.join(', ')}`)
      }
      
      return latestVersion!
    } catch (error) {
      console.error('[DDragon] Failed to fetch version:', error)
      // return cached version if available, otherwise use fallback
      if (!latestVersion) {
        latestVersion = '15.24.1' // fallback version
      }
      return latestVersion!
    } finally {
      versionFetchPromise = null
    }
  })()

  return versionFetchPromise
}

// get latest patches (aram format: 25.x)
// only fetches from api if version changed or cache is empty
export async function getLatestPatches(count: number = 3): Promise<string[]> {
  // Ensure version is loaded (this also caches patches)
  await getLatestVersion()
  
  if (cachedPatches) {
    return cachedPatches.slice(0, count)
  }
  
  return []
}

export async function preloadDDragonVersion(): Promise<void> {
  await getLatestVersion()
}

// normalize champion names for ddragon urls
function normalizeChampionName(championName: string): string {
  const nameMap: Record<string, string> = {
    FiddleSticks: 'Fiddlesticks',
    MonkeyKing: 'MonkeyKing',
    Renata: 'Renata',
  }
  return nameMap[championName] || championName
}

export function getChampionImageUrl(championName: string, version: string): string {
  const normalizedName = normalizeChampionName(championName)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${normalizedName}.png`
}

export function getChampionCenteredUrl(championName: string, skinNum: number = 0): string {
  const normalizedName = normalizeChampionName(championName)
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${normalizedName}_${skinNum}.jpg`
}

export function getProfileIconUrl(iconId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`
}

export function getSummonerSpellUrl(spellId: number, version: string): string {
  const spellName = getSpellName(spellId)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/Summoner${spellName}.png`
}

export function getItemImageUrl(itemId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`
}

// maps riot api spell ids to ddragon file names
function getSpellName(spellId: number): string {
  const spellMap: Record<number, string> = {
    1: 'Boost', // cleanse
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste', // ghost
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Mana', // clarity
    14: 'Dot', // ignite
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Snowball', // mark
    39: 'Snowball', // mark recast
  }
  return spellMap[spellId] || 'Flash'
}

export function getRuneImageUrl(perkId: number): string {
  const rune = runesDataObj[perkId]
  if (!rune || !rune.icon) {
    return ''
  }
  return `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`
}

export function getRuneStyleImageUrl(styleId: number): string {
  const style = runesDataObj[styleId]
  if (!style || !style.icon) {
    return ''
  }
  return `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}`
}
