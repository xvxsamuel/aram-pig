import { createAdminClient } from './supabase'

let isInitialized = false
// cleanup orphaned jobs on server startup
async function cleanupOrphanedJobs() {
  console.log('Cleaning up orphaned jobs from previous server instance...')
  
  try {
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('update_jobs')
      .update({
        status: 'failed',
        error_message: 'Server restarted - job cancelled',
        completed_at: new Date().toISOString()
      })
      .in('status', ['pending', 'processing'])
      .select('id')
    
    if (error) {
      console.error('Error cleaning up orphaned jobs:', error)
    } else {
      console.log(`Marked ${data?.length || 0} orphaned jobs as failed`)
    }
  } catch (error) {
    console.error('Error in cleanupOrphanedJobs:', error)
  }
}

// initialize automated tasks
export function initializeCleanup() {
  if (isInitialized) {
    console.log('Already initialized')
    return
  }
  
  isInitialized = true
  console.log('Initializing automated tasks...')
  
  cleanupOrphanedJobs()
  
  console.log('Initialization complete')
}
