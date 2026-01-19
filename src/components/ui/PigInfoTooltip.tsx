'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { getPigScoreColor } from '@/lib/ui'

interface PigInfoTooltipProps {
  pigScore: number
  performanceScore?: number
  buildScore?: number
  onClick?: () => void
  children: ReactNode
}

export function PigInfoTooltip({
  pigScore,
  performanceScore,
  buildScore,
  onClick,
  children,
}: PigInfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    let top = triggerRect.top - tooltipRect.height - 8
    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2

    // flip to bottom if not enough space above
    if (top < 8) {
      top = triggerRect.bottom + 8
    }

    // keep within viewport horizontally
    if (left < 8) left = 8
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8
    }

    setPosition({ top, left })
  }, [isVisible])

  const handleMouseEnter = () => setIsVisible(true)
  const handleMouseLeave = () => setIsVisible(false)

  const hasBreakdown = performanceScore !== undefined && buildScore !== undefined

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        className={clsx(onClick && 'cursor-pointer')}
      >
        {children}
      </div>

      {mounted &&
        isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] pointer-events-none"
            style={{ top: position.top, left: position.left }}
          >
            <div className="bg-abyss-900 border border-gold-dark/80 rounded-lg px-3 py-2.5 shadow-xl">
              {/* Main PIG Score */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Personal Item Grade</span>
                <span 
                  className="text-lg font-bold"
                  style={{ color: getPigScoreColor(pigScore) }}
                >
                  {pigScore}
                </span>
              </div>

              {/* Breakdown */}
              {hasBreakdown && (
                <div className="space-y-1.5 border-t border-abyss-700 pt-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] text-text-muted">Performance</span>
                    <span 
                      className="text-xs font-bold tabular-nums"
                      style={{ color: getPigScoreColor(performanceScore) }}
                    >
                      {performanceScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] text-text-muted">Build</span>
                    <span 
                      className="text-xs font-bold tabular-nums"
                      style={{ color: getPigScoreColor(buildScore) }}
                    >
                      {buildScore}
                    </span>
                  </div>
                </div>
              )}

              {/* Click hint */}
              {onClick && (
                <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-abyss-700">
                  <span className="text-[9px] text-text-muted">Click for breakdown</span>
                  <svg className="w-3 h-3 text-gold-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
