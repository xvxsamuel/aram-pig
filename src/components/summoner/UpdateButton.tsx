'use client'

import { useState, useEffect } from 'react'
import SimpleTooltip from '@/components/ui/SimpleTooltip'

interface Props {
  region: string
  name: string
  puuid: string
  hasActiveJob: boolean
  onUpdateStarted: () => void
  cooldownUntil?: string | null
  statusMessage?: string | null
}

export default function UpdateButton({ hasActiveJob, onUpdateStarted, cooldownUntil, statusMessage }: Props) {
  const [isOnCooldown, setIsOnCooldown] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  // check if on cooldown
  useEffect(() => {
    if (!cooldownUntil) {
      setIsOnCooldown(false)
      return
    }

    const checkCooldown = () => {
      const remaining = new Date(cooldownUntil).getTime() - Date.now()
      setIsOnCooldown(remaining > 0)
    }

    checkCooldown()
    const interval = setInterval(checkCooldown, 1000)
    return () => clearInterval(interval)
  }, [cooldownUntil])

  // show tooltip persistently when statusMessage changes
  useEffect(() => {
    if (statusMessage) {
      setShowTooltip(true)
      const timer = setTimeout(() => setShowTooltip(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  const handleUpdate = () => {
    if (isOnCooldown || hasActiveJob) return
    onUpdateStarted()
  }

  const isDisabled = hasActiveJob || isOnCooldown

  const buttonContent = (
    <button
      onClick={handleUpdate}
      disabled={isDisabled}
      className={`w-32 px-6 py-2 bg-gradient-to-t rounded-lg font-semibold transition-all ${
        isDisabled
          ? 'from-gray-600 to-gray-500 cursor-not-allowed opacity-60'
          : 'from-action-100 to-action-200 hover:brightness-130 cursor-pointer'
      }`}
      data-update-button
    >
      {hasActiveJob ? 'Updating...' : 'Update'}
    </button>
  )

  // show tooltip with status message
  if (statusMessage) {
    return (
      <div className="relative">
        <SimpleTooltip content={<span className="text-sm text-white">{statusMessage}</span>} forceVisible={showTooltip}>
          {buttonContent}
        </SimpleTooltip>
      </div>
    )
  }

  // show cooldown tooltip when disabled due to cooldown
  if (isOnCooldown) {
    return (
      <div className="relative">
        <SimpleTooltip content={<span className="text-sm text-white">Please wait before updating again</span>}>
          {buttonContent}
        </SimpleTooltip>
      </div>
    )
  }

  return <div className="relative">{buttonContent}</div>
}
