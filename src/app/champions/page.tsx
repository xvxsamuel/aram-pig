import type { Metadata } from 'next'
import { getLatestVersion, fetchChampionNames } from '@/lib/ddragon'
import { getLatestPatches } from '@/lib/game'
import { createAdminClient } from '@/lib/db'
import ChampionsPageClient from '@/components/champions/ChampionsPageClient'

export const metadata: Metadata = {
  title: 'Champions | ARAM PIG',
  description: 'View champion statistics and performance in ARAM.',
}

// isr: regenerate page every 5 minutes to keep data fresh
// this caches the entire page including prefetched champion data
export const revalidate = 300

// prefetch champion stats from database
async function prefetchChampionStats(patch: string) {
  try {
    const supabase = createAdminClient()

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
      console.error('[ChampionsPage] Failed to prefetch stats:', statsResult.error)
      return null
    }

    const champions = (statsResult.data || []).map(row => ({
      champion_name: row.champion_name,
      overall_winrate: row.games > 0 ? Number(((row.wins / row.games) * 100).toFixed(2)) : 0,
      games_analyzed: row.games || 0,
      last_updated: row.last_updated,
    }))

    // sort by winrate descending
    champions.sort((a, b) => b.overall_winrate - a.overall_winrate)

    return {
      champions,
      totalMatches: matchCountResult.count || 0,
      patch,
    }
  } catch (error) {
    console.error('[ChampionsPage] Prefetch error:', error)
    return null
  }
}

export default async function ChampionsPage() {
  // parallel fetch all static data
  const [availablePatches, ddragonVersion, championNames] = await Promise.all([
    getLatestPatches(),
    getLatestVersion(),
    getLatestVersion().then(v => fetchChampionNames(v)),
  ])

  // determine default patch (first non-hidden patch)
  const HIDDEN_PATCHES = ['25.22', '25.23']
  const defaultPatch = availablePatches.find(p => !HIDDEN_PATCHES.includes(p)) || availablePatches[0]

  // prefetch champion data for default patch
  const initialData = defaultPatch ? await prefetchChampionStats(defaultPatch) : null

  return (
    <ChampionsPageClient
      availablePatches={availablePatches}
      ddragonVersion={ddragonVersion}
      championNames={championNames}
      initialData={initialData}
      defaultPatch={defaultPatch}
    />
  )
}
