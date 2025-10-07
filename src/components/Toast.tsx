"use client"

import { useEffect } from "react"

interface ToastProps {
  message: string
  type?: "success" | "error"
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

  const isError = type === "error"
  const borderColor = isError ? "border-[#E84057]" : "border-[#00a555]"
  const iconColor = isError ? "text-[#E84057]" : "text-[#00a555]"
  const bgColor = isError ? "bg-[#2a1a1d]" : "bg-[#1a2a20]"

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
