import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

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
    
    // Only support patch-based filtering with new JSONB structure
    if (filter === 'patch' && patch) {
      // Get actual match count for this patch
      const { count: matchCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('patch', patch)
      
      // Fetch champions sorted by winrate in database
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
      
      // Transform data and calculate winrate on client
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
      
      // Sort by winrate
      champions.sort((a, b) => parseFloat(b.overall_winrate) - parseFloat(a.overall_winrate))
      
      // Add total matches to response
      return NextResponse.json({
        champions,
        total: totalCount,
        totalMatches: matchCount || 0,
        hasMore: offset + limit < totalCount
      })
    } else {
      // Time-based filters not supported with JSONB structure
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
