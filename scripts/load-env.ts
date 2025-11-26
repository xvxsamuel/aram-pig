// This file must be imported first to load environment variables
import { config } from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Only load .env.local if it exists (not in CI where env vars are pre-set)
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  config({ path: envPath })
  console.log('Environment variables loaded from .env.local')
} else if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.log('Running in CI, using pre-set environment variables')
} else {
  console.warn('⚠ No .env.local found and not in CI - env vars may be missing')
}

if (!process.env.RIOT_API_KEY) {
  console.error('RIOT_API_KEY not found')
  process.exit(1)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Supabase environment variables not found')
  process.exit(1)
}

export {}
