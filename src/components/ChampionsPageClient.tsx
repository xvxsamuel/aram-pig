'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import ChampionFilters from '@/components/ChampionFilters'
import ChampionTable from '@/components/ChampionTable'

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
  
  const [champions, setChampions] = useState<ChampionStats[]>([])
  const [loading, setLoading] = useState(true)
  const [totalMatches, setTotalMatches] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  useEffect(() => {
    // Only fetch if we have both filter and patch params
    if (!filter || !patch) {
      setLoading(true)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setChampions([]) // Clear old data immediately
      try {
        const params = new URLSearchParams({
          offset: '0',
          limit: '200', // Load all champions at once with indexed db
          filter: filter,
        })
        if (patch) params.set('patch', patch)

        const res = await fetch(`/api/champions?${params}`)
        const data = await res.json()
        
        if (data.champions) {
          setChampions(data.champions)
          setTotalMatches(data.totalMatches || 0)
          if (data.champions.length > 0) {
            setLastUpdated(data.champions[0].last_calculated_at)
          }
        }
      } catch (error) {
        console.error('Failed to fetch champions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [filter, patch]) // Removed loader and dataKey from dependencies

  // Calculate time since last update
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
            {totalMatches.toLocaleString()} matches analyzed • Last updated {timeAgo}
          </p>
        </div>

        {/* filters */}
        <ChampionFilters availablePatches={availablePatches} />

        {/* champion table or skeleton */}
        {loading || !filter || !patch ? (
          <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
            {/* table header */}
            <div className="grid grid-cols-[80px_80px_1fr_120px_120px_120px] gap-4 px-4 border-b border-abyss-700 bg-abyss-700 text-sm text-subtitle">
              <div className="text-center transition-colors relative py-4">Rank</div>
              <div className="py-4"></div>
              <div className="text-center py-4">Champion</div>
              <div className="text-center py-4">Win Rate</div>
              <div className="text-center py-4">Pick Rate</div>
              <div className="text-center py-4">Matches</div>
            </div>
            
            {/* skeleton rows */}
            <div>
              {Array.from({ length: 20 }).map((_, i) => (
                <div 
                  key={`skeleton-${i}`}
                  className="grid grid-cols-[80px_80px_1fr_120px_120px_120px] gap-4 p-4 border-b border-abyss-800 animate-pulse"
                >
                  <div className="flex items-center justify-center">
                    <div className="w-6 h-6 bg-abyss-700 rounded" />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-12 h-12 bg-abyss-700 rounded-xl" />
                  </div>
                  <div className="flex items-center">
                    <div className="w-32 h-5 bg-abyss-700 rounded" />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-16 h-5 bg-abyss-700 rounded" />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-12 h-5 bg-abyss-700 rounded" />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-16 h-5 bg-abyss-700 rounded" />
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
          <ChampionTable 
            champions={champions}
            ddragonVersion={ddragonVersion}
            championNames={championNames}
            totalChampions={172}
            filter={filter}
            patch={patch}
          />
        )}
      </div>
    </main>
  )
}
