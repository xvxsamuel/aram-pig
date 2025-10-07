"use client"

import { useEffect } from "react"

interface ToastProps {
  message: string
  type?: "success" | "info"
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type = "success", onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div 
      className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-accent-darkest/95 border-2 border-gold-light rounded-xl px-6 py-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300"
      style={{ minWidth: "300px", maxWidth: "500px" }}
    >
      <div className="flex items-center gap-3">
        <svg className="w-6 h-6 text-accent-light flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="text-white text-sm font-medium">{message}</p>
      </div>
    </div>
  )
}
