'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import PatchFilter from '@/components/filters/PatchFilter'
import ChampionTable from '@/components/champions/ChampionTable'
import ErrorMessage from '@/components/ui/ErrorMessage'
import type { ChampionTier } from '@/lib/ui'

const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

interface ChampionStats {
  champion_name: string
  overall_winrate: number
  games_analyzed: number
  last_updated?: string
  tier: ChampionTier | null
}

interface ChampionData {
  champions: ChampionStats[]
  totalMatches: number
  patch: string
  lastFetched?: string
}

interface ChampionError {
  title: string
  message: string
}

interface Props {
  availablePatches: string[]
  ddragonVersion: string
  championNames: Record<string, string>
  initialData: ChampionData | { error: ChampionError } | null
  defaultPatch: string
}

export default function ChampionsPageClient({
  availablePatches,
  ddragonVersion,
  championNames,
  initialData,
  defaultPatch,
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const urlPatch = searchParams.get('patch')

  // track when data was last fetched from API
  // initialize from prefetched data if available
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(() => {
    if (initialData && 'lastFetched' in initialData && initialData.lastFetched) {
      return new Date(initialData.lastFetched).getTime()
    }
    return null
  })

  // redirect to default patch if none specified
  useEffect(() => {
    if (!urlPatch && defaultPatch) {
      router.replace(`${pathname}?patch=${defaultPatch}`)
    }
  }, [urlPatch, defaultPatch, router, pathname])

  const currentPatch = urlPatch || defaultPatch

  // determine if we can use prefetched data (same patch)
  const canUsePrefetchedData = initialData && 'patch' in initialData && initialData.patch === currentPatch

  // swr with fallback data for instant load - matches API cache (6 hours)
  const { data, isLoading, error } = useSWR<ChampionData>(
    currentPatch ? `/api/champions?patch=${currentPatch}` : null,
    fetcher,
    {
      fallbackData: canUsePrefetchedData ? initialData : undefined,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 21600000, // 6 hours - matches server cache
      revalidateOnMount: !canUsePrefetchedData, // only revalidate if patch changed
    }
  )

  const champions = data?.champions || []
  // hardcoded offset for 25.24 - matches were lost but stats data remains
  const PATCH_25_24_LOST_MATCHES = 1054230
  const totalMatches = (currentPatch === '25.24' ? PATCH_25_24_LOST_MATCHES : 0) + (data?.totalMatches ?? 0)

  // update fetch time when new data arrives from API
  useEffect(() => {
    if (data?.lastFetched) {
      setLastFetchTime(new Date(data.lastFetched).getTime())
    }
  }, [data?.lastFetched])

  // time since last DB fetch
  const timeAgo = useMemo(() => {
    if (!lastFetchTime) return 'Unknown'
    
    const diffMs = Date.now() - lastFetchTime
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    return 'just now'
  }, [lastFetchTime])

  // show skeleton only when loading with no data
  const showSkeleton = isLoading && champions.length === 0

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-6xl mx-auto px-12 py-8">
        {/* header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">ARAM Champion Tier List</h2>
            <p className="text-subtitle">
              {totalMatches.toLocaleString()} matches analyzed • Last updated {timeAgo}
            </p>
          </div>
          <PatchFilter availablePatches={availablePatches} currentPatch={currentPatch} />
        </div>

        {/* error message */}
        {error && (
          <div className="mb-6">
            <ErrorMessage
              title="Failed to load champion data"
              message="Please try again or select a different patch."
              onRetry={() => window.location.reload()}
            />
          </div>
        )}

        {/* champion table or skeleton */}
        {showSkeleton ? (
          <ChampionTableSkeleton />
        ) : champions.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] bg-abyss-600 rounded-lg border border-gold-dark/40">
            <p className="text-2xl text-subtitle mb-2">No champion data available yet</p>
            <p className="text-sm text-center text-text-muted px-4">
              No matches found for patch {currentPatch}. Please try again later.
            </p>
          </div>
        ) : (
          <ChampionTable champions={champions} ddragonVersion={ddragonVersion} championNames={championNames} />
        )}
      </div>
    </main>
  )
}

// extracted skeleton component
function ChampionTableSkeleton() {
  return (
    <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
      {/* table header */}
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

      {/* skeleton rows */}
      <div>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 px-3 border-b border-abyss-800 animate-pulse">
            <div className="w-14 flex items-center justify-center">
              <div className="w-6 h-6 bg-abyss-700 rounded" />
            </div>
            <div className="w-32 flex items-center gap-3">
              <div className="w-10 h-10 bg-abyss-700 rounded-lg flex-shrink-0" />
              <div className="w-20 h-4 bg-abyss-700 rounded" />
            </div>
            <div className="flex-1" />
            <div className="w-20 sm:w-24 flex items-center justify-center">
              <div className="w-14 h-4 bg-abyss-700 rounded" />
            </div>
            <div className="w-20 sm:w-24 flex items-center justify-center">
              <div className="w-10 h-4 bg-abyss-700 rounded" />
            </div>
            <div className="w-20 sm:w-24 flex items-center justify-center">
              <div className="w-12 h-4 bg-abyss-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
