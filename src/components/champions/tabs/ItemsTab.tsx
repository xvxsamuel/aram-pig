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

interface ItemRowProps {
  title: string
  items: ItemStat[]
  ddragonVersion: string
  isStarter?: boolean
  starterBuilds?: StarterBuild[]
}

function ItemRow({ title, items, ddragonVersion, isStarter, starterBuilds }: ItemRowProps) {
  return (
    <Card title={title}>
      <div className="flex gap-3">
        <div className="flex flex-col space-y-1 text-[10px] text-subtitle pt-[52px]">
          <div className="h-[14px] leading-[14px]">Win Rate</div>
          <div className="h-[14px] leading-[14px]">Pick Rate</div>
          <div className="h-[14px] leading-[14px]">Games</div>
        </div>
        <div className="overflow-x-auto flex-1 -mr-4.5">
          <div className="flex gap-2 pr-4.5 pb-1">
            {isStarter && starterBuilds ? (
              starterBuilds.map((build, idx) => {
                const itemCounts = new Map<number, number>()
                build.items.forEach(itemId => {
                  itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
                })

                return (
                  <div key={idx} className="bg-abyss-700 rounded-lg p-2 flex-shrink-0">
                    <div className="flex flex-col">
                      <div className="flex gap-1 flex-wrap justify-center">
                        {Array.from(itemCounts.entries()).map(([itemId, count], itemIdx) => (
                          <div key={itemIdx} className="relative">
                            <ItemIcon itemId={itemId} ddragonVersion={ddragonVersion} size="lg" />
                            {count > 1 && (
                              <div className="absolute bottom-2 right-0 w-4 h-4 rounded-sm bg-abyss-900 border border-gold-dark flex items-center justify-center">
                                <span className="text-[9px] font-regular text-white leading-none">{count}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[10px] font-bold text-center" style={{ color: getWinrateColor(build.winrate) }}>
                          {build.winrate.toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-bold text-white text-center">
                          {build.pickrate.toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-bold text-text-muted text-center">
                          {build.games.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              items.map(item => (
                <div key={item.item_id} className="bg-abyss-700 rounded-lg p-2 flex-shrink-0">
                  <div className="flex flex-col gap-1">
                    {item.item_id === -1 || item.item_id === -2 ? (
                      <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 flex items-center justify-center mx-auto">
                        <span className="text-xl text-gray-500">∅</span>
                      </div>
                    ) : (
                      <ItemIcon itemId={item.item_id} ddragonVersion={ddragonVersion} size="lg" />
                    )}
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold text-center" style={{ color: getWinrateColor(item.winrate) }}>
                        {item.winrate.toFixed(1)}%
                      </div>
                      <div className="text-[10px] font-bold text-white text-center">
                        {item.pickrate.toFixed(1)}%
                      </div>
                      <div className="text-[10px] font-bold text-text-muted text-center">
                        {item.games.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function ItemsTab({ starterItems, bootsItems, itemsBySlot, ddragonVersion }: ItemsTabProps) {
  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* starter items */}
      {starterItems.length > 0 && (
        <ItemRow 
          title="Starter Items" 
          items={[]} 
          ddragonVersion={ddragonVersion} 
          isStarter 
          starterBuilds={starterItems} 
        />
      )}

      {/* boots */}
      {bootsItems.length > 0 && (
        <ItemRow title="Boots" items={bootsItems} ddragonVersion={ddragonVersion} />
      )}

      {/* item slots */}
      {[0, 1, 2, 3, 4, 5].map(slot => {
        const items = itemsBySlot[slot]
        if (!items || items.length === 0) return null
        return (
          <ItemRow key={slot} title={`Slot ${slot + 1}`} items={items} ddragonVersion={ddragonVersion} />
        )
      })}
    </div>
  )
}
