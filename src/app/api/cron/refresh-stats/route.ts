import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

// DEPRECATED: This endpoint is no longer needed with incremental aggregates
// Stats are now updated in real-time via database triggers
// Keeping this for backwards compatibility, but it does nothing
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // No-op: Stats are maintained incrementally now
    return NextResponse.json({ 
      success: true,
      message: 'No refresh needed - stats are maintained in real-time',
      note: 'This endpoint is deprecated. Stats update automatically via database triggers.',
      duration_ms: 0
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
