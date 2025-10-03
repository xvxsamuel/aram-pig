"use client"

import { useState, useEffect } from "react"

interface Props {
  totalMatches: number
  estimatedSeconds: number
}

export default function FetchMessage({ totalMatches, estimatedSeconds }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const remaining = Math.max(0, estimatedSeconds - elapsed)
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <div className="mb-6 bg-accent-r-dark/30 border border-accent-r-light/30 rounded-xl p-4">
      <div className="flex items-start gap-4">
        {/* spinner */}
        <div className="relative w-10 h-10 flex-shrink-0">
          <div className="absolute inset-0 border-3 border-gray-700 rounded-full"></div>
          <div className="absolute inset-0 border-3 border-accent-r-light rounded-full animate-spin border-t-transparent"></div>
        </div>

        {/* content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white mb-1">
            Fetching match history...
          </h3>
          <p className="text-sm text-subtitle mb-2">
            Loading {totalMatches} matches from Riot's servers
          </p>
          <div className="flex items-center gap-2 text-xs text-accent-r-light">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>ETA: {minutes}:{seconds.toString().padStart(2, '0')}</span>
          </div>
          <p className="text-xs text-subtitle mt-2">
            The page will automatically refresh when complete.
          </p>
        </div>
      </div>
    </div>
  )
}
