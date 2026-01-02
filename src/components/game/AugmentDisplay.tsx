'use client'

import AugmentTooltip from '@/components/ui/AugmentTooltip'

// augment tier colors: Silver, Gold, Prismatic -> light purple
const AUGMENT_TIER_COLORS: Record<string, string> = {
  Silver: '#c084fc',    // light purple
  Gold: '#c084fc',      // light purple  
  Prismatic: '#c084fc', // light purple
}

interface AugmentDisplayProps {
  augmentName: string
  tier?: string
  showTooltip?: boolean
  className?: string
}

export default function AugmentDisplay({
  augmentName,
  tier = 'Silver',
  showTooltip = true,
  className = '',
}: AugmentDisplayProps) {
  const textColor = AUGMENT_TIER_COLORS[tier] || '#c084fc'

  const content = (
    <span 
      className={`font-semibold cursor-default ${className}`}
      style={{ color: textColor }}
    >
      {augmentName}
    </span>
  )

  if (!showTooltip) {
    return content
  }

  return (
    <AugmentTooltip augmentName={augmentName}>
      {content}
    </AugmentTooltip>
  )
}
