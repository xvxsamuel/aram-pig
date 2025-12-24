import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'

// aggressive caching: 5 min fresh, 30 min stale-while-revalidate
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=1800'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const patch = searchParams.get('patch')

  if (!patch) {
    return NextResponse.json({ error: 'Patch parameter required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // parallel fetch: champion stats and match count
    const [statsResult, matchCountResult] = await Promise.all([
      supabase
        .from('champion_stats')
        .select('champion_name, games, wins, last_updated')
        .eq('patch', patch)
        .gte('games', 1)
        .order('wins', { ascending: false })
        .order('games', { ascending: false })
        .limit(200),
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('patch', patch),
    ])

    if (statsResult.error) {
      console.error('[Champions API] Database error:', statsResult.error)
      return NextResponse.json({ error: statsResult.error.message }, { status: 500 })
    }

    const champions = (statsResult.data || []).map(row => ({
      champion_name: row.champion_name,
      overall_winrate: row.games > 0 ? Number(((row.wins / row.games) * 100).toFixed(2)) : 0,
      games_analyzed: row.games || 0,
      last_updated: row.last_updated,
    }))

    // sort by winrate descending
    champions.sort((a, b) => b.overall_winrate - a.overall_winrate)

    const response = NextResponse.json({
      champions,
      totalMatches: matchCountResult.count || 0,
      patch,
    })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    console.error('[Champions API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch champions' }, { status: 500 })
  }
}
