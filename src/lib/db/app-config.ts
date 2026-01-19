// app config database operations
// stores and retrieves application configuration like accepted patches

import { createAdminClient } from './supabase'

// sync accepted patches to database
// should be called when DDragon version changes to keep DB in sync with server
export async function syncAcceptedPatches(patches: string[]): Promise<boolean> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from('app_config')
    .upsert({
      key: 'accepted_patches',
      value: patches,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'key',
    })
  
  if (error) {
    console.error('[AppConfig] Failed to sync accepted patches:', error)
    return false
  }
  
  console.log(`[AppConfig] Synced accepted patches: ${patches.join(', ')}`)
  return true
}

// get accepted patches from database
export async function getAcceptedPatches(): Promise<string[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'accepted_patches')
    .single()
  
  if (error || !data) {
    console.error('[AppConfig] Failed to get accepted patches:', error)
    return []
  }
  
  return data.value as string[]
}
