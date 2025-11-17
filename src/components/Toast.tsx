"use client"

import { useEffect } from "react"

interface ToastProps {
  message: string
  type?: "success" | "error"
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type = "success", onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const isError = type === "error"
  const borderColor = isError ? "border-negative/80" : "border-accent-light/80"
  const iconColor = isError ? "text-negative" : "text-accent-light"
  const bgColor = isError ? "bg-abyss-700/80" : "bg-abyss-700/80"

  return (
    <div 
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 ${bgColor} border-2 ${borderColor} rounded-lg px-4 py-2 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300`}
      style={{ minWidth: "250px", maxWidth: "400px" }}
    >
      <div className="flex items-center justify-center gap-2">
        {isError ? (
          <svg className={`w-5 h-5 ${iconColor} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className={`w-5 h-5 ${iconColor} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <p className="text-white text-sm font-medium">{message}</p>
      </div>
    </div>
  )
}
