'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import clsx from 'clsx'
import Image from 'next/image'
import ItemIcon from '@/components/ui/ItemIcon'
import Card from '@/components/ui/Card'
import RuneTooltip from '@/components/ui/RuneTooltip'
import SummonerSpellTooltip from '@/components/ui/SummonerSpellTooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
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
}: OverviewTabProps) {
  const [selectedCombo, setSelectedCombo] = useState<number | null>(null)
  const [selectedBestCombo, setSelectedBestCombo] = useState<number | null>(null)
  const [selectedWorstCombo, setSelectedWorstCombo] = useState<number | null>(null)
  const [showAllBuilds, setShowAllBuilds] = useState(false)
  const [coreBuildsView, setCoreBuildsView] = useState<'best' | 'worst'>('best')
  const [selectorStyle, setSelectorStyle] = useState<{ top: number; height: number } | null>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const buildsListRef = useRef<HTMLDivElement>(null)

  // Initialize selected combos for each view
  useEffect(() => {
    if (selectedBestCombo === null && bestCombinations.length > 0) {
      setSelectedBestCombo(bestCombinations[0].originalIndex)
    }
    if (selectedWorstCombo === null && worstCombinations.length > 0) {
      setSelectedWorstCombo(worstCombinations[0].originalIndex)
    }
  }, [bestCombinations, worstCombinations, selectedBestCombo, selectedWorstCombo])

  // Sync selectedCombo with the current view
  useEffect(() => {
    if (coreBuildsView === 'best') {
      setSelectedCombo(selectedBestCombo)
    } else {
      setSelectedCombo(selectedWorstCombo)
    }
  }, [coreBuildsView, selectedBestCombo, selectedWorstCombo])

  // Update selector position
  useLayoutEffect(() => {
    if (selectedCombo === null) return
    
    const button = buttonRefs.current.get(selectedCombo)
    const buildsList = buildsListRef.current
    if (button && buildsList) {
      const buildsListRect = buildsList.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      setSelectorStyle({
        top: buttonRect.top - buildsListRect.top,
        height: buttonRect.height,
      })
    }
  }, [selectedCombo, coreBuildsView, showAllBuilds])

  const selectedComboData = selectedCombo !== null ? allComboData[selectedCombo] : null
  const selectedComboDisplay = [...bestCombinations, ...worstCombinations].find(c => c.originalIndex === selectedCombo)
  
  // Check if combo has enough games for combo-specific stats (500 games minimum)
  const comboHasEnoughGames = selectedComboDisplay && selectedComboDisplay.games >= 500
  const useGlobalData = !comboHasEnoughGames
  
  const LowSampleWarning = useGlobalData ? (
    <SimpleTooltip content={<span className="text-xs text-white">Using champion-wide data due to low sample size for this build</span>}>
      <div className="cursor-help text-warning">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
    </SimpleTooltip>
  ) : undefined

  return (
    <div className="grid grid-cols-12 gap-4 pb-8">
      {/* Left Sidebar - Core Builds Selection */}
      <div className="col-span-12 lg:col-span-3 xl:col-span-3">
        <div className={clsx(
          "rounded-lg border border-gold-dark/40 sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto transition-colors duration-200",
          coreBuildsView === 'worst' ? "bg-worst-dark" : "bg-abyss-600"
        )}>
          <div ref={containerRef} className="relative px-4.5 py-2 pb-2">
            
            {/* Header with Toggle */}
            <div className="mb-3">
              <div className="flex items-center justify-between gap-4 pb-1.5">
                <h2 className="text-lg font-semibold" style={{ color: coreBuildsView === 'best' ? '#ffffff' : 'oklch(62% 0.15 17.952)' }}>
                  {coreBuildsView === 'best' ? 'Best' : 'Worst'} Core Builds
                </h2>
                <button
                  onClick={() => {
                    const newView = coreBuildsView === 'best' ? 'worst' : 'best'
                    setCoreBuildsView(newView)
                  }}
                  className="text-xs text-text-muted hover:text-white transition-colors flex items-center gap-0.5"
                >
                  {coreBuildsView === 'worst' && <span className="text-[10px]">‹</span>}
                  <span>{coreBuildsView === 'best' ? 'Worst' : 'Best'}</span>
                  {coreBuildsView === 'best' && <span className="text-[10px]">›</span>}
                </button>
              </div>
              <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent -mx-4.5 mb-3" />
            </div>

            {/* Builds List */}
            <LayoutGroup>
              <motion.div 
                className="overflow-hidden"
                layout="size"
                transition={{ layout: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } }}
              >
                <AnimatePresence mode="wait">
                {(() => {
                  const combinations = coreBuildsView === 'best' ? bestCombinations : worstCombinations
                  const isWorst = coreBuildsView === 'worst'
                  
                  // Handle empty state
                  if (combinations.length === 0) {
                    return (
                      <motion.div
                        key={`${coreBuildsView}-empty`}
                        initial={{ x: isWorst ? 200 : -200, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: isWorst ? -200 : 200, opacity: 0 }}
                        transition={{ 
                          duration: 0.2,
                          ease: 'easeInOut'
                        }}
                        className="text-sm text-text-muted text-center py-4 px-6"
                      >
                        No core builds discovered yet, check back later!
                      </motion.div>
                    )
                  }
                  
                  const visibleCombos = showAllBuilds ? combinations : combinations.slice(0, 5)
                  
                  return (
                    <motion.div
                      ref={buildsListRef}
                      key={coreBuildsView}
                      initial={{ x: isWorst ? 200 : -200, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: isWorst ? -200 : 200, opacity: 0 }}
                      transition={{ 
                        duration: 0.2,
                        ease: 'easeInOut'
                      }}
                      className="space-y-2 relative"
                    >
                      {/* Animated gold border selector - moves with content */}
                      {selectorStyle && (
                        <motion.div 
                          className="absolute left-0 right-0 rounded-lg pointer-events-none z-10"
                          animate={{ 
                            top: selectorStyle.top,
                            height: selectorStyle.height,
                          }}
                          transition={{ 
                            duration: 0.2,
                            ease: 'easeInOut'
                          }}
                          style={{ 
                            padding: '1px',
                            background: 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))',
                            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                            WebkitMaskComposite: 'xor',
                            maskComposite: 'exclude',
                          }}
                        />
                      )}
                      {visibleCombos.map((combo) => (
                        <button
                          key={`${coreBuildsView}-${combo.originalIndex}`}
                          ref={(el) => {
                            if (el) buttonRefs.current.set(combo.originalIndex, el)
                            else buttonRefs.current.delete(combo.originalIndex)
                          }}
                          onClick={() => {
                            if (coreBuildsView === 'best') {
                              setSelectedBestCombo(combo.originalIndex)
                            } else {
                              setSelectedWorstCombo(combo.originalIndex)
                            }
                          }}
                          className={clsx(
                            'w-full text-left p-3 rounded-lg transition-colors relative',
                            isWorst
                              ? selectedCombo === combo.originalIndex ? 'bg-loss-light' : 'bg-loss hover:bg-loss-light'
                              : selectedCombo === combo.originalIndex ? 'bg-abyss-700' : 'bg-abyss-800 hover:bg-abyss-700'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {combo.itemIds.map((itemId, position) => (
                              <div key={position} className="flex items-center gap-1">
                                {position > 0 && <span className="text-gray-600 text-xs">+</span>}
                                <ItemIcon itemId={itemId} ddragonVersion={ddragonVersion} size="sm" className="flex-shrink-0 bg-abyss-900 border-gray-700" />
                              </div>
                            ))}
                            {combo.hasBoots && (
                              <>
                                <span className="text-gray-600 text-xs">+</span>
                                <div className="w-7 h-7 rounded bg-abyss-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[9px] text-gray-400 text-center leading-tight px-0.5">Any<br />Boots</span>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="font-bold" style={{ color: getWinrateColor(combo.winrate) }}>{combo.winrate.toFixed(1)}%</span>
                            <span className="text-subtitle">{Math.round(combo.games).toLocaleString()}</span>
                          </div>
                        </button>
                      ))}
                      {combinations.length > 5 && (
                        <button
                          onClick={() => setShowAllBuilds(!showAllBuilds)}
                          className={clsx(
                            "w-full text-center py-2 text-xs text-subtitle hover:text-white transition-colors rounded-lg border border-gold-dark/40 hover:border-gold-dark/60 flex items-center justify-center gap-1",
                            isWorst ? "bg-loss hover:bg-loss-light" : "bg-abyss-700 hover:bg-abyss-600"
                          )}
                        >
                          {showAllBuilds ? (
                            <>
                              <span>Show less</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </>
                          ) : (
                            <>
                              <span>Show more ({combinations.length - 5})</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </>
                          )}
                        </button>
                      )}
                    </motion.div>
                  )
                })()}
                </AnimatePresence>
              </motion.div>
            </LayoutGroup>
          </div>
        </div>
      </div>

      {/* Main Content - Build Details */}
      <div className="col-span-12 lg:col-span-9 xl:col-span-9 space-y-4">
        {/* Items by Slot */}
        <Card title="Items">
          {selectedComboData && selectedComboDisplay ? (
            <div>
              <div className="text-sm text-text-muted mb-6">
                Showing most common items built in each slot with this combination ({selectedComboDisplay.games.toLocaleString()} games)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                  const top3 = itemsInSlot.slice(0, 3)

                  return (
                    <div key={slotNum}>
                      <div className="text-center text-xl font-bold mb-3 text-white">{slotNum}</div>
                      <div className="space-y-2">
                        {top3.length > 0 ? (
                          top3.map((itemData, idx) => (
                            <div key={idx} className="flex justify-center mb-1">
                              <ItemIcon itemId={itemData.itemId} ddragonVersion={ddragonVersion} size="xl" winrate={itemData.winrate} games={itemData.games} />
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-xs text-gray-600 py-2">No items</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-center text-text-muted py-12">No item combinations available</div>
          )}
        </Card>

        {/* Runes Card */}
        <Card title="Runes" headerRight={LowSampleWarning}>
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

            // Use combo runes if available
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

            // Find best keystone
            const keystones = runesSource.filter(r => getRuneTree(r.rune_id)?.tier === 'keystone')
            const bestKeystone = keystones.sort((a, b) => b.games - a.games)[0]
            if (!bestKeystone) return <div className="text-center text-subtitle py-4">No rune data available</div>

            const primaryTreeInfo = getRuneTree(bestKeystone.rune_id)
            if (!primaryTreeInfo) return null

            // Get best rune for each tier
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

            // Get best stat perks
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

            // Render rune helper
            const renderRune = (runeId: number, isKeystone: boolean = false) => {
              const runeInfo = (runesData as Record<string, any>)[runeId.toString()]
              const isSelected = selectedRuneIds.has(runeId)
              const size = isKeystone ? 'w-9 h-9' : 'w-7 h-7'
              const imgSize = isKeystone ? 36 : 28
              
              return (
                <RuneTooltip key={runeId} runeId={runeId}>
                  <div className={clsx(
                    size, "rounded-full overflow-hidden cursor-pointer",
                    isSelected ? "border-2 border-gold-light" : "border border-gray-700 opacity-30 grayscale"
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

            // Render stat shard row
            const renderStatShardRow = (shardOptions: readonly { id: number; icon: string; name: string }[], selectedIdx: number) => {
              return (
                <div className="flex gap-1">
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
              <div className="flex gap-4">
                {/* Primary Tree */}
                <div className="bg-abyss-800 rounded-lg p-3 border border-gold-dark/30">
                  <div className="flex items-center gap-2 mb-2">
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
                          <span className="text-[10px] font-medium" style={{ color: primaryTree.color }}>
                            {primaryTree.name}
                          </span>
                        </>
                      )
                    })()}
                  </div>
                  
                  {/* Keystones */}
                  <div className={clsx(
                    "grid gap-1 justify-items-center mb-2",
                    primaryTree.keystones.length === 4 ? "grid-cols-4" : "grid-cols-3"
                  )}>
                    {primaryTree.keystones.map(id => renderRune(id, true))}
                  </div>
                  
                  <div className="border-t border-gray-700/50 my-2" />
                  
                  {/* Tier runes */}
                  {[primaryTree.tier1, primaryTree.tier2, primaryTree.tier3].map((tier, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-1 justify-items-center mb-1 last:mb-0">
                      {tier.map(id => renderRune(id))}
                    </div>
                  ))}
                </div>
                
                {/* Secondary Tree with Stat Shards */}
                {bestSecondaryTree && (
                  <div className="bg-abyss-800 rounded-lg p-3 border border-gray-700/30">
                    <div className="flex items-center gap-2 mb-2">
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
                            <span className="text-[10px] font-medium" style={{ color: bestSecondaryTree.color }}>
                              {bestSecondaryTree.name}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                    
                    {/* Tier runes only */}
                    {[bestSecondaryTree.tier1, bestSecondaryTree.tier2, bestSecondaryTree.tier3].map((tier, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-1 justify-items-center mb-1 last:mb-0">
                        {tier.map(id => renderRune(id))}
                      </div>
                    ))}
                    
                    {/* Stat Shards */}
                    <div className="border-t border-gray-700/50 my-2" />
                    <div className="flex flex-col gap-1">
                      {renderStatShardRow(STAT_PERKS.offense, bestOffenseIdx)}
                      {renderStatShardRow(STAT_PERKS.flex, bestFlexIdx)}
                      {renderStatShardRow(STAT_PERKS.defense, bestDefenseIdx)}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </Card>

        {/* Starting Items, Spells, Skills Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Starting Items */}
          <Card title="Starting Items" headerRight={LowSampleWarning}>
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
                  return (
                    <div>
                      <div className="flex gap-2 mb-2 text-sm">
                        <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                        <div className="text-subtitle">{best.games.toLocaleString()}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {best.items.map((itemId, idx) => (
                          <ItemIcon key={idx} itemId={itemId} ddragonVersion={ddragonVersion} size="lg" className="bg-abyss-800 border-gray-700" />
                        ))}
                      </div>
                    </div>
                  )
                }
              }
              if (starterItems.length > 0) {
                const best = starterItems[0]
                return (
                  <div>
                    <div className="flex gap-2 mb-2 text-sm">
                      <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                      <div className="text-subtitle">{best.games.toLocaleString()}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {best.items.map((itemId, idx) => (
                        <ItemIcon key={idx} itemId={itemId} ddragonVersion={ddragonVersion} size="lg" className="bg-abyss-800 border-gray-700" />
                      ))}
                    </div>
                  </div>
                )
              }
              return <div className="text-xs text-gray-500">No data</div>
            })()}
          </Card>

          {/* Summoner Spells */}
          <Card title="Spells" headerRight={LowSampleWarning}>
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
                            <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer">
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
                          <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer">
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

          {/* Skill Max Order */}
          <Card title="Skill Max Order" headerRight={useGlobalData ? LowSampleWarning : undefined}>
            {(() => {
              // Map abilities to KDA colors - lowest to highest (3=green, 4=blue, 5=pink)
              const getAbilityColor = (ability: string, position: number): string => {
                if (ability === 'R') return 'text-gold-light'
                const colorMap = ['text-kda-3', 'text-kda-4', 'text-kda-5']
                return colorMap[position] || 'text-white'
              }

              if (!useGlobalData && selectedComboData?.skills) {
                const skillsArray = Object.entries(selectedComboData.skills)
                  .map(([order, data]) => ({ ability_order: order, ...data, winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0 }))
                  .sort((a, b) => b.games - a.games)
                if (skillsArray.length > 0) {
                  const best = skillsArray[0]
                  const maxOrder = getAbilityMaxOrder(best.ability_order)
                  return (
                    <div>
                      <div className="flex gap-2 mb-3 text-sm">
                        <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                        <div className="text-subtitle">{best.games.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {maxOrder.map((ability, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div className={clsx(
                              "w-10 h-10 flex items-center justify-center rounded-lg font-bold text-lg border",
                              ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                              "bg-abyss-800",
                              getAbilityColor(ability, idx)
                            )}>{ability}</div>
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
                    <div className="flex gap-2 mb-3 text-sm">
                      <div className="font-bold" style={{ color: getWinrateColor(best.winrate) }}>{best.winrate.toFixed(1)}%</div>
                      <div className="text-subtitle">{best.games.toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {maxOrder.map((ability, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className={clsx(
                            "w-10 h-10 flex items-center justify-center rounded-lg font-bold text-lg border",
                            ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                            "bg-abyss-800",
                            getAbilityColor(ability, idx)
                          )}>{ability}</div>
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
  )
}
