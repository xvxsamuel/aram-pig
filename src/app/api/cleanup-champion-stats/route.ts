import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import { getLatestPatches, PATCHES_TO_KEEP } from '@/lib/game'

// this endpoint should be called by a cron job to clean up old champion stats
// it deletes all champion_stats entries for patches not in the latest N patches

export async function GET(request: Request) {
  // verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // debug logging (remove after troubleshooting)
  console.log('[CLEANUP] Auth header present:', !!authHeader)
  console.log('[CLEANUP] CRON_SECRET env var present:', !!cronSecret)
  console.log('[CLEANUP] Auth header length:', authHeader?.length)
  console.log('[CLEANUP] Expected length:', cronSecret ? `Bearer ${cronSecret}`.length : 'N/A')
  console.log('[CLEANUP] Auth header first 10 chars:', authHeader?.substring(0, 10))
  console.log('[CLEANUP] Expected first 17 chars:', cronSecret ? `Bearer ${cronSecret.substring(0, 10)}` : 'N/A')
  console.log('[CLEANUP] Auth header last 5 chars:', authHeader?.slice(-5))
  console.log('[CLEANUP] Expected last 5 chars:', cronSecret ? cronSecret.slice(-5) : 'N/A')

  // allow access if no CRON_SECRET is set (development) or if it matches
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[CLEANUP] Authorization failed - secrets do not match')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // get the latest patches to keep
    const patchesToKeep = await getLatestPatches(PATCHES_TO_KEEP)
    console.log(`Keeping champion stats for patches: ${patchesToKeep.join(', ')}`)

    // get all distinct patches in champion_stats
    const { data: allPatches, error: fetchError } = await supabase.from('champion_stats').select('patch').limit(1000)

    if (fetchError) {
      console.error('Error fetching patches:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch patches' }, { status: 500 })
    }

    // get unique patches
    const uniquePatches = [...new Set(allPatches?.map(p => p.patch) || [])]
    console.log(`Found patches in database: ${uniquePatches.join(', ')}`)

    // find patches to delete
    const patchesToDelete = uniquePatches.filter(patch => !patchesToKeep.includes(patch))

    if (patchesToDelete.length === 0) {
      console.log('No old patches to delete')
      return NextResponse.json({
        message: 'No cleanup needed',
        patchesKept: patchesToKeep,
        patchesDeleted: [],
      })
    }

    console.log(`Deleting champion stats for old patches: ${patchesToDelete.join(', ')}`)

    // delete old patches
    const { error: deleteError, count } = await supabase
      .from('champion_stats')
      .delete()
      .in('patch', patchesToDelete)
      .select('count')

    if (deleteError) {
      console.error('Error deleting old patches:', deleteError)
      return NextResponse.json({ error: 'Failed to delete old patches' }, { status: 500 })
    }

    console.log(`Deleted ${count || 0} champion_stats rows for patches: ${patchesToDelete.join(', ')}`)

    return NextResponse.json({
      message: 'Cleanup completed',
      patchesKept: patchesToKeep,
      patchesDeleted: patchesToDelete,
      rowsDeleted: count || 0,
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
