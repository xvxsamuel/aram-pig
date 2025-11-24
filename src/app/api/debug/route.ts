import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createAdminClient()
  
  try {
    // get all patches with champion stats
    const { data: patches, error: patchError } = await supabase
      .from('champion_stats')
      .select('patch, games, wins')
      .order('patch', { ascending: false })
    
    if (patchError) {
      return NextResponse.json({ error: patchError.message }, { status: 500 })
    }
    
    // group by patch
    const patchSummary: Record<string, { champions: number, totalGames: number, totalWins: number }> = {}
    
    patches?.forEach(row => {
      if (!patchSummary[row.patch]) {
        patchSummary[row.patch] = { champions: 0, totalGames: 0, totalWins: 0 }
      }
      patchSummary[row.patch].champions++
      patchSummary[row.patch].totalGames += row.games || 0
      patchSummary[row.patch].totalWins += row.wins || 0
    })
    
    // get match counts per patch
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('patch')
    
    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 500 })
    }
    
    const matchCounts: Record<string, number> = {}
    matches?.forEach(m => {
      matchCounts[m.patch] = (matchCounts[m.patch] || 0) + 1
    })
    
    return NextResponse.json({
      patchSummary,
      matchCounts,
      totalChampionStats: patches?.length || 0,
      totalMatches: matches?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
