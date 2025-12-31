import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'

// aggressive caching: 6 hours fresh, 12 hours stale-while-revalidate
// champions list updates infrequently, so long cache is optimal
const CACHE_CONTROL = 'public, s-maxage=21600, stale-while-revalidate=43200'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const patch = searchParams.get('patch')

  if (!patch) {
    return NextResponse.json({ error: 'Patch parameter required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // parallel fetch: champion stats and match count
    // order by computed winrate at db level for correct sorting
    const [statsResult, matchCountResult] = await Promise.all([
      supabase
        .from('champion_stats')
        .select('champion_name, games, wins, last_updated, winrate, tier:data->>tier')
        .eq('patch', patch)
        .gte('games', 1)
        .order('winrate', { ascending: false })
        .order('games', { ascending: false })
        .limit(200),
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('patch', patch),
    ])

    if (statsResult.error) {
      console.error('[Champions API] Database error:', {
        error: statsResult.error,
        message: statsResult.error?.message,
        details: statsResult.error?.details,
        hint: statsResult.error?.hint,
        code: statsResult.error?.code,
      })
      return NextResponse.json({ error: statsResult.error.message || 'Database error' }, { status: 500 })
    }

    const champions = (statsResult.data || []).map(row => ({
      champion_name: row.champion_name,
      overall_winrate: Number(row.winrate) || 0,
      games_analyzed: row.games || 0,
      last_updated: row.last_updated,
      tier: row.tier || 'COAL',
    }))

    // find most recent update timestamp from all champions
    const lastFetched = champions.reduce((latest, champ) => {
      const champTime = new Date(champ.last_updated).getTime()
      return champTime > latest ? champTime : latest
    }, 0)

    // already sorted by db, no need to sort again

    const response = NextResponse.json({
      champions,
      totalMatches: matchCountResult.count || 0,
      patch,
      lastFetched: new Date(lastFetched).toISOString(),
    })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    console.error('[Champions API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch champions' }, { status: 500 })
  }
}
