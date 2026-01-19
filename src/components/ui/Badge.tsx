'use client'

import clsx from 'clsx'
import { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'bad' | 'mvp' | 'pig' | 'pigLoading' | 'rank'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

/**
 * Unified badge component with consistent styling
 * Used for match labels, pig scores, ranks, etc.
 */
export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const isMvp = variant === 'mvp'
  const isBad = variant === 'bad'
  const isPig = variant === 'pig'
  const isPigLoading = variant === 'pigLoading'
  const isRank = variant === 'rank'
  
  // gradient border wrapper classes
  const wrapperClasses = clsx(
    'p-[1.5px] rounded-full flex-shrink-0',
    isPigLoading 
      ? 'bg-gradient-to-b from-abyss-500 to-abyss-700'
      : 'bg-gradient-to-b from-gold-light to-gold-dark'
  )
  
  // inner badge classes
  const innerClasses = clsx(
    'rounded-full px-2.5 py-1.5 text-[9px] leading-none flex items-center whitespace-nowrap uppercase tracking-wide',
    isMvp ? 'font-bold bg-gold-dark/40' : 'font-semibold',
    isBad && 'bg-worst-dark',
    !isMvp && !isBad && 'bg-abyss-700',
    className
  )
  
  return (
    <div className={wrapperClasses}>
      <div className={innerClasses}>
        {children}
      </div>
    </div>
  )
}

// convenience exports for common badge patterns
export function PigBadge({ 
  score, 
  color 
}: { 
  score: number
  color: string 
}) {
  return (
    <Badge variant="pig">
      <span style={{ color }}>{score}</span>
      <span className="text-white ml-1">PIG</span>
    </Badge>
  )
}

export function PigLoadingBadge() {
  return (
    <Badge variant="pigLoading">
      <span className="text-abyss-400">PIG</span>
    </Badge>
  )
}

export function RankBadge({ rank }: { rank: number }) {
  return (
    <Badge variant="rank">
      <span className="text-text-muted">#{rank}</span>
    </Badge>
  )
}

export function LabelBadge({ 
  label, 
  isBad = false,
  isMvp = false,
  count 
}: { 
  label: string
  isBad?: boolean
  isMvp?: boolean
  count?: number 
}) {
  const variant: BadgeVariant = isMvp ? 'mvp' : isBad ? 'bad' : 'default'
  
  return (
    <Badge variant={variant}>
      <span className="text-white">{label}</span>
      {count && count > 1 && (
        <span className="text-gold-light ml-1">×{count}</span>
      )}
    </Badge>
  )
}
