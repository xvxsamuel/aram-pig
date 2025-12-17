'use client'

import { ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  /** card title - optional, if not provided no header is shown */
  title?: string
  children: ReactNode
  /** optional click handler for title (makes it a button) */
  onTitleClick?: () => void
  /** extra classes for the wrapper div */
  className?: string
  /** extra classes for the content area */
  contentClassName?: string
  /** hide the divider line */
  hideDivider?: boolean
  /** right side header content (e.g., filter dropdown) */
  headerRight?: ReactNode
  /** custom padding (default: px-4.5 py-2 to match ProfileCard) */
  padding?: string
  /** variant for different bg colors */
  variant?: 'default' | 'worst'
  /** extra classes for the padding wrapper */
  paddingClassName?: string
}

/**
 * Reusable card component for consistent styling across the app.
 * Provides consistent border, background, padding, and optional header with divider.
 */
export default function Card({
  title,
  children,
  onTitleClick,
  className = '',
  contentClassName = '',
  hideDivider = false,
  headerRight,
  padding = 'px-4.5 py-2',
  variant = 'default',
  paddingClassName = '',
}: Props) {
  const TitleElement = onTitleClick ? 'button' : 'div'

  return (
    <div
      className={clsx(
        'rounded-lg border border-gold-dark/40',
        variant === 'default' ? 'bg-abyss-600' : 'bg-worst-dark',
        className
      )}
    >
      <div className={clsx(padding, paddingClassName)}>
        {title && (
          <>
            <div className="flex items-center justify-between gap-4 pb-1.5 relative z-20">
              <TitleElement
                onClick={onTitleClick}
                className={clsx(
                  'text-lg font-semibold text-left flex-shrink-0',
                  onTitleClick && 'cursor-pointer transition-colors hover:text-gold-light'
                )}
              >
                <h2>{title}</h2>
              </TitleElement>
              {headerRight}
            </div>
            {!hideDivider && (
              <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-3 -mx-4.5" />
            )}
          </>
        )}
        <div className={clsx('pb-1', contentClassName)}>{children}</div>
      </div>
    </div>
  )
}
