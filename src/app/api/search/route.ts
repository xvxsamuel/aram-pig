import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

// GET /api/search?q=text - search for summoners by name
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.trim().toLowerCase() || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10)

  // If no query, return recently updated summoners
  if (!query) {
    const { data, error } = await supabase
      .from('summoners')
      .select('game_name, tag_line, region, profile_icon_id, summoner_level')
      .order('last_updated', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[search] Error fetching recent summoners:', error)
      return NextResponse.json({ summoners: [] })
    }

    return NextResponse.json({ summoners: data || [] })
  }

  // Search by game_name (case-insensitive prefix match)
  const { data, error } = await supabase
    .from('summoners')
    .select('game_name, tag_line, region, profile_icon_id, summoner_level')
    .ilike('game_name', `${query}%`)
    .order('last_updated', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[search] Error searching summoners:', error)
    return NextResponse.json({ summoners: [] })
  }

  return NextResponse.json({ summoners: data || [] })
}
