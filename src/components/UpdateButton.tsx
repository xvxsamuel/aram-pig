"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { getDefaultTag } from "../lib/regions"

interface Props {
  region: string
  name: string
  puuid: string
  onUpdateStart?: (totalMatches: number, eta: number, showFullScreen: boolean) => void
  onUpdateComplete?: () => void
  hasMatches: boolean
}

export default function UpdateButton({ region, name, puuid, onUpdateStart, onUpdateComplete, hasMatches }: Props) {
  const router = useRouter()
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState('')

  const calculateETA = (totalMatches: number) => {
    // Calculate ETA based on total API calls needed
    // The library handles rate limiting internally, so we provide a conservative estimate
    const apiCallsNeeded = totalMatches + Math.ceil(totalMatches / 100)
    
    // Riot API limits: 20 requests per second, 100 requests per 2 minutes
    // Using conservative estimate of ~15 requests/second to account for library overhead
    const estimatedSeconds = Math.ceil(apiCallsNeeded / 15)
    
    return estimatedSeconds
  }

  const handleUpdate = async () => {
    setIsUpdating(true)
    setMessage('Getting match count...')
    
    try {
      const decodedName = decodeURIComponent(name)
      const summonerName = decodedName.replace("-", "#")
      const [gameName, tagLine] = summonerName.includes("#") 
        ? summonerName.split("#") 
        : [summonerName, getDefaultTag(region.toUpperCase())]

      const regionMap: Record<string, string> = {
        'euw': 'europe',
        'na': 'americas',
        'kr': 'asia',
        'oce': 'sea',
      }
      const regionalCode = regionMap[region.toLowerCase()] || 'americas'

      const countResponse = await fetch('/api/match-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: regionalCode, puuid }),
      })

      if (!countResponse.ok) {
        throw new Error('Failed to get match count')
      }

      const { totalMatches } = await countResponse.json()
      const eta = calculateETA(totalMatches)
      
      const showFullScreen = !hasMatches
      
      if (onUpdateStart) {
        onUpdateStart(totalMatches, eta, showFullScreen)
      }

      setMessage(showFullScreen ? `Fetching ${totalMatches} matches...` : `Updating...`)

      const response = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: regionalCode,
          gameName,
          tagLine,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✓ Fetched ${data.newMatches} new matches`)
        if (onUpdateComplete) {
          onUpdateComplete()
        }
        setTimeout(() => {
          router.refresh()
          window.location.reload()
        }, 500)
      } else {
        setMessage(`✗ ${data.error}`)
        if (onUpdateComplete) {
          onUpdateComplete()
        }
      }
    } catch (error) {
      console.error('Update error:', error)
      setMessage('✗ Failed to update profile')
      if (onUpdateComplete) {
        onUpdateComplete()
      }
    } finally {
      setIsUpdating(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button 
        onClick={handleUpdate}
        disabled={isUpdating}
        className="px-6 py-2 bg-gradient-to-t from-accent-r-dark to-accent-r-light hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        data-update-button
      >
        {isUpdating ? 'Updating...' : 'Update'}
      </button>
      {message && (
        <p className={`text-sm ${message.startsWith('✓') ? 'text-green-400' : message.startsWith('✗') ? 'text-red-400' : 'text-blue-400'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
