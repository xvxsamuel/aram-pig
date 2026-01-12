// patch version utilities
// handles patch version conversion and fetching from riot's ddragon api
import { getLatestPatches as getDDragonPatches } from '@/lib/ddragon/assets'

// number of patches to keep detailed stats for
export const PATCHES_TO_KEEP = 3

// patches to hide from UI (insufficient data)
export const HIDDEN_PATCHES = ['25.22', '25.23', '26.1']

// fetches the latest patch versions from cached ddragon data
// uses shared cache - only fetches from api when ddragon version changes
// returns patches in aram pig format (25.x)
export async function getLatestPatches(count: number = PATCHES_TO_KEEP): Promise<string[]> {
  return getDDragonPatches(count)
}

// check if a patch is in the accepted list (latest patches)
export async function isPatchAccepted(patch: string): Promise<boolean> {
  const latestPatches = await getLatestPatches(PATCHES_TO_KEEP)
  return latestPatches.includes(patch)
}

// riot api gameVersion string returns version 15.x for s15, but actual patch names are 25.x

export function extractPatch(gameVersion: string): string {
  if (!gameVersion) return 'unknown'
  const parts = gameVersion.split('.')
  const apiPatch = parts.slice(0, 2).join('.')

  if (apiPatch.startsWith('15.')) {
    return '25.' + apiPatch.split('.')[1]
  }

  return apiPatch
}

// patch schedule for fallback date-based detection
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
