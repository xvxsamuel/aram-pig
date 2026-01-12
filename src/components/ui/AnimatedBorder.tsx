'use client'

import { motion } from 'motion/react'
import { useState, useEffect, type ReactNode } from 'react'

interface BorderColors {
  from: string
  to: string
}

interface Props {
  children: ReactNode
  defaultBorder?: string
  specialBorder?: BorderColors | null
  className?: string
  innerClassName?: string
  showGlint?: boolean
  glintTrigger?: 'auto' | 'hover'
  borderRadius?: 'sm' | 'md' | 'lg' | 'xl'
}

/**
 * animated border wrapper component
 * used for winstreak borders on profile icons and tier borders on champion portraits
 */
export default function AnimatedBorder({
  children,
  defaultBorder = 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))',
  specialBorder = null,
  className = '',
  innerClassName = '',
  showGlint = false,
  glintTrigger = 'auto',
  borderRadius = 'lg',
}: Props) {
  const [animateColor, setAnimateColor] = useState(false)
  const [glintKey, setGlintKey] = useState(0)

  const radiusClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
  }

  const radiusClass = radiusClasses[borderRadius]

  // trigger animation when specialBorder changes from null to a value
  useEffect(() => {
    if (specialBorder) {
      setAnimateColor(false)
      const timer = setTimeout(() => setAnimateColor(true), 100)
      return () => clearTimeout(timer)
    } else {
      setAnimateColor(false)
    }
  }, [specialBorder])

  const handleMouseEnter = () => {
    if (glintTrigger === 'hover' && showGlint && specialBorder) {
      setGlintKey(k => k + 1)
    }
  }

  return (
    <div className={`relative ${className}`} onMouseEnter={handleMouseEnter}>
      <div className={`${radiusClass} p-px relative overflow-hidden`} style={{ background: defaultBorder }}>
        {/* animated color overlay */}
        {specialBorder && (
          <div
            className={`absolute inset-0 ${radiusClass} transition-transform duration-500 ease-out`}
            style={{
              background: `linear-gradient(to bottom, ${specialBorder.from}, ${specialBorder.to})`,
              transform: animateColor ? 'translateY(0)' : 'translateY(100%)',
            }}
          />
        )}
        {/* glint effect for special borders */}
        {showGlint && specialBorder && animateColor && (
          <motion.div
            key={glintKey}
            className={`absolute top-0 bottom-0 ${radiusClass} pointer-events-none z-10`}
            animate={{
              left: ['-35%', '135%'],
              opacity: [0, 0.5, 0.6, 0.5, 0],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              repeatDelay: 3,
              ease: 'easeInOut',
              times: [0, 0.2, 0.5, 0.8, 1],
            }}
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 35%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.2) 65%, transparent)',
              width: '40%',
            }}
          />
        )}
        <div className={`rounded-[inherit] relative ${innerClassName}`}>{children}</div>
      </div>
    </div>
  )
}
