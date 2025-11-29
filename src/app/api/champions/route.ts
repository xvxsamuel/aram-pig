import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'

// cache for 60s, serve stale for 5 minutes while revalidating
const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const filter = searchParams.get('filter') || 'patch'
  const patch = searchParams.get('patch')
  const offset = parseInt(searchParams.get('offset') || '0')
  const limit = parseInt(searchParams.get('limit') || '20')
  
  const supabase = createAdminClient()
  
  try {
    let champions: any[] = []
    let totalCount = 0
    
    // patch-based filtering w JSONB structure
    if (filter === 'patch' && patch) {
      // Get actual match count for this patch
      const { count: matchCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('patch', patch)
      
      // fetch champions sorted by winrate in db
      const { data, error, count } = await supabase
        .from('champion_stats')
        .select('champion_name, games, wins, last_updated', { count: 'exact' })
        .eq('patch', patch)
        .gte('games', 1)
        .order('wins', { ascending: false })
        .order('games', { ascending: false })
        .range(offset, offset + limit - 1)
      
      if (error) {
        console.error('Database error:', error)
        throw error
      }
      
      console.log(`Found ${data?.length || 0} champions for patch ${patch} (total: ${count})`)
      
      totalCount = count || 0
      
      // calculate winrate on client
      champions = (data || []).map(row => {
        const winrate = row.games > 0 ? (row.wins / row.games) * 100 : 0
        
        return {
          champion_name: row.champion_name,
          overall_winrate: winrate.toFixed(2),
          games_analyzed: row.games || 0,
          last_calculated_at: row.last_updated || new Date().toISOString(),
          avg_kills: 0,
          avg_deaths: 0,
          avg_assists: 0,
          avg_damage_to_champions: 0,
          avg_damage_taken: 0,
          avg_heal: 0,
          avg_gold_earned: 0,
        }
      })
      
      // sort by winrate (just in case)
      champions.sort((a, b) => parseFloat(b.overall_winrate) - parseFloat(a.overall_winrate))
      
      // add total matches to response
      const response = NextResponse.json({
        champions,
        total: totalCount,
        totalMatches: matchCount || 0,
        hasMore: offset + limit < totalCount
      })
      response.headers.set('Cache-Control', CACHE_CONTROL)
      return response
    } else {
      return NextResponse.json({
        champions: [],
        total: 0,
        totalMatches: 0,
        hasMore: false,
        error: 'Only patch-based filtering is supported'
      })
    }
  } catch (error) {
    console.error('Error fetching champions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch champions' },
      { status: 500 }
    )
  }
}
