import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DELETE /api/cleanup-jobs - clear stuck jobs
// requires CRON_SECRET for authorization
export async function DELETE(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const supabase = createAdminClient()
    
    // delete jobs that are stuck (pending/processing for more than 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    
    const { data, error } = await supabase
      .from('update_jobs')
      .delete()
      .in('status', ['pending', 'processing'])
      .lt('updated_at', thirtyMinutesAgo)
      .select('id, puuid, status')
    
    if (error) {
      console.error('[CleanupJobs] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`[CleanupJobs] Deleted ${data?.length || 0} stuck jobs`)
    
    return NextResponse.json({
      message: `Deleted ${data?.length || 0} stuck jobs`,
      deleted: data
    })
  } catch (error) {
    console.error('[CleanupJobs] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/cleanup-jobs - list stuck jobs (no auth required, just viewing)
export async function GET() {
  try {
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('update_jobs')
      .select('id, puuid, status, total_matches, fetched_matches, updated_at, created_at')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({
      stuckJobs: data?.length || 0,
      jobs: data
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
