"use client"

import type { UpdateJobProgress } from "../types/update-jobs"

interface Props {
  job: UpdateJobProgress
}

export default function FetchMessage({ job }: Props) {
  const hasStartedFetching = job.totalMatches > 0
  
  console.log('✨ FetchMessage rendering with:', { hasStartedFetching, job })

  return (
    <div className="mb-6 rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark" style={{ minHeight: '80px' }}>
      <div className="bg-accent-darker rounded-xl p-4">
        <div className="flex items-start gap-4">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-0 border-3 border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-3 border-accent-light rounded-full animate-spin border-t-transparent"></div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white mb-1">
              Our pigs are digging through your match history...
            </h3>
            {hasStartedFetching && (
              <p className="text-sm text-subtitle mb-1">
                {job.fetchedMatches} / {job.totalMatches} matches loaded ({job.progressPercentage}%)
              </p>
            )}
            <p className="text-xs text-subtitle">
              This may take a few minutes due to Riot API limits. The page will automatically refresh when complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
