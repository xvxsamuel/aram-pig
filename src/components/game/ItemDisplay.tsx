'use client'

import ItemIcon from '@/components/ui/ItemIcon'
import { getWinrateColor } from '@/lib/ui'
import type { ItemStat, StarterBuild } from '@/types/champion-stats'

interface ItemWithStatsProps {
  item: ItemStat
  ddragonVersion: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showStats?: boolean
}

export function ItemWithStats({ item, ddragonVersion, size = 'xl', showStats = true }: ItemWithStatsProps) {
  // Handle special cases (no boots)
  if (item.item_id === -1 || item.item_id === -2) {
    return (
      <div className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl text-gray-500">∅</span>
          </div>
          {showStats && (
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-subtitle">Pick</span>
                <span className="font-bold">{item.pickrate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-subtitle">Win</span>
                <span className="font-bold" style={{ color: getWinrateColor(item.winrate) }}>
                  {item.winrate.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
      <div className="flex items-center gap-3">
        <ItemIcon
          itemId={item.item_id}
          ddragonVersion={ddragonVersion}
          size={size}
          className="bg-abyss-800 border-gray-700 flex-shrink-0"
        />
        {showStats && (
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-subtitle">Pick</span>
              <span className="font-bold">{item.pickrate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-subtitle">Win</span>
              <span className="font-bold" style={{ color: getWinrateColor(item.winrate) }}>
                {item.winrate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ItemGridProps {
  items: ItemStat[]
  ddragonVersion: string
  columns?: 2 | 3 | 4
  maxItems?: number
}

export function ItemGrid({ items, ddragonVersion, columns = 4, maxItems = 8 }: ItemGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-3`}>
      {items.slice(0, maxItems).map(item => (
        <ItemWithStats key={item.item_id} item={item} ddragonVersion={ddragonVersion} />
      ))}
    </div>
  )
}

interface StarterBuildDisplayProps {
  build: StarterBuild
  ddragonVersion: string
}

export function StarterBuildDisplay({ build, ddragonVersion }: StarterBuildDisplayProps) {
  // Group duplicate items and count them
  const itemCounts = new Map<number, number>()
  build.items.forEach(itemId => {
    itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
  })

  return (
    <div className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {Array.from(itemCounts.entries()).map(([itemId, count], itemIdx) => (
            <div key={itemIdx} className="relative">
              <ItemIcon
                itemId={itemId}
                ddragonVersion={ddragonVersion}
                size="lg"
                className="bg-abyss-800 border-gray-700 flex-shrink-0"
              />
              {count > 1 && (
                <div className="absolute bottom-0 right-0 bg-abyss-900 border border-gray-700 rounded-tl px-1 text-[10px] font-bold text-white leading-tight">
                  {count}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-subtitle">Pick</span>
            <span className="font-bold">{build.pickrate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-subtitle">Win</span>
            <span className="font-bold" style={{ color: getWinrateColor(build.winrate) }}>
              {build.winrate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
