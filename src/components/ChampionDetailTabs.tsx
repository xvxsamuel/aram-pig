'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import Tooltip from './Tooltip'
import { getItemImageUrl, getRuneImageUrl } from '@/lib/ddragon-client'
import { getWinrateColor } from '@/lib/winrate-colors'
import runesData from '@/data/runes.json'

interface ItemStat {
  item_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface RuneStat {
  rune_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface AbilityLevelingStat {
  ability_order: string
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface Props {
  itemsBySlot: Record<number, ItemStat[]>
  bootsItems: ItemStat[]
  runeStats: Record<number, RuneStat[]>
  abilityLevelingStats: AbilityLevelingStat[]
  ddragonVersion: string
}

export default function ChampionDetailTabs({ itemsBySlot, bootsItems, runeStats, abilityLevelingStats, ddragonVersion }: Props) {
  const [selectedTab, setSelectedTab] = useState<'items' | 'runes' | 'leveling'>('items')

  const slotNames = [
    'Keystone',
    'Slot 1',
    'Slot 2', 
    'Slot 3',
    'Slot 4',
    'Slot 5'
  ]

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-gold-dark/40">
        <button
          onClick={() => setSelectedTab('items')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'items'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Items
        </button>
        <button
          onClick={() => setSelectedTab('runes')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'runes'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Runes
        </button>
        <button
          onClick={() => setSelectedTab('leveling')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'leveling'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Leveling Order
        </button>
      </div>

      {/* Items Tab */}
      {selectedTab === 'items' && (
        <div className="space-y-6">
          {/* Boots Section */}
          {bootsItems.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-3">Boots</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {bootsItems.map((item) => (
                  <div key={item.item_id} className="bg-abyss-700 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {item.item_id === -1 ? (
                        <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl text-gray-500">∅</span>
                        </div>
                      ) : (
                        <Tooltip id={item.item_id} type="item">
                          <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                            <Image
                              src={getItemImageUrl(item.item_id, ddragonVersion)}
                              alt="Item"
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
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
            </div>
          )}

          {/* Item Slots */}
          {[0, 1, 2, 3, 4].map((slot) => {
            const items = itemsBySlot[slot]
            if (!items || items.length === 0) return null

            return (
              <div key={slot}>
                <h3 className="text-xl font-bold mb-3">
                  {slot === 0 ? 'Slot 1' : `Slot ${slot + 1}`}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.slice(0, 8).map((item) => (
                    <div key={item.item_id} className="bg-abyss-700 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <Tooltip id={item.item_id} type="item">
                          <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                            <Image
                              src={getItemImageUrl(item.item_id, ddragonVersion)}
                              alt="Item"
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
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
              </div>
            )
          })}
        </div>
      )}

      {/* Runes Tab */}
      {selectedTab === 'runes' && (
        <div className="space-y-6">
          {[0, 1, 2, 3, 4, 5].map(slot => {
            const runes = runeStats[slot] || []
            if (runes.length === 0) return null

            return (
              <div key={slot}>
                <h3 className="text-xl font-bold mb-3">{slotNames[slot]}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {runes.map((rune) => {
                    const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                    const runeName = runeInfo?.name || `Rune ${rune.rune_id}`
                    const runeIcon = runeInfo?.icon
                    
                    return (
                      <div key={rune.rune_id} className="bg-abyss-700 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <Tooltip id={rune.rune_id} type="rune">
                            <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                              {runeIcon ? (
                                <Image
                                  src={`https://ddragon.leagueoflegends.com/cdn/img/${runeIcon}`}
                                  alt={runeName}
                                  width={48}
                                  height={48}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                  onError={(e) => {
                                    // Show rune name if image fails to load
                                    const target = e.currentTarget
                                    target.style.display = 'none'
                                    const parent = target.parentElement
                                    if (parent) {
                                      parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-xs text-center px-1 text-white">${runeName}</div>`
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-center px-1 text-white">{runeName}</div>
                              )}
                            </div>
                          </Tooltip>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold mb-2 text-white">{runeName}</div>
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-sm font-semibold">Pickrate</span>
                              <span className="text-sm font-bold">{rune.pickrate.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                              <span className="text-sm font-semibold">Winrate</span>
                              <span className="text-sm font-bold" style={{ color: getWinrateColor(rune.winrate) }}>
                                {rune.winrate.toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-xs text-subtitle mt-1">
                              {rune.games.toLocaleString()} games
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {Object.keys(runeStats).length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No rune data available
            </div>
          )}
        </div>
      )}

      {/* Leveling Order Tab */}
      {selectedTab === 'leveling' && (
        <div className="space-y-6">
          {abilityLevelingStats.length > 0 ? (
            <>
              <div className="text-sm text-gray-400 mb-4">
                Most popular ability leveling orders
              </div>
              {abilityLevelingStats.map((stat, idx) => (
                <div key={idx} className="bg-abyss-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-4 text-sm">
                      <span className="text-subtitle">Pick: <span className="font-bold text-white">{stat.pickrate.toFixed(1)}%</span></span>
                      <span className="text-subtitle">Win: <span className="font-bold" style={{ color: getWinrateColor(stat.winrate) }}>{stat.winrate.toFixed(1)}%</span></span>
                      <span className="text-subtitle">Games: <span className="font-bold text-white">{stat.games.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {stat.ability_order.split(' ').map((ability, abilityIdx) => (
                      <div key={abilityIdx} className="flex items-center justify-center w-8 h-8 rounded bg-abyss-800 border border-gray-700">
                        <span className={clsx(
                          'text-xs font-bold',
                          ability === 'R' ? 'text-gold-light' : 'text-white'
                        )}>{ability}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-center text-gray-400 py-8">
              No leveling order data available yet. Data is collected from recent profile updates.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
