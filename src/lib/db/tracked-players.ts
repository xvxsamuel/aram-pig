// Tracked players cache - avoid repeated DB queries
import { createAdminClient } from './supabase'

let trackedPuuidsCache: Set<string> | null = null
let trackedPuuidsCacheExpiry = 0
const TRACKED_PUUIDS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getTrackedPuuids(): Promise<Set<string>> {
  const now = Date.now()
  
  if (trackedPuuidsCache && now < trackedPuuidsCacheExpiry) {
    return trackedPuuidsCache
  }
  
  const supabase = createAdminClient()
  const { data: trackedPlayers } = await supabase
    .from('summoners')
    .select('puuid')
  
  trackedPuuidsCache = new Set(trackedPlayers?.map(p => p.puuid) || [])
  trackedPuuidsCacheExpiry = now + TRACKED_PUUIDS_CACHE_TTL
  
  return trackedPuuidsCache
}

export function invalidateTrackedPuuidsCache(): void {
  trackedPuuidsCache = null
  trackedPuuidsCacheExpiry = 0
}
