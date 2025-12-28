import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getLatestVersion, fetchChampionNames } from '@/lib/ddragon'
import { getLatestPatches } from '@/lib/game'
import { createAdminClient } from '@/lib/db'
import ChampionsPageClient from '@/components/champions/ChampionsPageClient'
import type { ChampionTier } from '@/lib/ui'

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
        .select('champion_name, games, wins, last_updated, tier:data->>tier')
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
      const errorDetails = {
        message: statsResult.error?.message || 'Unknown database error',
        details: statsResult.error?.details,
        hint: statsResult.error?.hint,
        code: statsResult.error?.code,
      }
      console.error('[ChampionsPage] Failed to prefetch stats:', errorDetails)
      return {
        error: {
          title: 'Database Error',
          message: `${errorDetails.message}${errorDetails.hint ? ` (${errorDetails.hint})` : ''}`,
        },
      }
    }

    const champions = (statsResult.data || []).map(row => ({
      champion_name: row.champion_name,
      overall_winrate: row.games > 0 ? Number(((row.wins / row.games) * 100).toFixed(2)) : 0,
      games_analyzed: row.games || 0,
      last_updated: row.last_updated,
      tier: (row.tier || 'COAL') as ChampionTier,
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
    return {
      error: {
        title: 'Failed to Load Champions',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
    }
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
    <Suspense fallback={<div className="min-h-screen bg-accent-darker" />}>
      <ChampionsPageClient
        availablePatches={availablePatches}
        ddragonVersion={ddragonVersion}
        championNames={championNames}
        initialData={initialData}
        defaultPatch={defaultPatch}
      />
    </Suspense>
  )
}
