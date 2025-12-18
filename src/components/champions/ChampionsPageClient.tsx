'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import PatchFilter from '@/components/filters/PatchFilter'
import ChampionTable from '@/components/champions/ChampionTable'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface ChampionStats {
  champion_name: string
  overall_winrate: number
  games_analyzed: number
}

interface Props {
  availablePatches: string[]
  ddragonVersion: string
  championNames: Record<string, string>
}

export default function ChampionsPageClient({ availablePatches, ddragonVersion, championNames }: Props) {
  const searchParams = useSearchParams()
  const filter = searchParams.get('filter')
  const patch = searchParams.get('patch')

  // SWR with stale-while-revalidate
  const { data, isLoading } = useSWR(
    filter && patch ? `/api/champions?offset=0&limit=200&filter=${filter}&patch=${patch}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  const champions: ChampionStats[] = data?.champions || []
  const totalMatches: number = data?.totalMatches || 0
  const lastUpdated = champions.length > 0 ? (champions[0] as any).last_calculated_at : null
  const loading = isLoading && !data

  // calculate time since last update
  let timeAgo = 'Unknown'
  if (lastUpdated) {
    try {
      const now = new Date()
      const updated = new Date(lastUpdated)
      const diffMs = now.getTime() - updated.getTime()
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
    } catch (_e) {
      timeAgo = 'Unknown'
    }
  }

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-6xl mx-auto px-12 py-8">
        {/* header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">ARAM Champion Statistics</h2>
          <p className="text-subtitle">
            {totalMatches.toLocaleString()} matches analyzed • Last updated {timeAgo}
          </p>
        </div>

        {/* filters */}
        <div className="bg-abyss-800 border border-gold-dark/40 rounded-lg p-4 mb-6">
          <PatchFilter availablePatches={availablePatches} />
        </div>

        {/* champion table or skeleton */}
        {loading || !filter || !patch ? (
          <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
            {/* table header - matches ChampionTable */}
            <div className="flex items-stretch gap-3 px-3 border-b border-abyss-700 bg-abyss-700 text-sm text-subtitle">
              <div className="w-14 flex items-center justify-center py-3">Rank</div>
              <div className="w-44 flex items-center justify-center py-3">Champion</div>
              <div className="flex-1" />
              <div className="w-20 sm:w-24 flex items-center justify-center py-3">
                <span className="hidden sm:inline">Win Rate</span>
                <span className="sm:hidden">WR</span>
              </div>
              <div className="w-20 sm:w-24 flex items-center justify-center py-3">
                <span className="hidden sm:inline">Pick Rate</span>
                <span className="sm:hidden">PR</span>
              </div>
              <div className="w-20 sm:w-24 flex items-center justify-center py-3">
                <span className="hidden sm:inline">Matches</span>
                <span className="sm:hidden">#</span>
              </div>
            </div>

            {/* skeleton rows - matches ChampionTable row structure */}
            <div>
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="flex items-center gap-3 py-2 px-3 border-b border-abyss-800 animate-pulse"
                >
                  {/* rank */}
                  <div className="w-14 flex items-center justify-center">
                    <div className="w-6 h-6 bg-abyss-700 rounded" />
                  </div>

                  {/* champion icon + name */}
                  <div className="w-32 flex items-center gap-3">
                    <div className="w-10 h-10 bg-abyss-700 rounded-lg flex-shrink-0" />
                    <div className="w-20 h-4 bg-abyss-700 rounded" />
                  </div>

                  {/* spacer */}
                  <div className="flex-1" />

                  {/* win rate */}
                  <div className="w-20 sm:w-24 flex items-center justify-center">
                    <div className="w-14 h-4 bg-abyss-700 rounded" />
                  </div>

                  {/* pick rate */}
                  <div className="w-20 sm:w-24 flex items-center justify-center">
                    <div className="w-10 h-4 bg-abyss-700 rounded" />
                  </div>

                  {/* matches */}
                  <div className="w-20 sm:w-24 flex items-center justify-center">
                    <div className="w-12 h-4 bg-abyss-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : champions.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] bg-abyss-600 rounded-lg border border-gold-dark/40">
            <p className="text-2xl text-subtitle mb-2">No champion data available yet</p>
            <p className="text-sm text-center px-4">
              {filter === 'patch' && patch
                ? `No matches found for patch ${patch}. Data will appear once the scraper processes games.`
                : 'Data will appear once the scraper processes games.'}
            </p>
          </div>
        ) : (
          <ChampionTable champions={champions} ddragonVersion={ddragonVersion} championNames={championNames} />
        )}
      </div>
    </main>
  )
}
