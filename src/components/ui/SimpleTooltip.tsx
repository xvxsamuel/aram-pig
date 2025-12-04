'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface SimpleTooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'auto'
  forceVisible?: boolean
}

export default function SimpleTooltip({
  content,
  children,
  position = 'auto',
  forceVisible = false,
}: SimpleTooltipProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [actualPosition, setActualPosition] = useState<'top' | 'bottom'>('top')
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const isVisible = isHovered || forceVisible

  // wait for client-side mount for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isVisible || !triggerRef.current) return

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = rect.left + rect.width / 2
      
      // determine position based on available space
      let finalPosition: 'top' | 'bottom' = position === 'auto' ? 'top' : position
      
      if (position === 'auto') {
        // estimate tooltip height (use actual if available, otherwise estimate)
        const tooltipHeight = tooltipRef.current?.offsetHeight || 100
        const spaceAbove = rect.top
        const spaceBelow = window.innerHeight - rect.bottom
        
        // prefer top, but flip to bottom if not enough space above
        if (spaceAbove < tooltipHeight + 16 && spaceBelow > spaceAbove) {
          finalPosition = 'bottom'
        } else {
          finalPosition = 'top'
        }
      }
      
      setActualPosition(finalPosition)
      const y = finalPosition === 'top' ? rect.top : rect.bottom
      setTooltipPosition({ x, y })
    }

    updatePosition()
    
    // update position after a brief delay to get actual tooltip dimensions
    const timeoutId = setTimeout(updatePosition, 10)
    
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isVisible, position])

  const tooltipContent =
    isVisible && mounted
      ? createPortal(
          <div
            ref={tooltipRef}
            className="fixed pointer-events-none"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: actualPosition === 'top' ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)',
              zIndex: 99999,
            }}
          >
            <div className="bg-abyss-900 border border-gold-dark/80 rounded-lg px-3 py-2 shadow-xl max-w-[90vw] overflow-x-auto">
              {content}
            </div>
            {/* triangle - points down when tooltip is above, points up when tooltip is below */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 ${
                actualPosition === 'top' ? 'top-full -mt-px' : 'bottom-full -mb-px'
              }`}
            >
              <div 
                className={`border-8 border-transparent ${
                  actualPosition === 'top' 
                    ? 'border-t-gold-dark/80' 
                    : 'border-b-gold-dark/80'
                }`} 
              />
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
      </div>
      {tooltipContent}
    </>
  )
}
