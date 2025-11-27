'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface SimpleTooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom'
  forceVisible?: boolean
}

export default function SimpleTooltip({ content, children, position = 'top', forceVisible = false }: SimpleTooltipProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)

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
      const y = position === 'top' ? rect.top : rect.bottom

      setTooltipPosition({ x, y })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isVisible, position])

  const tooltipContent = isVisible && mounted ? createPortal(
    <div
      className="fixed pointer-events-none"
      style={{
        left: `${tooltipPosition.x}px`,
        top: `${tooltipPosition.y}px`,
        transform: position === 'top' 
          ? 'translate(-50%, calc(-100% - 8px))'
          : 'translate(-50%, 8px)',
        zIndex: 99999
      }}
    >
      <div className="bg-abyss-900 border border-gold-dark/80 rounded-lg px-3 py-2 shadow-xl max-w-[90vw] overflow-x-auto">
        {content}
      </div>
      {/* triangle */}
      <div 
        className={`absolute left-1/2 -translate-x-1/2 ${
          position === 'top' ? 'top-full -mt-px' : 'bottom-full -mb-px rotate-180'
        }`}
      >
        <div className="border-8 border-transparent border-t-gold-dark/80" />
      </div>
    </div>,
    document.body
  ) : null

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
