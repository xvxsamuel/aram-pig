// champion name utilities - fetching and converting
import { DDRAGON_CDN } from './constants'

interface ChampionData {
  id: string
  name: string
  key: string
}

interface ChampionList {
  data: Record<string, ChampionData>
}

let championDataCache: Record<string, string> | null = null

export async function fetchChampionNames(version: string): Promise<Record<string, string>> {
  if (championDataCache) {
    return championDataCache
  }
  try {
    const response = await fetch(`${DDRAGON_CDN}/${version}/data/en_US/champion.json`, {
      next: { revalidate: 86400 },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch champion data: ${response.status}`)
    }

    const data: ChampionList = await response.json()

    championDataCache = Object.fromEntries(
      Object.entries(data.data).map(([_key, champion]) => [champion.id, champion.name])
    )

    return championDataCache
  } catch (error) {
    console.error('Error fetching champion names:', error)
    return {}
  }
}

export function getChampionDisplayName(apiName: string, championNames: Record<string, string>): string {
  if (championNames[apiName]) return championNames[apiName]

  // case-insensitive fallback
  const lowerApiName = apiName.toLowerCase()
  const foundKey = Object.keys(championNames).find(k => k.toLowerCase() === lowerApiName)
  if (foundKey) return championNames[foundKey]

  return apiName
}

export function getChampionUrlName(apiName: string, championNames: Record<string, string>): string {
  const displayName = championNames[apiName] || apiName
  return displayName.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getApiNameFromUrl(urlName: string, championNames: Record<string, string>): string | null {
  const urlNormalized = urlName.toLowerCase().replace(/[^a-z0-9]/g, '')

  // first, try to match against display names
  for (const [api, display] of Object.entries(championNames)) {
    if (display.toLowerCase().replace(/[^a-z0-9]/g, '') === urlNormalized) {
      return api
    }
  }

  // if not found, try matching API names directly
  for (const api of Object.keys(championNames)) {
    if (api.toLowerCase() === urlNormalized) {
      return api
    }
  }

  return null
}

export function getSortedChampionNames(championNames: Record<string, string>): string[] {
  return Object.keys(championNames).sort((a, b) => {
    const displayA = championNames[a] || a
    const displayB = championNames[b] || b
    return displayA.localeCompare(displayB)
  })
}
