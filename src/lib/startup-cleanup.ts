import { createAdminClient } from './supabase'

let isInitialized = false

// cleanup all jobs on server startup - jobs can't survive server restarts
// users will just click Update again to find any missing matches
async function cleanupAllJobs() {
  console.log('[Startup] Clearing all jobs from previous server instance...')
  
  try {
    const supabase = createAdminClient()
    
    // delete all jobs - they can't be resumed after server restart
    const { data, error } = await supabase
      .from('update_jobs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // delete all (neq with impossible id)
      .select('id')
    
    if (error) {
      console.error('[Startup] Error clearing jobs:', error)
    } else {
      console.log(`[Startup] Deleted ${data?.length || 0} jobs`)
    }
  } catch (error) {
    console.error('[Startup] Error in cleanupAllJobs:', error)
  }
}

// initialize automated tasks
export function initializeCleanup() {
  if (isInitialized) {
    console.log('[Startup] Already initialized')
    return
  }
  
  isInitialized = true
  console.log('[Startup] Initializing automated tasks...')
  
  cleanupAllJobs()

  console.log('[Startup] Initialization complete')
}
