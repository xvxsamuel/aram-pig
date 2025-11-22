import { initializeCleanup } from './lib/startup-cleanup'
import { preloadDDragonVersion } from './lib/ddragon-client'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    initializeCleanup()
    preloadDDragonVersion().catch(err => {
      console.error('Failed to preload DDragon version:', err)
    })
  }
}
