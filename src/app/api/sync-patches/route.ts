// API route to sync accepted patches from DDragon to database
// Called when DDragon version changes or manually to refresh

import { NextResponse } from 'next/server'
import { getLatestPatches } from '@/lib/game'
import { syncAcceptedPatches } from '@/lib/db/app-config'

export async function POST(request: Request) {
  try {
    // verify cron secret for scheduled calls
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // get latest patches from DDragon
    const patches = await getLatestPatches(3)
    
    if (patches.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch patches from DDragon' }, { status: 500 })
    }
    
    // sync to database
    const success = await syncAcceptedPatches(patches)
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to sync patches to database' }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      patches,
      message: `Synced ${patches.length} patches to database`
    })
  } catch (error) {
    console.error('[sync-patches] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// also allow GET for easy testing
export async function GET(request: Request) {
  return POST(request)
}
