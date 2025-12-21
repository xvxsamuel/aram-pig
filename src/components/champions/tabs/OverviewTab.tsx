'use client'

import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import ItemIcon from '@/components/ui/ItemIcon'
import Card from '@/components/ui/Card'
import RuneTooltip from '@/components/ui/RuneTooltip'
import SummonerSpellTooltip from '@/components/ui/SummonerSpellTooltip'
import ChampionAbility from '@/components/ui/ChampionAbility'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { CoreBuildsSelector } from './CoreBuildsSelector'
import { getWinrateColor } from '@/lib/ui'
import { getSummonerSpellUrl } from '@/lib/ddragon'
import { RUNE_TREES, STAT_PERKS } from '@/lib/game/runes'
import { getAbilityMaxOrder } from './utils'
import runesData from '@/data/runes.json'
import type { RuneStat, StatPerkStat, StarterBuild, SummonerSpellStat, AbilityLevelingStat } from '@/types/champion-stats'

export interface ComboDisplay {
  originalIndex: number
  itemIds: number[]
  hasBoots: boolean
  games: number
  winrate: number
  wilsonScore: number
}

export interface ComboData {
  itemStats: Record<number, { positions: Record<number, { games: number; wins: number }> }>
  runes?: {
    primary?: Record<string, { games: number; wins: number }>
    secondary?: Record<string, { games: number; wins: number }>
    tertiary?: {
      offense?: Record<string, { games: number; wins: number }>
      flex?: Record<string, { games: number; wins: number }>
      defense?: Record<string, { games: number; wins: number }>
    }
  }
  spells?: Record<string, { games: number; wins: number }>
  starting?: Record<string, { games: number; wins: number }>
  skills?: Record<string, { games: number; wins: number }>
}

interface OverviewTabProps {
  bestCombinations: ComboDisplay[]
  worstCombinations: ComboDisplay[]
  allComboData: ComboData[]
  ddragonVersion: string
  runeStats: Record<number, RuneStat[]>
  statPerks: { offense: StatPerkStat[]; flex: StatPerkStat[]; defense: StatPerkStat[] }
  starterItems: StarterBuild[]
  summonerSpellStats: SummonerSpellStat[]
  abilityLevelingStats: AbilityLevelingStat[]
  totalGames: number
  championName: string
  onComboSelect?: (index: number) => void
}

export function OverviewTab({
  bestCombinations,
  worstCombinations,
  allComboData,
  ddragonVersion,
  runeStats,
  statPerks,
  starterItems,
  summonerSpellStats,
  abilityLevelingStats,
  championName,
}: OverviewTabProps) {
  const [selectedCombo, setSelectedCombo] = useState<number | null>(null)
  const [_scrollStates, setScrollStates] = useState<Record<number, { isScrollable: boolean; isAtBottom: boolean }>>({})
  const scrollRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const selectedComboData = selectedCombo !== null ? allComboData[selectedCombo] : null
  const selectedComboDisplay = [...bestCombinations, ...worstCombinations].find(c => c.originalIndex === selectedCombo)
  
  // check if combo has enough games for combo-specific stats (500 games minimum)
  const comboHasEnoughGames = selectedComboDisplay && selectedComboDisplay.games >= 500
  const useGlobalData = !comboHasEnoughGames

  // set up scroll tracking for each slot
  useEffect(() => {
    const observers: ResizeObserver[] = []
    const cleanupFns: (() => void)[] = []

    scrollRefs.current.forEach((scrollContainer, slotNum) => {
      if (!scrollContainer) return

      const checkScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer
        const scrollable = scrollHeight > clientHeight
        const isBottom = scrollable ? Math.abs(scrollHeight - clientHeight - scrollTop) < 2 : false
        
        setScrollStates(prev => ({
          ...prev,
          [slotNum]: { isScrollable: scrollable, isAtBottom: isBottom }
        }))
      }

      // Initial check
      checkScroll()

      // Observe size changes
      const resizeObserver = new ResizeObserver(checkScroll)
      resizeObserver.observe(scrollContainer)
      observers.push(resizeObserver)

      // Scroll listener
      const handleScroll = () => {
        requestAnimationFrame(checkScroll)
      }
      scrollContainer.addEventListener('scroll', handleScroll)
      cleanupFns.push(() => scrollContainer.removeEventListener('scroll', handleScroll))
    })

    return () => {
      observers.forEach(observer => observer.disconnect())
      cleanupFns.forEach(fn => fn())
    }
  }, [selectedComboData]) // Re-run when combo changes
  
  const LowSampleWarning = useGlobalData ? (
    <SimpleTooltip content={<span className="text-xs text-white">Using champion-wide data due to low sample size for this build</span>}>
      <div className="cursor-help text-gold-light">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
    </SimpleTooltip>
  ) : undefined

  return (
    <div className="relative flex flex-col lg:flex-row gap-4 pb-8">
      {/* Core Builds Selector - Absolute on desktop to track height of right column */}
      <div className="hidden lg:block lg:w-52 xl:w-56 lg:flex-shrink-0" />
      <div className="w-full lg:w-52 xl:w-56 lg:absolute lg:top-0 lg:bottom-8 lg:left-0 flex flex-col">
        <CoreBuildsSelector
          bestCombinations={bestCombinations}
          worstCombinations={worstCombinations}
          ddragonVersion={ddragonVersion}
          onComboSelect={setSelectedCombo}
          selectedCombo={selectedCombo}
        />
      </div>

      {/* main content - build details */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* items and runes row */}
        <div className="flex flex-col lg:flex-row gap-4">
        {/* items by slot */}
        <Card title="Items" className="flex-1 flex flex-col overflow-hidden" contentClassName="flex-1 flex flex-col min-h-0 pb-0">
          {selectedComboData && selectedComboDisplay ? (
            <div className="flex flex-1 min-h-0" style={{ maxHeight: '330px' }}>
              {[1, 2, 3, 4, 5, 6].map(slotNum => {
                const itemsInSlot: Array<{ itemId: number; games: number; winrate: number }> = []
                if (selectedComboData.itemStats) {
                  Object.entries(selectedComboData.itemStats).forEach(([itemIdStr, itemData]) => {
                    const itemId = parseInt(itemIdStr)
                    if (itemData.positions?.[slotNum]) {
                      const posData = itemData.positions[slotNum]
                      itemsInSlot.push({
                        itemId,
                        games: posData.games,
                        winrate: posData.games > 0 ? (posData.wins / posData.games) * 100 : 0,
                      })
                    }
                  })
                }
                itemsInSlot.sort((a, b) => b.games - a.games)

                return (
                  <div 
                    key={slotNum} 
                    className={clsx(
                      "flex-1 flex flex-col min-w-0 rounded-lg px-2 py-2 relative",
                      slotNum % 2 === 1 ? "bg-abyss-600" : "bg-abyss-700"
                    )}
                  >
                    <div className="text-center text-xl font-bold mb-3 text-white flex-shrink-0">{slotNum}</div>
                    <div 
                      ref={(el) => {
                        if (el) scrollRefs.current.set(slotNum, el)
                        else scrollRefs.current.delete(slotNum)
                      }}
                      className="overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide space-y-3 rounded-b-lg"
                    >
                      {itemsInSlot.length > 0 ? (
                        itemsInSlot.map((itemData, idx) => (
                          <div key={idx} className="flex justify-center">
                            <ItemIcon itemId={itemData.itemId} ddragonVersion={ddragonVersion} size="lg" winrate={itemData.winrate} games={itemData.games} />
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-xs text-text-muted py-2">No items</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center text-text-muted py-12">No item combinations available</div>
          )}
        </Card>

        {/* Runes Card */}
        <Card title="Runes" headerRight={LowSampleWarning} className="flex-shrink-0 min-h-[400px] flex flex-col" paddingClassName="flex-1 flex flex-col" contentClassName="flex-1 flex">
          {(() => {
            // Get all global runes for fallback
            const allGlobalRunes: RuneStat[] = []
            Object.values(runeStats).forEach(slotRunes => {
              slotRunes.forEach(rune => {
                if (!allGlobalRunes.find(r => r.rune_id === rune.rune_id)) {
                  allGlobalRunes.push(rune)
                }
              })
            })

            // Helper to get rune tree info
            const getRuneTree = (runeId: number) => {
              for (const [treeName, tree] of Object.entries(RUNE_TREES)) {
                if (tree.keystones.includes(runeId)) return { tree, tier: 'keystone' as const, treeName }
                if (tree.tier1.includes(runeId)) return { tree, tier: 'tier1' as const, treeName }
                if (tree.tier2.includes(runeId)) return { tree, tier: 'tier2' as const, treeName }
                if (tree.tier3.includes(runeId)) return { tree, tier: 'tier3' as const, treeName }
              }
              return null
            }

            // use combo runes if available
            let comboRunes: Array<{ rune_id: number; games: number; wins: number; winrate: number }> = []
            if (!useGlobalData && selectedComboData?.runes) {
              const runeEntries: [string, { games: number; wins: number }][] = []
              if (selectedComboData.runes.primary) runeEntries.push(...Object.entries(selectedComboData.runes.primary))
              if (selectedComboData.runes.secondary) runeEntries.push(...Object.entries(selectedComboData.runes.secondary))
              comboRunes = runeEntries.map(([runeId, data]) => ({
                rune_id: parseInt(runeId),
                games: data.games,
                wins: data.wins,
                winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
              }))
            }

            const runesSource = comboRunes.length > 0 ? comboRunes : allGlobalRunes

            // find best keystone
            const keystones = runesSource.filter(r => getRuneTree(r.rune_id)?.tier === 'keystone')
            const bestKeystone = keystones.sort((a, b) => b.games - a.games)[0]
            if (!bestKeystone) return <div className="text-center text-subtitle py-4">No rune data available</div>

            const primaryTreeInfo = getRuneTree(bestKeystone.rune_id)
            if (!primaryTreeInfo) return null

            // get best rune for each tier
            const primaryTreeName = primaryTreeInfo.tree.name.toLowerCase()
            const getBestRuneForTier = (tier: 'tier1' | 'tier2' | 'tier3') => {
              const tierRunes = runesSource.filter(r => {
                const info = getRuneTree(r.rune_id)
                return info?.tree.name.toLowerCase() === primaryTreeName && info?.tier === tier
              })
              return tierRunes.sort((a, b) => b.games - a.games)[0]
            }

            const bestTier1 = getBestRuneForTier('tier1')
            const bestTier2 = getBestRuneForTier('tier2')
            const bestTier3 = getBestRuneForTier('tier3')

            // Find best secondary tree
            const secondaryTreeRunes = runesSource.filter(r => {
              const info = getRuneTree(r.rune_id)
              return info && info.tree.name.toLowerCase() !== primaryTreeName && info.tier !== 'keystone'
            })

            const treeScores: Record<string, number> = {}
            secondaryTreeRunes.forEach(rune => {
              const info = getRuneTree(rune.rune_id)
              if (!info) return
              const treeName = info.tree.name.toLowerCase()
              treeScores[treeName] = (treeScores[treeName] || 0) + rune.games
            })

            const bestSecondaryTreeName = Object.entries(treeScores).sort((a, b) => b[1] - a[1])[0]?.[0]
            const bestSecondaryTree = bestSecondaryTreeName ? RUNE_TREES[bestSecondaryTreeName as keyof typeof RUNE_TREES] : null

            const secondaryRunesList = secondaryTreeRunes
              .filter(r => getRuneTree(r.rune_id)?.tree.name.toLowerCase() === bestSecondaryTreeName)
              .sort((a, b) => b.games - a.games)
              .slice(0, 2)

            const primaryTree = primaryTreeInfo.tree
            const selectedRuneIds = new Set([
              bestKeystone.rune_id,
              bestTier1?.rune_id,
              bestTier2?.rune_id,
              bestTier3?.rune_id,
              ...secondaryRunesList.map(r => r.rune_id)
            ].filter(Boolean) as number[])

            // get best stat perks
            const getBestStatPerkIndex = (perks: readonly { id: number }[], category: 'offense' | 'flex' | 'defense'): number => {
              let bestIdx = 0
              let bestGames = 0
              perks.forEach((perk, idx) => {
                const comboStat = !useGlobalData && selectedComboData?.runes?.tertiary?.[category]?.[perk.id.toString()]
                const globalStat = statPerks[category].find(s => s.key === perk.id.toString())
                const games = (comboStat && typeof comboStat === 'object' ? comboStat.games : 0) || globalStat?.games || 0
                if (games > bestGames) {
                  bestGames = games
                  bestIdx = idx
                }
              })
              return bestIdx
            }

            const bestOffenseIdx = getBestStatPerkIndex(STAT_PERKS.offense, 'offense')
            const bestFlexIdx = getBestStatPerkIndex(STAT_PERKS.flex, 'flex')
            const bestDefenseIdx = getBestStatPerkIndex(STAT_PERKS.defense, 'defense')

            // render rune helper
            const renderRune = (runeId: number, isKeystone: boolean = false, isSecondary: boolean = false) => {
              const runeInfo = (runesData as Record<string, any>)[runeId.toString()]
              const isSelected = selectedRuneIds.has(runeId)
              const size = isKeystone ? 'w-9 h-9' : isSecondary ? 'w-6 h-6' : 'w-8 h-8'
              const imgSize = isKeystone ? 36 : isSecondary ? 24 : 32
              
              return (
                <RuneTooltip key={runeId} runeId={runeId}>
                  <div className={clsx(
                    size, "rounded-full overflow-hidden cursor-pointer flex-shrink-0",
                    isKeystone
                      ? isSelected ? "border-2 border-gold-light" : "opacity-30 grayscale"
                      : isSelected ? "border-2 border-gold-light" : "border border-gray-700 opacity-30 grayscale"
                  )}>
                    {runeInfo?.icon && (
                      <Image
                        src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                        alt=""
                        width={imgSize}
                        height={imgSize}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    )}
                  </div>
                </RuneTooltip>
              )
            }

            // render stat shard row
            const renderStatShardRow = (shardOptions: readonly { id: number; icon: string; name: string }[], selectedIdx: number) => {
              return (
                <div className="flex justify-between px-2">
                  {shardOptions.map((shard, idx) => {
                    const isSelected = idx === selectedIdx
                    return (
                      <div
                        key={shard.id}
                        className={clsx(
                          "w-5 h-5 rounded-full overflow-hidden",
                          isSelected ? "border border-gold-light" : "border border-gray-700 opacity-30 grayscale"
                        )}
                      >
                        <Image
                          src={`https://ddragon.leagueoflegends.com/cdn/img/${shard.icon}`}
                          alt={shard.name}
                          width={20}
                          height={20}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    )
                  })}
                </div>
              )
            }

            return (
              <div className="flex gap-4 h-full min-h-full">
                {/* primary Tree */}
                <div className="bg-abyss-800 rounded-lg p-4 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    {(() => {
                      const treeInfo = (runesData as Record<string, any>)[primaryTree.id.toString()]
                      return (
                        <>
                          {treeInfo?.icon && (
                            <div className="w-5 h-5 rounded-full overflow-hidden">
                              <Image
                                src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                                alt={primaryTree.name}
                                width={20}
                                height={20}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </div>
                          )}
                          <span className="text-[12px] font-medium" style={{ color: primaryTree.color }}>
                            {primaryTree.name}
                          </span>
                        </>
                      )
                    })()}
                  </div>
                  
                  {/* keystones */}
                  <div className={clsx(
                    "flex justify-between",
                  )}>
                    {primaryTree.keystones.map(id => renderRune(id, true))}
                  </div>
                  
                  <div className="border-t border-gold-dark/40 my-8" />
                  
                  {/* tier runes */}
                  <div className="flex-1 flex flex-col justify-between">
                    {[primaryTree.tier1, primaryTree.tier2, primaryTree.tier3].map((tier, idx) => (
                      <div key={idx} className="flex justify-between">
                        {tier.map(id => renderRune(id))}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* secondary tree w/ stats */}
                {bestSecondaryTree && (
                  <div className="bg-abyss-800 rounded-lg p-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      {(() => {
                        const treeInfo = (runesData as Record<string, any>)[bestSecondaryTree.id.toString()]
                        return (
                          <>
                            {treeInfo?.icon && (
                              <div className="w-5 h-5 rounded-full overflow-hidden">
                                <Image
                                  src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                                  alt={bestSecondaryTree.name}
                                  width={20}
                                  height={20}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              </div>
                            )}
                            <span className="text-[12px] font-medium" style={{ color: bestSecondaryTree.color }}>
                              {bestSecondaryTree.name}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-between">
                      {[bestSecondaryTree.tier1, bestSecondaryTree.tier2, bestSecondaryTree.tier3].map((tier, idx) => (
                        <div key={idx} className="flex gap-4 justify-center">
                          {tier.map(id => renderRune(id, false, true))}
                        </div>
                      ))}
                      
                      {/* stat Shards */}
                      <div className="border-t border-gold-dark/40 my-4" />
                      <div className="flex flex-col gap-3">
                        {renderStatShardRow(STAT_PERKS.offense, bestOffenseIdx)}
                        {renderStatShardRow(STAT_PERKS.flex, bestFlexIdx)}
                        {renderStatShardRow(STAT_PERKS.defense, bestDefenseIdx)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </Card>
        </div>

        {/* starting Items, spells, skills Row */}
        <div className="flex gap-4">
          {/* starting Items */}
          <div className="flex-1">
          <Card title="Starting Items" headerRight={LowSampleWarning} className="h-full">
            {(() => {
              if (!useGlobalData && selectedComboData?.starting) {
                const sortedStarting = Object.entries(selectedComboData.starting)
                  .map(([key, data]) => ({
                    items: key.split(',').map(Number),
                    ...data,
                    winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
                  }))
                  .sort((a, b) => b.games - a.games)
                if (sortedStarting.length > 0) {
                  const best = sortedStarting[0]
                  // count duplicate items
                  const itemCounts = new Map<number, number>()
                  best.items.forEach(itemId => {
                    itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
                  })
                  return (
                    <div>
                      <div className="flex gap-2 mb-2 text-sm">
                        <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                        <div className="text-subtitle">{best.games.toLocaleString()}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(itemCounts.entries()).map(([itemId, count], idx) => (
                          <div key={idx} className="relative">
                            <ItemIcon itemId={itemId} ddragonVersion={ddragonVersion} size="lg" />
                            {count > 1 && (
                              <div className="absolute bottom-2 right-0 w-4 h-4 rounded-sm bg-abyss-900 border border-gold-dark flex items-center justify-center">
                                <span className="text-[9px] font-regular text-white leading-none">{count}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }
              }
              if (starterItems.length > 0) {
                const best = starterItems[0]
                // count duplicate items
                const itemCounts = new Map<number, number>()
                best.items.forEach(itemId => {
                  itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
                })
                return (
                  <div>
                    <div className="flex gap-2 mb-2 text-sm">
                      <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                      <div className="text-subtitle">{best.games.toLocaleString()}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(itemCounts.entries()).map(([itemId, count], idx) => (
                        <div key={idx} className="relative">
                          <ItemIcon itemId={itemId} ddragonVersion={ddragonVersion} size="lg" />
                          {count > 1 && (
                            <div className="absolute bottom-2 right-0 w-4 h-4 rounded-sm bg-abyss-900 border border-gold-dark flex items-center justify-center">
                              <span className="text-[9px] font-regular text-white leading-none">{count}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              return <div className="text-xs text-gray-500">No data</div>
            })()}
          </Card>
          </div>

          {/* summoner spells */}
          <div className="flex-1">
          <Card title="Summoner Spells" headerRight={LowSampleWarning} className="h-full">
            {(() => {
              if (!useGlobalData && selectedComboData?.spells) {
                const sortedSpells = Object.entries(selectedComboData.spells)
                  .map(([key, data]) => {
                    const [spell1, spell2] = key.split('_').map(Number)
                    return { spell1_id: spell1, spell2_id: spell2, ...data, winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0 }
                  })
                  .sort((a, b) => b.games - a.games)
                if (sortedSpells.length > 0) {
                  const best = sortedSpells[0]
                  return (
                    <div>
                      <div className="flex gap-2 mb-2 text-sm">
                        <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                        <div className="text-subtitle">{best.games.toLocaleString()}</div>
                      </div>
                      <div className="flex gap-2">
                        {[best.spell1_id, best.spell2_id].map((spellId, idx) => (
                          <SummonerSpellTooltip key={idx} spellId={spellId}>
                            <div className="w-10 h-10 rounded bg-abyss-800 border border-gold-dark overflow-hidden cursor-pointer">
                              <Image src={getSummonerSpellUrl(spellId, ddragonVersion)} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized />
                            </div>
                          </SummonerSpellTooltip>
                        ))}
                      </div>
                    </div>
                  )
                }
              }
              if (summonerSpellStats.length > 0) {
                const best = summonerSpellStats[0]
                return (
                  <div>
                    <div className="flex gap-2 mb-2 text-sm">
                      <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                      <div className="text-subtitle">{best.games.toLocaleString()}</div>
                    </div>
                    <div className="flex gap-2">
                      {[best.spell1_id, best.spell2_id].map((spellId, idx) => (
                        <SummonerSpellTooltip key={idx} spellId={spellId}>
                          <div className="w-10 h-10 rounded bg-abyss-800 border border-gold-dark overflow-hidden cursor-pointer">
                            <Image src={getSummonerSpellUrl(spellId, ddragonVersion)} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized />
                          </div>
                        </SummonerSpellTooltip>
                      ))}
                    </div>
                  </div>
                )
              }
              return <div className="text-xs text-gray-500">No data</div>
            })()}
          </Card>
          </div>

          {/* leveling order */}
          <div className="flex-1">
          <Card title="Levelling Order" headerRight={useGlobalData ? LowSampleWarning : undefined} className="h-full">
            {(() => {
              if (!useGlobalData && selectedComboData?.skills) {
                const skillsArray = Object.entries(selectedComboData.skills)
                  .map(([order, data]) => ({ ability_order: order, ...data, winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0 }))
                  .sort((a, b) => b.games - a.games)
                if (skillsArray.length > 0) {
                  const best = skillsArray[0]
                  const maxOrder = getAbilityMaxOrder(best.ability_order)
                  return (
                    <div>
                      <div className="flex gap-2 mb-2 text-sm">
                        <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                        <div className="text-subtitle">{best.games.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {maxOrder.map((ability, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <ChampionAbility championName={championName} ability={ability as 'P' | 'Q' | 'W' | 'E' | 'R'} />
                            {idx < maxOrder.length - 1 && <span className="text-gray-500 font-bold">&gt;</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }
              }
              if (abilityLevelingStats.length > 0) {
                const best = abilityLevelingStats[0]
                const maxOrder = getAbilityMaxOrder(best.ability_order)
                return (
                  <div>
                    <div className="flex gap-2 mb-2 text-sm">
                      <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                      <div className="text-subtitle">{best.games.toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {maxOrder.map((ability, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <ChampionAbility championName={championName} ability={ability as 'P' | 'Q' | 'W' | 'E' | 'R'} />
                          {idx < maxOrder.length - 1 && <span className="text-gray-500 font-bold">&gt;</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              return null
            })()}
          </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
