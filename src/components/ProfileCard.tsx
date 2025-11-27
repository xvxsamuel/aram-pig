"use client"

import { ReactNode } from "react"

interface Props {
  title: string
  children: ReactNode
  /** optional click handler for title (makes it a button) */
  onTitleClick?: () => void
  /** extra classes for the content area */
  contentClassName?: string
  /** hide the divider line */
  hideDivider?: boolean
  /** right side header content (e.g., filter dropdown) */
  headerRight?: ReactNode
}

/**
 * standardized card component for profile page boxes.
 * provides consistent title styling, border, padding, and divider.
 */
export default function ProfileCard({ 
  title, 
  children, 
  onTitleClick,
  contentClassName = "",
  hideDivider = false,
  headerRight
}: Props) {
  const TitleElement = onTitleClick ? 'button' : 'div'
  
  return (
    <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
      <div className="px-4.5 py-2">
        <div className="flex items-center justify-between gap-4 pb-1.5 relative z-20">
          <TitleElement 
            onClick={onTitleClick}
            className={`text-xl font-bold text-left flex-shrink-0 ${onTitleClick ? 'cursor-pointer transition-colors hover:text-gold-light' : ''}`}
          >
            <h2>{title}</h2>
          </TitleElement>
          {headerRight}
        </div>
        {!hideDivider && (
          <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-3 -mx-4" />
        )}
        <div className={contentClassName}>
          {children}
        </div>
      </div>
    </div>
  )
}
