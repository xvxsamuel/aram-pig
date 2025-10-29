"use client"

import { useEffect, useState } from "react"
import type { UpdateJobProgress } from "../types/update-jobs"

interface Props {
  job: UpdateJobProgress
  region?: string
}

export default function FetchMessage({ job, region }: Props) {
  const [eta, setEta] = useState<number | null>(null)
  const hasStartedFetching = job.totalMatches > 0
  
  console.log('✨ FetchMessage rendering with:', { hasStartedFetching, job })

  // fetch eta when component mounts
  useEffect(() => {
    if (region && job.totalMatches > 0) {
      fetch(`/api/rate-limit-status?region=${region}&matchCount=${job.totalMatches - job.fetchedMatches}`)
        .then(res => res.json())
        .then(data => {
          if (data.etaSeconds) {
            setEta(data.etaSeconds)
          }
        })
        .catch(err => console.error('failed to fetch eta:', err))
    }
  }, [region, job.totalMatches, job.fetchedMatches])

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `~${seconds}s`
    const mins = Math.ceil(seconds / 60)
    return `~${mins}m`
  }

  return (
    <div className="mb-6 rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark" style={{ minHeight: '80px' }}>
      <div className="bg-abyss-700 rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-0 border-3 border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-3 border-accent-light rounded-full animate-spin border-t-transparent"></div>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold mb-1">
              Our pigs are digging through this match history...
            </h2>
            {hasStartedFetching && (
              <p className="text-sm text-white mb-1">
                {job.fetchedMatches} / {job.totalMatches} matches loaded ({job.progressPercentage}%)
                {eta !== null && ` • ETA: ${formatEta(eta)}`}
              </p>
            )}
            <p className="text-xs text-text-muted">
              This may take a few minutes due to Riot API limits. The page will automatically refresh when complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
