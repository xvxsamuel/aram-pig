// Patch version utilities
// Handles patch version conversion and fetching from Riot's DDragon API

// Number of patches to keep detailed stats for
export const PATCHES_TO_KEEP = 3

/**
 * Fetches the latest patch versions from Riot's Data Dragon API
 * Converts API patch format (15.x.x) to ARAM PIG format (25.x)
 */
export async function getLatestPatches(count: number = PATCHES_TO_KEEP): Promise<string[]> {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch versions: ${response.status}`)
    }

    const versions: string[] = await response.json()

    const patches = versions.slice(0, count).map(version => {
      const parts = version.split('.')
      const major = parseInt(parts[0])
      const minor = parts[1]
      const convertedMajor = major + 10
      return `${convertedMajor}.${minor}`
    })

    return patches
  } catch (error) {
    console.error('Failed to fetch latest patches:', error)
    return ['25.23', '25.22', '25.21'].slice(0, count)
  }
}

/**
 * Check if a patch is in the accepted list (latest patches)
 */
export async function isPatchAccepted(patch: string): Promise<boolean> {
  const latestPatches = await getLatestPatches(PATCHES_TO_KEEP)
  return latestPatches.includes(patch)
}

/**
 * Extract patch version from Riot API gameVersion string
 * Riot API returns version 15.x for 2025, but actual patch names are 25.x
 */
export function extractPatch(gameVersion: string): string {
  if (!gameVersion) return 'unknown'
  const parts = gameVersion.split('.')
  const apiPatch = parts.slice(0, 2).join('.')

  if (apiPatch.startsWith('15.')) {
    return '25.' + apiPatch.split('.')[1]
  }

  return apiPatch
}

// Patch schedule for fallback date-based detection
export const patchSchedule = [
  { patch: '25.1', start: new Date('2025-01-09').getTime() },
  { patch: '25.2', start: new Date('2025-01-23').getTime() },
  { patch: '25.3', start: new Date('2025-02-05').getTime() },
  { patch: '25.4', start: new Date('2025-02-20').getTime() },
  { patch: '25.5', start: new Date('2025-03-05').getTime() },
  { patch: '25.6', start: new Date('2025-03-19').getTime() },
  { patch: '25.7', start: new Date('2025-04-02').getTime() },
  { patch: '25.8', start: new Date('2025-04-16').getTime() },
  { patch: '25.9', start: new Date('2025-04-30').getTime() },
  { patch: '25.10', start: new Date('2025-05-14').getTime() },
  { patch: '25.11', start: new Date('2025-05-29').getTime() },
  { patch: '25.12', start: new Date('2025-06-11').getTime() },
  { patch: '25.13', start: new Date('2025-06-25').getTime() },
  { patch: '25.14', start: new Date('2025-07-16').getTime() },
  { patch: '25.15', start: new Date('2025-07-30').getTime() },
  { patch: '25.16', start: new Date('2025-08-13').getTime() },
  { patch: '25.17', start: new Date('2025-08-27').getTime() },
  { patch: '25.18', start: new Date('2025-09-10').getTime() },
  { patch: '25.19', start: new Date('2025-09-24').getTime() },
  { patch: '25.20', start: new Date('2025-10-08').getTime() },
  { patch: '25.21', start: new Date('2025-10-22').getTime() },
  { patch: '25.22', start: new Date('2025-11-05').getTime() },
  { patch: '25.23', start: new Date('2025-11-19').getTime() },
  { patch: '25.24', start: new Date('2025-12-03').getTime() },
]

export function getPatchFromDate(gameCreationMs: number): string {
  for (let i = patchSchedule.length - 1; i >= 0; i--) {
    if (gameCreationMs >= patchSchedule[i].start) {
      return patchSchedule[i].patch
    }
  }
  return 'unknown'
}

export function getDateRangeForDays(days: 7 | 30 | 60): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { start, end }
}
