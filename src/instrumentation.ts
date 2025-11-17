import { initializeCleanup } from './lib/startup-cleanup'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    initializeCleanup()
  }
}
