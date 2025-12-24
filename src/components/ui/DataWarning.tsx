'use client'

import clsx from 'clsx'
import SimpleTooltip from '@/components/ui/SimpleTooltip'

interface DataWarningProps {
  usedFallbackPatch?: boolean
  usedCoreStats?: boolean
  usedFallbackCore?: boolean
  className?: string
  warnings?: string[]
}

export default function DataWarning({
  usedFallbackPatch,
  usedCoreStats,
  usedFallbackCore,
  className,
  warnings: customWarnings
}: DataWarningProps) {
  const warnings: string[] = customWarnings || []

  if (!customWarnings) {
    if (usedFallbackPatch) {
      warnings.push("Using data from older patches due to low sample size")
    }
    // If usedCoreStats is explicitly false (and not undefined), it means we fell back to global stats
    if (usedCoreStats === false) {
      warnings.push("Using champion-wide data due to low sample size for this build")
    } else if (usedFallbackCore) {
      warnings.push("Using data from a similar core build due to low sample size")
    }
  }

  if (warnings.length === 0) return null

  return (
    <SimpleTooltip content={
      <div className="flex flex-col gap-1">
        {warnings.map((w, i) => (
          <span key={i} className="text-xs text-white">{w}</span>
        ))}
      </div>
    }>
      <div className={clsx("cursor-help flex items-center justify-center text-gold-light", className)}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
    </SimpleTooltip>
  )
}
