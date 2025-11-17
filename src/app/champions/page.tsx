import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { getLatestVersion } from '@/lib/riot-api'
import { fetchChampionNames } from '@/lib/champion-names'
import ChampionFilters from '@/components/ChampionFilters'
import ChampionTable from '@/components/ChampionTable'

export const metadata: Metadata = {
  title: 'Champions | ARAM PIG',
  description: 'View champion statistics and performance in ARAM.',
}

export const revalidate = 0 // disable cache for filters to work

interface ChampionStats {
  champion_name: string
  overall_winrate: number
  games_analyzed: number
  last_calculated_at: string
  avg_kills?: number
  avg_deaths?: number
  avg_assists?: number
  avg_damage_to_champions?: number
  avg_damage_taken?: number
  avg_heal?: number
  avg_gold_earned?: number
}

interface ChampionRawStats {
  champion_name: string
  wins: number
  games: number
}

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; patch?: string }>
}) {
  const params = await searchParams
  
  const supabase = createAdminClient()
  
  // get last 3 patches from database
  const { data: patchData } = await supabase
    .from('matches')
    .select('patch')
    .not('patch', 'is', null)
    .order('game_creation', { ascending: false })
    .limit(1000)
  
  const uniquePatches = [...new Set((patchData || []).map(m => m.patch).filter(Boolean))]
  const availablePatches = uniquePatches.slice(0, 3)
  
  // default to current patch if no filter specified
  const filter = params.filter || (availablePatches.length > 0 ? 'patch' : 'all')
  const patch = params.patch || (availablePatches.length > 0 ? availablePatches[0] : null)
  
  let champions: ChampionStats[] = []
  let error = null
  
  // fetch last refresh time from metadata table (used for all filters)
  const { data: patchMetadata } = await supabase
    .from('materialized_view_metadata')
    .select('last_refreshed')
    .eq('view_name', 'champion_stats_by_patch')
    .single()
  
  const { data: windowedMetadata } = await supabase
    .from('materialized_view_metadata')
    .select('last_refreshed')
    .eq('view_name', 'champion_stats_windowed')
    .single()
  
  // for patch-specific filter, use champion_stats_by_patch materialized view
  if (filter === 'patch' && patch) {
    const { data: patchStats, error: fetchError } = await supabase
      .from('champion_stats_by_patch')
      .select('*')
      .eq('patch', patch)
    
    error = fetchError
    
    if (patchStats) {
      champions = patchStats
        .filter(s => s.games >= 1)
        .map(s => ({
          champion_name: s.champion_name,
          overall_winrate: s.winrate,
          games_analyzed: s.games,
          last_calculated_at: patchMetadata?.last_refreshed || new Date().toISOString(),
          avg_kills: s.avg_kills,
          avg_deaths: s.avg_deaths,
          avg_assists: s.avg_assists,
          avg_damage_to_champions: s.avg_damage_to_champions,
          avg_damage_taken: s.avg_damage_taken,
          avg_heal: s.avg_heal,
          avg_gold_earned: s.avg_gold_earned,
        }))
        .sort((a, b) => b.overall_winrate - a.overall_winrate)
    }
  }
  // for time-based filters (7d, 30d), use champion_stats_windowed materialized view
  else if (filter === '7' || filter === '30' || filter === '60') {
    const windowDays = parseInt(filter)
    const { data: windowedStats, error: fetchError } = await supabase
      .from('champion_stats_windowed')
      .select('*')
      .eq('window_days', windowDays)
    
    error = fetchError
    
    if (windowedStats) {
      champions = windowedStats
        .filter(s => s.games >= 1)
        .map(s => ({
          champion_name: s.champion_name,
          overall_winrate: s.winrate || 0,
          games_analyzed: s.games,
          last_calculated_at: windowedMetadata?.last_refreshed || new Date().toISOString(),
          avg_kills: s.avg_kills,
          avg_deaths: s.avg_deaths,
          avg_assists: s.avg_assists,
          avg_damage_to_champions: s.avg_damage_to_champions,
          avg_damage_taken: s.avg_damage_taken,
          avg_heal: s.avg_heal,
          avg_gold_earned: s.avg_gold_earned,
        }))
        .sort((a, b) => b.overall_winrate - a.overall_winrate)
    }
  }

  if (error) {
    console.error('Error fetching champion stats:', error)
    return (
      <main className="min-h-screen bg-accent-darker text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <p className="text-2xl mb-4">Error loading champion data</p>
            <p className="text-sm text-text-muted">{error.message}</p>
          </div>
        </div>
      </main>
    )
  }

  
  const championStats: ChampionStats[] = champions || []
  
  // if no data, show empty state
  if (championStats.length === 0) {
    return (
      <main className="min-h-screen bg-accent-darker text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <h1 className="text-4xl font-bold mb-4">ARAM Champion Statistics</h1>
            <p className="text-2xl text-subtitle mb-4">No champion data available yet</p>
          </div>
        </div>
      </main>
    )
  }
  
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)

  // calculate time since last update
  const lastUpdated = championStats[0]?.last_calculated_at
  let timeAgo = 'Unknown'
  if (lastUpdated) {
    const now = Date.now()
    const updated = new Date(lastUpdated).getTime()
    const diffMs = now - updated
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffDays > 0) {
      timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    } else if (diffHours > 0) {
      timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    } else if (diffMins > 0) {
      timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    } else {
      timeAgo = 'just now'
    }
  }

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2">ARAM Champion Statistics</h1>
          <p className="text-subtitle">
            {championStats.reduce((sum, c) => sum + c.games_analyzed, 0).toLocaleString()} games analyzed • {championStats.length} champions • Last updated {timeAgo}
          </p>
        </div>

        {/* filters */}
        <ChampionFilters availablePatches={availablePatches} />

        {/* champion table */}
        <ChampionTable 
          champions={championStats}
          ddragonVersion={ddragonVersion}
          championNames={championNames}
        />
      </div>
    </main>
  )
}