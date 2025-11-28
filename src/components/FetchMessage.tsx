"use client"

import { useEffect, useState } from "react"
import type { UpdateJobProgress } from "../types/update-jobs"

interface Props {
  job: UpdateJobProgress
  region?: string
  notifyEnabled: boolean
  onNotifyChange: (enabled: boolean) => void
}

export default function FetchMessage({ job, region, notifyEnabled, onNotifyChange }: Props) {
  const [eta, setEta] = useState<number | null>(null)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const hasStartedFetching = job.totalMatches > 0
  
  console.log('FetchMessage rendering with:', { hasStartedFetching, job })

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

  const handleNotifyToggle = async () => {
    if (!notifyEnabled) {
      // trying to enable - request permission
      if (!('Notification' in window)) {
        setNotifyError('Notifications not supported in this browser.')
        return
      }
      
      if (Notification.permission === 'granted') {
        setNotifyError(null)
        onNotifyChange(true)
      } else if (Notification.permission === 'denied') {
        setNotifyError('Notifications blocked. Enable them in browser settings.')
      } else {
        try {
          const permission = await Notification.requestPermission()
          if (permission === 'granted') {
            setNotifyError(null)
            onNotifyChange(true)
          } else {
            setNotifyError('Failed to get notification permissions. Try again later.')
          }
        } catch {
          setNotifyError('Failed to get notification permissions. Try again later.')
        }
      }
    } else {
      // disabling
      setNotifyError(null)
      onNotifyChange(false)
    }
  }

  return (
    <div className="mb-6 rounded-lg p-px bg-gradient-to-b from-gold-light to-gold-dark" style={{ minHeight: '80px' }}>
      <div className="bg-abyss-800 rounded-[inherit] p-4">
        <div className="flex items-center gap-4">
          <div className="relative w-10 h-10 flex-shrink-0">
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
            <p className="text-xs text-text-muted mb-2">
              This may take a few minutes due to Riot API limits. The page will automatically refresh when complete.
            </p>
            
            <label className="flex items-end gap-2 cursor-pointer select-none">
              <div className="relative w-4 h-4 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={notifyEnabled}
                  onChange={handleNotifyToggle}
                  className="peer appearance-none w-4 h-4 rounded border border-gold-light bg-transparent cursor-pointer outline-none focus:outline-none focus:ring-0"
                />
                <svg 
                  className="absolute inset-0 w-4 h-4 pointer-events-none opacity-0 peer-checked:opacity-100 text-accent-light"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-xs text-gold-light leading-none pb-px">Notify me when complete</span>
            </label>
            {notifyError && (
              <p className="text-xs text-text-muted mt-1">{notifyError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
