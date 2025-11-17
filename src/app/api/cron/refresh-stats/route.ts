import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

// refresh materialized views for champion stats
// run this via cron every 15-30 minutes or after scraping new matches
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const startTime = Date.now()

    console.log('Starting materialized view refresh...')

    // refresh patch-based stats view
    const { error: patchError } = await supabase.rpc('refresh_champion_stats_by_patch')
    if (patchError) {
      console.error('Error refreshing champion_stats_by_patch:', patchError)
      return NextResponse.json({ 
        error: 'Failed to refresh patch stats',
        details: patchError 
      }, { status: 500 })
    }
    console.log('✓ Refreshed champion_stats_by_patch')

    // refresh windowed stats view
    const { error: windowError } = await supabase.rpc('refresh_champion_stats_windowed')
    if (windowError) {
      console.error('Error refreshing champion_stats_windowed:', windowError)
      return NextResponse.json({ 
        error: 'Failed to refresh windowed stats',
        details: windowError 
      }, { status: 500 })
    }
    console.log('✓ Refreshed champion_stats_windowed')

    // refresh item stats view
    const { error: itemError } = await supabase.rpc('refresh_item_stats_by_patch')
    if (itemError) {
      console.error('Error refreshing item_stats_by_patch:', itemError)
      return NextResponse.json({ 
        error: 'Failed to refresh item stats',
        details: itemError 
      }, { status: 500 })
    }
    console.log('✓ Refreshed item_stats_by_patch')

    // refresh rune stats view
    const { error: runeError } = await supabase.rpc('refresh_rune_stats_by_patch')
    if (runeError) {
      console.error('Error refreshing rune_stats_by_patch:', runeError)
      return NextResponse.json({ 
        error: 'Failed to refresh rune stats',
        details: runeError 
      }, { status: 500 })
    }
    console.log('✓ Refreshed rune_stats_by_patch')

    const duration = Date.now() - startTime

    return NextResponse.json({ 
      success: true,
      message: 'Materialized views refreshed successfully',
      duration_ms: duration
    })
  } catch (error) {
    console.error('Unexpected error refreshing materialized views:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
