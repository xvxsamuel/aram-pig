'use client'

import Card from '@/components/ui/Card'
import ItemIcon from '@/components/ui/ItemIcon'
import { getWinrateColor } from '@/lib/ui'
import type { ItemStat, StarterBuild } from '@/types/champion-stats'

interface ItemsTabProps {
  starterItems: StarterBuild[]
  bootsItems: ItemStat[]
  itemsBySlot: Record<number, ItemStat[]>
  ddragonVersion: string
}

export function ItemsTab({ starterItems, bootsItems, itemsBySlot, ddragonVersion }: ItemsTabProps) {
  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Starter Items Section */}
      {starterItems.length > 0 && (
        <Card title="Starter Items">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {starterItems.slice(0, 10).map((build, idx) => {
              // Group duplicate items and count them
              const itemCounts = new Map<number, number>()
              build.items.forEach(itemId => {
                itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
              })

              return (
                <div key={idx} className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
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
            })}
          </div>
        </Card>
      )}

      {/* Boots Section */}
      {bootsItems.length > 0 && (
        <Card title="Boots">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {bootsItems.map(item => (
              <div key={item.item_id} className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
                <div className="flex items-center gap-3">
                  {item.item_id === -1 || item.item_id === -2 ? (
                    <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl text-gray-500">∅</span>
                    </div>
                  ) : (
                    <ItemIcon
                      itemId={item.item_id}
                      ddragonVersion={ddragonVersion}
                      size="xl"
                      className="bg-abyss-800 border-gray-700 flex-shrink-0"
                    />
                  )}
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
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Item Slots */}
      {[0, 1, 2, 3, 4, 5].map(slot => {
        const items = itemsBySlot[slot]
        if (!items || items.length === 0) return null

        return (
          <Card key={slot} title={slot === 0 ? 'Slot 1' : `Slot ${slot + 1}`}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.slice(0, 8).map(item => (
                <div key={item.item_id} className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
                  <div className="flex items-center gap-3">
                    <ItemIcon
                      itemId={item.item_id}
                      ddragonVersion={ddragonVersion}
                      size="xl"
                      className="bg-abyss-800 border-gray-700 flex-shrink-0"
                    />
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
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
