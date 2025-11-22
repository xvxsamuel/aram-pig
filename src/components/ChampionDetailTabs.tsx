'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import Tooltip from './Tooltip'
import { getItemImageUrl, getRuneImageUrl, getSummonerSpellUrl } from '@/lib/ddragon-client'
import { getWinrateColor } from '@/lib/winrate-colors'
import runesData from '@/data/runes.json'

interface ItemStat {
  item_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface StarterBuild {
  starter_build: string // Comma-separated item IDs
  items: number[] // Array of item IDs
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

interface SummonerSpellStat {
  spell1_id: number
  spell2_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface PreCalculatedCombo {
  normalizedItems: number[]
  actualBoots: number[]
  games: number
  wins: number
  itemStats: Record<number, { games: number; wins: number }>
}

interface Props {
  itemsBySlot: Record<number, ItemStat[]>
  bootsItems: ItemStat[]
  starterItems: StarterBuild[]
  runeStats: Record<number, RuneStat[]>
  abilityLevelingStats: AbilityLevelingStat[]
  summonerSpellStats: SummonerSpellStat[]
  ddragonVersion: string
  totalGames: number
  buildOrders: string[]
  allBuildData: PreCalculatedCombo[]
}

export default function ChampionDetailTabs({ itemsBySlot, bootsItems, starterItems, runeStats, abilityLevelingStats, summonerSpellStats, ddragonVersion, totalGames, buildOrders, allBuildData }: Props) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'items' | 'runes' | 'leveling'>('overview')
  const [selectedCombo, setSelectedCombo] = useState<number | null>(null)

  console.log('ChampionDetailTabs: allBuildData length:', allBuildData?.length, 'selectedCombo:', selectedCombo)

  // Transform pre-calculated combinations into display format
  const itemCombinations = (() => {
    if (!allBuildData || allBuildData.length === 0) {
      return []
    }
    
    console.log('[DEBUG] Starting itemCombinations transformation, allBuildData:', allBuildData.length)
    console.log('[DEBUG] First combo normalizedItems:', allBuildData[0]?.normalizedItems)
    console.log('[DEBUG] itemsBySlot keys:', Object.keys(itemsBySlot))
    
    const combinations = allBuildData
      .map((combo, idx) => {
        // Create item stats for each normalized item
        const itemStats = combo.normalizedItems.map(itemId => {
          if (itemId === 10010) {
            // 10010 is the normalized boots placeholder
            const totalBootsGames = bootsItems.reduce((sum, b) => sum + b.games, 0)
            const totalBootsWins = bootsItems.reduce((sum, b) => sum + b.wins, 0)
            return {
              item_id: 10010,
              games: totalBootsGames,
              wins: totalBootsWins,
              winrate: totalBootsGames > 0 ? (totalBootsWins / totalBootsGames) * 100 : 0,
              pickrate: totalGames > 0 ? (totalBootsGames / totalGames) * 100 : 0
            }
          }
          
          // Find item stats from itemsBySlot
          for (const slotItems of Object.values(itemsBySlot)) {
            const found = slotItems.find(i => i.item_id === itemId)
            if (found) return found
          }
          if (idx === 0) {
            console.log('[DEBUG] Could not find item in itemsBySlot:', itemId)
          }
          return null
        }).filter(Boolean) as ItemStat[]
        
        // Skip if we couldn't find all items
        if (itemStats.length !== combo.normalizedItems.length) {
          if (idx === 0) {
            console.log('[DEBUG] Skipping combo, itemStats length:', itemStats.length, 'normalizedItems length:', combo.normalizedItems.length)
          }
          return null
        }
        
        // Get actual boot items with their stats
        const actualBootItems = combo.actualBoots
          .map(bootId => bootsItems.find(b => b.item_id === bootId))
          .filter(Boolean) as ItemStat[]
        
        const avgWinrate = combo.games > 0 ? (combo.wins / combo.games) * 100 : 0
        const pickrate = totalGames > 0 ? (combo.games / totalGames) * 100 : 0
        
        if (idx === 0) {
          console.log('[DEBUG] Created combo with games:', combo.games, 'avgWinrate:', avgWinrate, 'pickrate:', pickrate)
        }
        
        return {
          items: itemStats,
          hasBoots: combo.normalizedItems.includes(10010),
          actualBootItems: actualBootItems,
          estimatedGames: combo.games,
          avgWinrate,
          buildOrder: [0, 1, 2],
          pickrate
        }
      })
      .filter(Boolean) as Array<{
        items: ItemStat[]
        hasBoots: boolean
        actualBootItems: ItemStat[]
        estimatedGames: number
        avgWinrate: number
        buildOrder: number[]
        pickrate: number
      }>
    
    console.log('[DEBUG] After mapping, combinations length:', combinations.length)
    console.log('[DEBUG] First combo estimatedGames:', combinations[0]?.estimatedGames)
    
    // Sort by games and take top 5 with at least 2 games
    return combinations
      .filter(c => c.estimatedGames >= 2)
      .sort((a, b) => b.estimatedGames - a.estimatedGames)
      .slice(0, 5)
  })()

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
          onClick={() => setSelectedTab('overview')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'overview'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Overview
        </button>
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

      {/* Overview Tab */}
      {selectedTab === 'overview' && (
      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Item Combinations */}
        <div className="col-span-12 lg:col-span-3 xl:col-span-3">
          <div className="bg-abyss-700 rounded-lg p-4 sticky top-4">
            <div className="text-sm text-subtitle mb-3">Select a combination</div>
            <div className="space-y-2">
              {itemCombinations.map((combo, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedCombo(selectedCombo === idx ? null : idx)}
                  className={clsx(
                    'w-full text-left p-3 rounded transition-colors',
                    selectedCombo === idx
                      ? 'bg-accent-light/20 border-2 border-accent-light'
                      : 'bg-abyss-800 hover:bg-abyss-900'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {/* Show non-boot items */}
                    {combo.items.filter(item => item.item_id !== 10010).map((item, position) => (
                      <div key={position} className="flex items-center gap-1">
                        {position > 0 && <span className="text-gray-600 text-xs">+</span>}
                        <Tooltip id={item.item_id} type="item">
                          <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 overflow-hidden flex-shrink-0">
                            <Image
                              src={getItemImageUrl(item.item_id, ddragonVersion)}
                              alt=""
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                      </div>
                    ))}
                    
                    {/* Show "Any Boots" placeholder if combo includes boots */}
                    {combo.hasBoots && (
                      <>
                        <span className="text-gray-600 text-xs">+</span>
                        <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] text-gray-400 text-center leading-tight px-0.5">Any<br/>Boots</span>
                        </div>
                      </>
                    )}
                    
                    {/* Show "No Boots" if explicitly marked */}
                    {combo.items.some(item => item.item_id === -2) && (
                      <>
                        <span className="text-gray-600 text-xs">+</span>
                        <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] text-gray-400 text-center leading-tight px-0.5">No<br/>Boots</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex justify-between text-xs">
                    <span className="font-bold" style={{ color: getWinrateColor(combo.avgWinrate) }}>
                      {combo.avgWinrate.toFixed(1)}%
                    </span>
                    <span className="text-subtitle">{Math.round(combo.estimatedGames).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="col-span-12 lg:col-span-9 xl:col-span-9 space-y-6">
          {/* Items Section - 6 numbered slots like aramstats.lol */}
          <div className="bg-abyss-700 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-6">Items</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {[1, 2, 3, 4, 5, 6].map((slotNum) => {
                const slotIdx = slotNum - 1
                let items = itemsBySlot[slotIdx] || []
                
                // When a combo is selected, filter to only show items from that specific combination
                if (selectedCombo !== null && itemCombinations[selectedCombo]) {
                  const selectedCombination = allBuildData[selectedCombo]
                  if (selectedCombination && selectedCombination.itemStats) {
                    // Only show items that appear in this combination's stats
                    items = items
                      .filter(item => selectedCombination.itemStats[item.item_id])
                      .map(item => {
                        const comboItemStat = selectedCombination.itemStats[item.item_id]
                        return {
                          ...item,
                          games: comboItemStat.games,
                          wins: comboItemStat.wins,
                          winrate: comboItemStat.games > 0 ? (comboItemStat.wins / comboItemStat.games) * 100 : 0,
                          pickrate: selectedCombination.games > 0 
                            ? (comboItemStat.games / selectedCombination.games) * 100 
                            : 0
                        }
                      })
                      .sort((a, b) => b.pickrate - a.pickrate)
                  }
                }
                
                // Get combo item IDs for highlighting
                const comboItemIds = selectedCombo !== null && itemCombinations[selectedCombo]
                  ? itemCombinations[selectedCombo].items.map(item => item.item_id)
                  : []
                
                return (
                  <div key={slotNum}>
                    <div className="text-center text-2xl font-bold mb-3 text-white">
                      {slotNum}
                    </div>
                    <div className="space-y-2">
                      {items && items.length > 0 ? (
                        items.slice(0, 6).map((item) => {
                          const isInCombo = comboItemIds.length > 0 && comboItemIds.includes(item.item_id)
                          return (
                            <div key={item.item_id} className="text-center">
                              <Tooltip id={item.item_id} type="item">
                                <div className={`w-12 h-12 rounded bg-abyss-800 overflow-hidden mx-auto mb-1 hover:border-accent-light transition-colors cursor-pointer ${
                                  isInCombo ? 'border-2 border-accent-light ring-2 ring-accent-light/30' : 'border border-gray-700'
                                }`}>
                                  {item.item_id === -1 ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <span className="text-xl text-gray-500">∅</span>
                                    </div>
                                  ) : (
                                    <Image
                                      src={getItemImageUrl(item.item_id, ddragonVersion)}
                                      alt=""
                                      width={48}
                                      height={48}
                                      className="w-full h-full object-cover"
                                      unoptimized
                                    />
                                  )}
                                </div>
                              </Tooltip>
                              <div className="text-xs">
                                <div className="font-bold" style={{ color: getWinrateColor(item.winrate) }}>
                                  {item.winrate.toFixed(1)}%
                                </div>
                                <div className="text-subtitle">{item.games.toLocaleString()}</div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-center text-sm text-abyss-200">No data</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Starting Items, Spells, Level Order Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Starting Items */}
            <div className="bg-abyss-700 rounded-lg p-4">
              <h4 className="font-bold mb-3 text-gold-light">Starting Items</h4>
              {starterItems.length > 0 ? (
                <div className="space-y-2">
                  {starterItems.slice(0, 1).map((build, idx) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-center">
                      {build.items.map((itemId, itemIdx) => (
                        <Tooltip key={itemIdx} id={itemId} type="item">
                          <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                            <Image
                              src={getItemImageUrl(itemId, ddragonVersion)}
                              alt=""
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                      ))}
                      <div className="text-[10px] text-subtitle ml-2">{build.pickrate.toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No data</div>
              )}
            </div>

            {/* Summoner Spells */}
            <div className="bg-abyss-700 rounded-lg p-4">
              <h4 className="font-bold mb-3 text-gold-light">Spells</h4>
              {summonerSpellStats.length > 0 ? (
                <div>
                  <div className="flex gap-2 mb-2 text-sm">
                    <div className="text-white font-bold" style={{ color: getWinrateColor(summonerSpellStats[0].winrate) }}>
                      {summonerSpellStats[0].winrate.toFixed(1)}%
                    </div>
                    <div className="text-subtitle">{summonerSpellStats[0].games.toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <Tooltip id={summonerSpellStats[0].spell1_id} type="summoner-spell">
                      <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                        <Image
                          src={getSummonerSpellUrl(summonerSpellStats[0].spell1_id, ddragonVersion)}
                          alt=""
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                    <Tooltip id={summonerSpellStats[0].spell2_id} type="summoner-spell">
                      <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                        <Image
                          src={getSummonerSpellUrl(summonerSpellStats[0].spell2_id, ddragonVersion)}
                          alt=""
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500">No data</div>
              )}
            </div>

            {/* Level Order */}
            <div className="bg-abyss-700 rounded-lg p-4">
              <h4 className="font-bold mb-3 text-gold-light">Level Order</h4>
              {abilityLevelingStats.length > 0 && (
                <div>
                  <div className="flex gap-2 mb-2 text-sm">
                    <div className="text-white font-bold" style={{ color: getWinrateColor(abilityLevelingStats[0].winrate) }}>
                      {abilityLevelingStats[0].winrate.toFixed(1)}%
                    </div>
                    <div className="text-subtitle">{abilityLevelingStats[0].games.toLocaleString()}</div>
                  </div>
                  <div className="flex gap-0.5 flex-wrap">
                    {abilityLevelingStats[0].ability_order.split(' ').slice(0, 18).map((ability, idx) => (
                      <div key={idx} className="w-5 h-5 flex items-center justify-center rounded bg-abyss-800 border border-gray-700">
                        <span className={clsx(
                          'text-[10px] font-bold',
                          ability === 'R' ? 'text-gold-light' : 'text-white'
                        )}>{ability}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Runes Grid */}
          <div className="bg-abyss-700 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-6">Runes</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {runeStats[0] && runeStats[0].slice(0, 12).map((rune) => {
                const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                
                return (
                  <div key={rune.rune_id} className="text-center">
                    <Tooltip id={rune.rune_id} type="rune">
                      <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 overflow-hidden mx-auto mb-2 hover:border-accent-light transition-colors cursor-pointer">
                        {runeInfo?.icon && (
                          <Image
                            src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                            alt=""
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        )}
                      </div>
                    </Tooltip>
                    <div className="text-xs">
                      <div className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>
                        {rune.winrate.toFixed(1)}%
                      </div>
                      <div className="text-subtitle">{rune.games.toLocaleString()}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Items Tab */}
      {selectedTab === 'items' && (
        <div className="space-y-6">
          {/* Starter Items Section */}
          {starterItems.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-3">Starter Items</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {starterItems.slice(0, 10).map((build, idx) => {
                  // Group duplicate items and count them
                  const itemCounts = new Map<number, number>()
                  build.items.forEach(itemId => {
                    itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
                  })
                  
                  return (
                    <div key={idx} className="bg-abyss-700 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {Array.from(itemCounts.entries()).map(([itemId, count], itemIdx) => (
                            <Tooltip key={itemIdx} id={itemId} type="item">
                              <div className="relative w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                                <Image
                                  src={getItemImageUrl(itemId, ddragonVersion)}
                                  alt="Item"
                                  width={40}
                                  height={40}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                                {count > 1 && (
                                  <div className="absolute bottom-0 right-0 bg-abyss-900 border border-gray-700 rounded-tl px-1 text-[10px] font-bold text-white leading-tight">
                                    {count}
                                  </div>
                                )}
                              </div>
                            </Tooltip>
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
            </div>
          )}

          {/* Boots Section */}
          {bootsItems.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-3">Boots</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {bootsItems.map((item) => (
                  <div key={item.item_id} className="bg-abyss-700 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {item.item_id === -1 || item.item_id === -2 ? (
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
