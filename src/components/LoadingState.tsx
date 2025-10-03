"use client"

import { useState, useEffect } from "react"

interface Props {
  totalMatches: number
  estimatedSeconds: number
}

export default function LoadingState({ totalMatches, estimatedSeconds }: Props) {
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
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="relative w-24 h-24 mb-6">
        <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-gold-light rounded-full animate-spin border-t-transparent"></div>
      </div>
      
      <h2 className="text-2xl font-bold mb-2">Pigs are digging through your match history...</h2>
      <p className="text-subtitle text-12 mb-4">Loading {totalMatches} matches...</p>
      
      <div className="flex items-center gap-2 text-sm">
        <svg className="w-4 h-4 text-accent-r-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Estimated time remaining: {minutes}:{seconds.toString().padStart(2, '0')}</span>
      </div>
      
      <p className="text-xs text-subtitle mt-6 max-w-md text-center">
        This may take a while due to API rate limits. The page will automatically refresh when complete.
      </p>
    </div>
  )
}
