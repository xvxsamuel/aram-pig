'use client'

import AugmentIcon from '@/components/ui/AugmentIcon'
import { getWinrateColor } from '@/lib/ui'

// Stats display component (reusable)
function StatsDisplay({ pickrate, winrate }: { pickrate: number; winrate: number }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-subtitle">Pick</span>
        <span className="font-bold">{pickrate.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-subtitle">Win</span>
        <span className="font-bold" style={{ color: getWinrateColor(winrate) }}>
          {winrate.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

interface AugmentStat {
  augment_name: string
  pickrate: number
  winrate: number
  games: number
}

interface AugmentWithStatsProps {
  augment: AugmentStat
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showStats?: boolean
}

/**
 * Augment icon with stats display (similar to ItemWithStats)
 */
export function AugmentWithStats({ augment, size = 'xl', showStats = true }: AugmentWithStatsProps) {
  return (
    <div className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
      <div className="flex items-center gap-3">
        <AugmentIcon
          augmentName={augment.augment_name}
          size={size}
          className="flex-shrink-0"
        />
        {showStats && <StatsDisplay pickrate={augment.pickrate} winrate={augment.winrate} />}
      </div>
    </div>
  )
}

interface AugmentGridProps {
  augments: AugmentStat[]
  columns?: 2 | 3 | 4
  maxAugments?: number
}

/**
 * Grid of augments with stats (similar to ItemGrid)
 */
export function AugmentGrid({ augments: augmentList, columns = 4, maxAugments = 8 }: AugmentGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  } as const

  return (
    <div className={`grid ${gridCols[columns]} gap-3`}>
      {augmentList.slice(0, maxAugments).map((augment, idx) => (
        <AugmentWithStats key={`${augment.augment_name}-${idx}`} augment={augment} />
      ))}
    </div>
  )
}
