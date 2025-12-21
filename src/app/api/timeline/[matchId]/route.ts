import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import { getMatchTimeline } from '@/lib/riot/api'

// get: view timeline data for a match
// shows stored timeline if available, or fetches from riot api
export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const { searchParams } = new URL(request.url)
  const region = searchParams.get('region') || 'europe'
  const forceFetch = searchParams.get('fetch') === 'true'

  const supabase = createAdminClient()

  // check for stored timeline first
  const { data: match } = await supabase
    .from('matches')
    .select('timeline_data, game_creation, patch')
    .eq('match_id', matchId)
    .single()

  if (match?.timeline_data && !forceFetch) {
    return NextResponse.json({
      source: 'stored',
      matchId,
      gameCreation: match.game_creation,
      patch: match.patch,
      timeline: match.timeline_data,
    })
  }

  // fetch from riot api
  try {
    const timeline = await getMatchTimeline(matchId, region as any, 'overhead')

    if (!timeline) {
      return NextResponse.json({ error: 'Timeline not available', matchId }, { status: 404 })
    }

    return NextResponse.json({
      source: 'riot_api',
      matchId,
      gameCreation: match?.game_creation,
      patch: match?.patch,
      timeline,
    })
  } catch (error) {
    console.error('[Timeline] Error fetching:', error)
    return NextResponse.json({ error: 'Failed to fetch timeline', matchId }, { status: 500 })
  }
}
