// startup tasks - intentionally minimal for serverless
// DO NOT delete jobs here - Vercel spawns new instances frequently
// and each instance would delete legitimate running jobs

let isInitialized = false

// initialize automated tasks
export function initializeCleanup() {
  if (isInitialized) {
    return
  }
  
  isInitialized = true
  // no cleanup needed - jobs are managed by their own timeout logic
  // old/stuck jobs should be cleaned via a scheduled cron if needed
}
