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
    // fetch champion stats only - match count derived from stats
    // order by computed winrate at db level for correct sorting
    const statsResult = await supabase
      .from('champion_stats')
      .select('champion_name, games, wins, last_updated, winrate, tier')
      .eq('patch', patch)
      .gte('games', 1)
      .order('winrate', { ascending: false })
      .order('games', { ascending: false })
      .limit(200)

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

    // calculate total matches from champion stats (sum of games / 10 participants per match)
    const totalGames = champions.reduce((sum, champ) => sum + champ.games_analyzed, 0)
    const totalMatches = Math.floor(totalGames / 10)

    // find most recent update timestamp from all champions
    const lastFetched = champions.reduce((latest, champ) => {
      if (!champ.last_updated) return latest
      const champTime = new Date(champ.last_updated).getTime()
      return !isNaN(champTime) && champTime > latest ? champTime : latest
    }, 0)

    // already sorted by db, no need to sort again

    const response = NextResponse.json({
      champions,
      totalMatches,
      patch,
      lastFetched: lastFetched > 0 ? new Date(lastFetched).toISOString() : new Date().toISOString(),
    })
    response.headers.set('Cache-Control', CACHE_CONTROL)
    return response
  } catch (error) {
    console.error('[Champions API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch champions' }, { status: 500 })
  }
}
