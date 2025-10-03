"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
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
  const [cooldown, setCooldown] = useState(0)
  const [showCooldownMessage, setShowCooldownMessage] = useState(false)

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
    setCooldown(30) // 30 second cooldown
    
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

      const response = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: regionalCode,
          gameName,
          tagLine,
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
          window.location.reload()
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
          window.location.reload()
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
        <div className="absolute top-full mt-2 left-0 bg-accent-r-dark border border-accent-r-light/30 rounded-lg px-4 py-2 text-sm text-white whitespace-nowrap z-10 animate-fade-in">
          Please wait, you're updating too often
        </div>
      )}
    </div>
  )
}
