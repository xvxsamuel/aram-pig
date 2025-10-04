"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { getDefaultTag, LABEL_TO_PLATFORM, PLATFORM_TO_REGIONAL } from "../lib/regions"

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
  const [cooldown, setCooldown] = useState(0)
  const [showCooldownMessage, setShowCooldownMessage] = useState(false)
  const [showUpToDateMessage, setShowUpToDateMessage] = useState(false)

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  useEffect(() => {
    if (showCooldownMessage) {
      const timer = setTimeout(() => setShowCooldownMessage(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [showCooldownMessage])

  useEffect(() => {
    if (showUpToDateMessage) {
      const timer = setTimeout(() => setShowUpToDateMessage(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [showUpToDateMessage])

  const calculateETA = (totalMatches: number) => {
    const apiCallsNeeded = totalMatches + Math.ceil(totalMatches / 100)
    const estimatedSeconds = Math.ceil(apiCallsNeeded / 15)
    
    return estimatedSeconds
  }

  const handleUpdate = async () => {
    if (cooldown > 0) {
      setShowCooldownMessage(true)
      return
    }
    
    if (isUpdating) return
    
    setIsUpdating(true)
    setCooldown(30) // 30 sec cd between client refreshes
    
    try {
      const decodedName = decodeURIComponent(name)
      const summonerName = decodedName.replace("-", "#")
      const [gameName, tagLine] = summonerName.includes("#") 
        ? summonerName.split("#") 
        : [summonerName, getDefaultTag(region.toUpperCase())]

      // convert region label to platform code, then to regional cluster
      const platformCode = LABEL_TO_PLATFORM[region.toUpperCase()]
      const regionalCode = platformCode ? PLATFORM_TO_REGIONAL[platformCode] : 'americas'

      const countResponse = await fetch('/api/match-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: regionalCode, puuid }),
      })

      if (!countResponse.ok) {
        throw new Error('Failed to get match count')
      }

      const { totalMatches } = await countResponse.json()
      
      // if no matches then insta refresh
      if (totalMatches === 0) {
        console.log('Profile is already up to date!')
        setShowUpToDateMessage(true)
        setTimeout(() => {
          router.refresh()
        }, 500)
        return
      }

      const eta = calculateETA(totalMatches)
      
      const showFullScreen = !hasMatches
      
      if (onUpdateStart) {
        onUpdateStart(totalMatches, eta, showFullScreen)
      }

      const response = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: regionalCode,
          gameName,
          tagLine,
          platform: platformCode,
        }),
      }).catch(error => {
        // network errors
        console.log('Network error during update:', error)
        return null
      })

      if (!response) {
        // network timeout/error
        if (onUpdateComplete) {
          onUpdateComplete()
        }
        // still refresh
        setTimeout(() => {
          router.refresh()
        }, 500)
        return
      }

      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        if (onUpdateComplete) {
          onUpdateComplete()
        }
        setTimeout(() => {
          router.refresh()
        }, 500)
      } else {
        if (onUpdateComplete) {
          onUpdateComplete()
        }
      }
    } catch (error) {
      console.error('Update error:', error)
      if (onUpdateComplete) {
        onUpdateComplete()
      }
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="relative">
      <button 
        onClick={handleUpdate}
        disabled={isUpdating}
        className="w-32 px-6 py-2 bg-gradient-to-t from-accent-r-dark to-accent-r-light hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        data-update-button
      >
        {isUpdating ? 'Updating...' : 'Update'}
      </button>
      
      {showCooldownMessage && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-accent-r-dark border border-accent-r-light/30 rounded-lg px-4 py-2 text-sm text-white whitespace-nowrap z-10 animate-fade-in">
          Please wait before you update again
        </div>
      )}
      
      {showUpToDateMessage && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-green-900/80 border border-green-500/30 rounded-lg px-4 py-2 text-sm text-white whitespace-nowrap z-10 animate-fade-in">
          Profile is up to date!
        </div>
      )}
    </div>
  )
}
