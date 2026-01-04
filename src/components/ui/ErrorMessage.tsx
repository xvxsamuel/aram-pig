'use client'

import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface Props {
  title: string
  message?: string
  onClose?: () => void
}

export default function ErrorMessage({ title, message, onClose }: Props) {
  const [isVisible, setIsVisible] = useState(true)

  const handleClose = () => {
    setIsVisible(false)
    onClose?.()
  }

  if (!isVisible) return null

  return (
    <div className="rounded-lg p-px bg-gradient-to-b from-red-500/60 to-red-700/60">
      <div className="bg-abyss-800 rounded-[inherit] px-4.5 py-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold mb-1 text-red-300">{title}</h2>
            {message && <p className="text-sm text-text-muted">{message}</p>}
          </div>

          {onClose && (
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1 rounded hover:bg-red-500/20 transition-colors text-red-400 hover:text-red-300"
              aria-label="Dismiss error"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
