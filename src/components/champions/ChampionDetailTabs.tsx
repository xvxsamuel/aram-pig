'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { motion, AnimatePresence, LayoutGroup } from 'motion/react'
import Tooltip from '@/components/ui/Tooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import ItemIcon from '@/components/ui/ItemIcon'
import Card from '@/components/ui/Card'
import { getSummonerSpellUrl } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'
import { RUNE_TREES, STAT_PERKS, getRuneTree } from '@/lib/game'
import { calculateWilsonScore as calculateWilsonScoreFromWinrate } from '@/lib/scoring/build-scoring'
import runesData from '@/data/runes.json'

// "qew" -> "Q > E > W"
function getAbilityMaxOrder(abilityOrder: string): string {
  if (!abilityOrder || abilityOrder.trim() === '') return 'Q > W > E'

  // if it's already a short format like "qew", "qwe", etc., just format it
  const cleaned = abilityOrder.toLowerCase().replace(/[^qwe]/g, '')

  if (cleaned.length <= 3) {
    // short format: "qew" -> "Q > E > W"
    const abilities = cleaned.split('').map(c => c.toUpperCase())

    // ensure we have all 3 abilities
    if (abilities.length < 3) {
      const missing = ['Q', 'W', 'E'].filter(a => !abilities.includes(a))
      abilities.push(...missing)
    }

    return abilities.slice(0, 3).join(' > ')
  }

  // if it's a long format like "Q W E Q W R Q W Q W R W W E E R E E", parse it
  const parts = abilityOrder.split(' ')
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []

  for (const ability of parts) {
    if (ability in counts) {
      counts[ability as keyof typeof counts]++
      if (ability !== 'R' && counts[ability as keyof typeof counts] === 5) {
        maxOrder.push(ability)
      }
    }
  }

  // normalize incomplete orders
  if (maxOrder.length === 0) {
    const sorted = (['Q', 'W', 'E'] as ('Q' | 'W' | 'E')[]).sort((a, b) => counts[b] - counts[a])
    return sorted.join(' > ')
  }
  if (maxOrder.length === 1) {
    const remaining = ['Q', 'W', 'E'].filter(a => !maxOrder.includes(a))
    remaining.sort((a, b) => counts[b as keyof typeof counts] - counts[a as keyof typeof counts])
    return `${maxOrder[0]} > ${remaining[0]} > ${remaining[1]}`
  }
  if (maxOrder.length === 2) {
    const missing = ['Q', 'W', 'E'].find(a => !maxOrder.includes(a))
    return `${maxOrder[0]} > ${maxOrder[1]} > ${missing}`
  }

  return maxOrder.join(' > ')
}

// wilson score lower bound (95% confidence)
// This gives us the lower bound of what the "true" winrate likely is
// Low sample sizes get pulled down heavily, high samples stay close to actual WR
// Wrapper for the shared Wilson score calculation that takes (games, wins) instead of (winrate, games)
function calculateWilsonScore(games: number, wins: number): number {
  if (games === 0) return 0
  const winrate = (wins / games) * 100
  return calculateWilsonScoreFromWinrate(winrate, games)
}

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

interface StatPerkStat {
  key: string
  games: number
  wins: number
  winrate: number
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
  winrate?: number
  championWinrate?: number
  itemStats: Record<
    number,
    {
      positions: Record<number, { games: number; wins: number }>
    }
  >
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

interface Props {
  itemsBySlot: Record<number, ItemStat[]>
  bootsItems: ItemStat[]
  starterItems: StarterBuild[]
  runeStats: Record<number, RuneStat[]>
  statPerks: {
    offense: StatPerkStat[]
    flex: StatPerkStat[]
    defense: StatPerkStat[]
  }
  abilityLevelingStats: AbilityLevelingStat[]
  summonerSpellStats: SummonerSpellStat[]
  ddragonVersion: string
  totalGames: number
  buildOrders: string[]
  allBuildData: PreCalculatedCombo[]
  championWinrate: number
}

export default function ChampionDetailTabs({
  itemsBySlot,
  bootsItems,
  starterItems,
  runeStats,
  statPerks,
  abilityLevelingStats,
  summonerSpellStats,
  ddragonVersion,
  totalGames,
  allBuildData,
  championWinrate,
}: Props) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'items' | 'runes' | 'leveling'>('overview')
  const [selectedCombo, setSelectedCombo] = useState<number | null>(null) // null until initialized
  const [coreBuildsView, setCoreBuildsView] = useState<'best' | 'worst'>('best')
  const [showAllBuilds, setShowAllBuilds] = useState(false)
  
  // refs for animated selector
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [selectorStyle, setSelectorStyle] = useState<{ top: number; height: number } | null>(null)

  // transform pre-calculated combinations into display format with build order and accompanying items
  // Each combo now includes originalIndex to properly reference allBuildData
  const { bestCombinations, worstCombinations } = (() => {
    if (!allBuildData || allBuildData.length === 0) {
      return { bestCombinations: [], worstCombinations: [] }
    }

    const combinations = allBuildData
      .map((combo, idx) => {
        // derive build order from position data: for each combo item, find which slot it appears in most
        const buildOrder: Array<{ itemId: number; preferredSlot: number; games: number }> = []

        combo.normalizedItems.forEach(itemId => {
          const itemStats = combo.itemStats[itemId]
          if (!itemStats || !itemStats.positions) {
            // fallback: no position data, just use order from combo key
            buildOrder.push({ itemId, preferredSlot: buildOrder.length + 1, games: 0 })
            return
          }

          // find which slot this item appears in most frequently
          let maxSlot = 1
          let maxGames = 0
          Object.entries(itemStats.positions).forEach(([slot, stats]) => {
            if (stats.games > maxGames) {
              maxGames = stats.games
              maxSlot = parseInt(slot)
            }
          })

          buildOrder.push({ itemId, preferredSlot: maxSlot, games: maxGames })
        })

        // sort by preferred slot to get purchase order
        buildOrder.sort((a, b) => a.preferredSlot - b.preferredSlot)

        // create item stats in the derived build order
        const itemStats = buildOrder
          .map(({ itemId }) => {
            if (itemId === 99999) {
              // boots placeholder: aggregate all actual boot items
              const totalBootsGames = bootsItems.reduce((sum, b) => sum + b.games, 0)
              const totalBootsWins = bootsItems.reduce((sum, b) => sum + b.wins, 0)
              return {
                item_id: 99999,
                games: totalBootsGames,
                wins: totalBootsWins,
                winrate: totalBootsGames > 0 ? (totalBootsWins / totalBootsGames) * 100 : 0,
                pickrate: totalGames > 0 ? (totalBootsGames / totalGames) * 100 : 0,
              }
            }

            for (const slotItems of Object.values(itemsBySlot)) {
              const found = slotItems.find(i => i.item_id === itemId)
              if (found) return found
            }
            return null
          })
          .filter(Boolean) as ItemStat[]

        if (itemStats.length !== combo.normalizedItems.length) {
          return null
        }

        // get actual boot items with their stats
        const actualBootItems = combo.actualBoots
          .map(bootId => bootsItems.find(b => b.item_id === bootId))
          .filter(Boolean) as ItemStat[]

        // derive accompanying items: items that appear in slots not occupied by the combo
        const comboSlots = new Set(buildOrder.map(b => b.preferredSlot))
        const accompanyingItems: Array<{ item_id: number; slot: number; games: number; wins: number }> = []

        // look at all items in the combo's itemStats to find non-combo items
        Object.entries(combo.itemStats).forEach(([itemIdStr, itemData]) => {
          const itemId = parseInt(itemIdStr)

          // skip if this item is part of the combo
          if (combo.normalizedItems.includes(itemId)) return

          // for non-combo items, find which slot they appear in most
          if (itemData.positions) {
            Object.entries(itemData.positions).forEach(([slot, stats]) => {
              const slotNum = parseInt(slot)
              // only include items in slots not occupied by combo items
              if (!comboSlots.has(slotNum)) {
                accompanyingItems.push({
                  item_id: itemId,
                  slot: slotNum,
                  games: stats.games,
                  wins: stats.wins,
                })
              }
            })
          }
        })

        // sort accompanying items by frequency
        accompanyingItems.sort((a, b) => b.games - a.games)

        // Use winrate from allBuildData (already calculated in ChampionPageClient)
        const avgWinrate = combo.winrate ?? (combo.games > 0 ? (combo.wins / combo.games) * 100 : 0)
        const pickrate = totalGames > 0 ? (combo.games / totalGames) * 100 : 0

        return {
          originalIndex: idx, // Keep track of original index for proper allBuildData access
          items: itemStats,
          hasBoots: combo.normalizedItems.includes(99999),
          actualBootItems: actualBootItems,
          estimatedGames: combo.games,
          avgWinrate,
          buildOrder: buildOrder.map(b => b.preferredSlot),
          accompanyingItems: accompanyingItems.slice(0, 10), // top 10 accompanying items
          pickrate,
        }
      })
      .filter(Boolean) as Array<{
      originalIndex: number
      items: ItemStat[]
      hasBoots: boolean
      actualBootItems: ItemStat[]
      estimatedGames: number
      avgWinrate: number
      buildOrder: number[]
      accompanyingItems: Array<{ item_id: number; slot: number; games: number; wins: number }>
      pickrate: number
    }>

    // Fixed cutoff of 50 games minimum for display
    const MIN_CORE_GAMES = 50
    
    // Filter minimum games - allBuildData is already sorted by Wilson score in ChampionPageClient
    const validCombinations = combinations.filter(c => c.estimatedGames >= MIN_CORE_GAMES)
    
    // Best combinations: builds at or above champion average, sorted by Wilson score (already sorted)
    const bestCombinations = validCombinations.filter(c => c.avgWinrate >= championWinrate)
    
    // Worst combinations: builds at least 2% below champion average, sorted by pickrate (most played bad builds first)
    // This prevents marginal builds (e.g., 52.5% when champ is 53%) from being labeled as "worst"
    const worstCombinations = validCombinations
      .filter(c => c.avgWinrate < championWinrate - 2)
      .sort((a, b) => b.estimatedGames - a.estimatedGames) // Sort by pickrate descending
    
    return { bestCombinations, worstCombinations }
  })()

  // Initialize selectedCombo to first available build (only once)
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!initializedRef.current) {
      if (bestCombinations.length > 0) {
        setSelectedCombo(bestCombinations[0].originalIndex)
        initializedRef.current = true
      } else if (worstCombinations.length > 0) {
        setSelectedCombo(worstCombinations[0].originalIndex)
        initializedRef.current = true
      }
    }
  }, [bestCombinations.length, worstCombinations.length]) // Only depend on length, not the arrays

  // Update selector position when selection or view changes
  useLayoutEffect(() => {
    if (selectedCombo === null) return
    
    // Use requestAnimationFrame to ensure refs are populated
    const updatePosition = () => {
      const button = buttonRefs.current.get(selectedCombo)
      const container = containerRef.current
      if (button && container) {
        const containerRect = container.getBoundingClientRect()
        const buttonRect = button.getBoundingClientRect()
        setSelectorStyle({
          top: buttonRect.top - containerRect.top,
          height: buttonRect.height,
        })
      }
    }
    
    // Run immediately and also on next frame for safety
    updatePosition()
    const rafId = requestAnimationFrame(updatePosition)
    // Also run after a short delay to catch animation completion
    const timeoutId = setTimeout(updatePosition, 250)
    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(timeoutId)
    }
  }, [selectedCombo, coreBuildsView])

  // Also update selector on resize
  useEffect(() => {
    const updateSelector = () => {
      if (selectedCombo === null) return
      const button = buttonRefs.current.get(selectedCombo)
      const container = containerRef.current
      if (button && container) {
        const containerRect = container.getBoundingClientRect()
        const buttonRect = button.getBoundingClientRect()
        setSelectorStyle({
          top: buttonRect.top - containerRect.top,
          height: buttonRect.height,
        })
      }
    }
    
    window.addEventListener('resize', updateSelector)
    return () => window.removeEventListener('resize', updateSelector)
  }, [selectedCombo])

  // Find the selected combo data from allBuildData using originalIndex
  const selectedComboData = selectedCombo !== null ? allBuildData?.[selectedCombo] : null
  const selectedComboDisplay = [...bestCombinations, ...worstCombinations].find(c => c.originalIndex === selectedCombo)
  
  // Minimum games threshold for using combo-specific data (except item rows)
  const COMBO_MIN_GAMES = 500
  const MIN_PICKRATE = 0.02 // 2% minimum pickrate for combo data
  const comboTotalGames = selectedComboDisplay?.estimatedGames ?? 0
  const comboHasEnoughGames = comboTotalGames >= COMBO_MIN_GAMES
  const useGlobalDataForNonItems = !comboHasEnoughGames && selectedComboDisplay !== undefined
  
  // Helper to filter by 2% pickrate within combo data
  const meetsPickrateThreshold = (games: number) => games >= comboTotalGames * MIN_PICKRATE
  
  // Reusable warning icon for low sample size
  const LowSampleWarning = useGlobalDataForNonItems ? (
    <SimpleTooltip content={<span className="text-xs text-white">Using champion-wide data due to low sample size for this build</span>}>
      <div className="cursor-help text-warning">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
    </SimpleTooltip>
  ) : undefined

  return (
    <div>
      {/* Tab Navigation - outside content boxes, similar to profile page */}
      <div className="flex gap-1 mb-4 -mt-2">
        <button
          onClick={() => setSelectedTab('overview')}
          className={clsx(
            'cursor-pointer px-6 py-2 font-semibold tracking-wide transition-all border-b-2',
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
            'cursor-pointer px-4 py-2 font-semibold tracking-wide transition-all border-b-2',
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
            'cursor-pointer px-4 py-2 font-semibold tracking-wide transition-all border-b-2',
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
            'cursor-pointer px-6 py-2 font-semibold tracking-wide transition-all border-b-2',
            selectedTab === 'leveling'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Leveling
        </button>
      </div>

      {/* Overview Tab */}
      {selectedTab === 'overview' && (
        <div className="grid grid-cols-12 gap-4 pb-8">
          {/* Left Sidebar - Item Combinations */}
          <div className="col-span-12 lg:col-span-3 xl:col-span-3">
            <div className={clsx(
              "rounded-lg border border-gold-dark/40 sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto transition-colors duration-200",
              coreBuildsView === 'worst' ? "bg-worst-dark" : "bg-abyss-600"
            )}>
              {/* Container for animated selector */}
              <div ref={containerRef} className="relative px-4.5 py-2 pb-2">
                {/* Animated gold border selector - gradient border with transparent center */}
                {selectorStyle && (
                  <div 
                    className="absolute left-4.5 right-4.5 rounded-lg transition-all duration-300 ease-out pointer-events-none z-10"
                    style={{ 
                      top: selectorStyle.top,
                      height: selectorStyle.height,
                      padding: '1px',
                      background: 'linear-gradient(to bottom, var(--color-gold-light), var(--color-gold-dark))',
                      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                    }}
                  />
                )}
                
                {/* Core Builds Header with Toggle */}
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-4 pb-1.5">
                    <motion.h2
                      key={coreBuildsView}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-lg font-semibold"
                    >
                      <motion.span
                        animate={{ 
                          color: coreBuildsView === 'best' ? '#ffffff' : 'oklch(62% 0.15 17.952)'
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        {coreBuildsView === 'best' ? 'Best' : 'Worst'} Core Builds
                      </motion.span>
                    </motion.h2>
                    <button
                      onClick={() => {
                        const newView = coreBuildsView === 'best' ? 'worst' : 'best'
                        setCoreBuildsView(newView)
                        // Reset to first item in the new list
                        const newList = newView === 'best' ? bestCombinations : worstCombinations
                        if (newList.length > 0) {
                          setSelectedCombo(newList[0].originalIndex)
                        }
                      }}
                      className="text-xs text-text-muted hover:text-white transition-colors flex items-center gap-0.5"
                    >
                      {coreBuildsView === 'worst' && <span className="text-[10px]">‹</span>}
                      <motion.span
                        key={coreBuildsView}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15 }}
                      >
                        {coreBuildsView === 'best' ? 'Worst' : 'Best'}
                      </motion.span>
                      {coreBuildsView === 'best' && <span className="text-[10px]">›</span>}
                    </button>
                  </div>
                  <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent -mx-4.5 mb-3" />
                </div>

                {/* Core Builds List */}
                <LayoutGroup>
                  <motion.div layout className="space-y-2">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {(() => {
                        const combinations = coreBuildsView === 'best' ? bestCombinations : worstCombinations
                        const isWorst = coreBuildsView === 'worst'
                        
                        if (combinations.length === 0) return null
                        
                        const visibleCombos = showAllBuilds ? combinations : combinations.slice(0, 5)
                        
                        return (
                          <>
                            {visibleCombos.map((combo, idx) => (
                              <motion.button
                                layout
                                key={`${coreBuildsView}-${combo.originalIndex}`}
                                initial={{ opacity: 0, x: isWorst ? 20 : -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: isWorst ? -20 : 20 }}
                                transition={{ duration: 0.2, delay: idx * 0.02 }}
                                ref={(el) => {
                                  if (el) buttonRefs.current.set(combo.originalIndex, el)
                                  else buttonRefs.current.delete(combo.originalIndex)
                                }}
                                onClick={() => setSelectedCombo(combo.originalIndex)}
                                className={clsx(
                                  'w-full text-left p-3 rounded-lg transition-colors relative',
                                  isWorst
                                    ? selectedCombo === combo.originalIndex ? 'bg-loss-light' : 'bg-loss hover:bg-loss-light'
                                    : selectedCombo === combo.originalIndex ? 'bg-abyss-700' : 'bg-abyss-800 hover:bg-abyss-700'
                                )}
                              >
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  {combo.items
                                    .filter(item => item.item_id !== 99999)
                                    .map((item, position) => (
                                      <div key={position} className="flex items-center gap-1">
                                        {position > 0 && <span className="text-gray-600 text-xs">+</span>}
                                        <ItemIcon
                                          itemId={item.item_id}
                                          ddragonVersion={ddragonVersion}
                                          size="sm"
                                          className="flex-shrink-0 bg-abyss-900 border-gray-700"
                                        />
                                      </div>
                                    ))}
                                  {combo.hasBoots && (
                                    <>
                                      <span className="text-gray-600 text-xs">+</span>
                                      <div className="w-7 h-7 rounded bg-abyss-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[9px] text-gray-400 text-center leading-tight px-0.5">
                                          Any
                                          <br />
                                          Boots
                                        </span>
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
                              </motion.button>
                            ))}
                          </>
                        )
                      })()}
                    </AnimatePresence>
                    
                    {/* Show more/less button */}
                    {((coreBuildsView === 'best' ? bestCombinations : worstCombinations).length > 5) && (
                      <motion.button
                        layout
                        onClick={() => setShowAllBuilds(!showAllBuilds)}
                        className={clsx(
                          "w-full text-center py-2 text-xs text-subtitle hover:text-white transition-colors rounded-lg border border-gold-dark/40 hover:border-gold-dark/60 flex items-center justify-center gap-1",
                          coreBuildsView === 'worst' ? "bg-loss hover:bg-loss-light" : "bg-abyss-700 hover:bg-abyss-600"
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
                            <span>Show more ({(coreBuildsView === 'best' ? bestCombinations : worstCombinations).length - 5})</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        )}
                      </motion.button>
                    )}
                  </motion.div>
                </LayoutGroup>

                {/* Empty state */}
                {((coreBuildsView === 'best' && bestCombinations.length === 0) ||
                  (coreBuildsView === 'worst' && worstCombinations.length === 0)) && (
                  <div className="text-xs text-muted text-center py-4">
                    No {coreBuildsView} core builds found
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="col-span-12 lg:col-span-9 xl:col-span-9 space-y-4">
            {/* Items Section with Rune Tree - shows build order when combo selected */}
            <Card title="Items">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Items Grid */}
                <div className="flex-1">
                  {selectedComboData && selectedComboDisplay ? (
                    <div>
                      <div className="text-sm text-text-muted mb-6">
                        Showing most common items built in each slot with this combination (
                        {selectedComboDisplay.estimatedGames.toLocaleString()} games)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[1, 2, 3, 4, 5, 6].map(slotNum => {
                          // Use selectedComboData which is correctly indexed from allBuildData
                          const itemsInSlot: Array<{ itemId: number; games: number; winrate: number }> = []

                          // iterate through ALL items in the combo's itemStats (not just the 3 core items)
                          if (selectedComboData?.itemStats) {
                            Object.entries(selectedComboData.itemStats).forEach(([itemIdStr, itemData]) => {
                              const itemId = parseInt(itemIdStr)

                              // check if this item appears in this slot
                              if (itemData.positions?.[slotNum]) {
                                const posData = itemData.positions[slotNum]
                                itemsInSlot.push({
                                  itemId: itemId,
                                  games: posData.games,
                                  winrate: posData.games > 0 ? (posData.wins / posData.games) * 100 : 0,
                                })
                              }
                            })
                          }

                          // sort by games and take top 3
                          itemsInSlot.sort((a, b) => b.games - a.games)
                          const top3 = itemsInSlot.slice(0, 3)

                          return (
                            <div key={slotNum}>
                              <div className="text-center text-xl font-bold mb-3 text-white">{slotNum}</div>
                              <div className="space-y-2">
                                {top3.length > 0 ? (
                                  top3.map((itemData, idx) => (
                                    <div key={idx} className="flex justify-center mb-1">
                                      <ItemIcon
                                        itemId={itemData.itemId}
                                        ddragonVersion={ddragonVersion}
                                        size="xl"
                                        winrate={itemData.winrate}
                                        games={itemData.games}
                                      />
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
                </div>
              </div>
            </Card>

            {/* Runes Section - Full rune page with all options visible */}
            <Card title="Runes" headerRight={LowSampleWarning}>
              {(() => {
                // Convert combo runes data to RuneStat-like format if available
                type ComboRuneData = { rune_id: number; games: number; wins: number; winrate: number }
                let comboRunes: ComboRuneData[] = []
                
                if (!useGlobalDataForNonItems && selectedComboData?.runes) {
                  // Merge primary and secondary runes from combo
                  const runeEntries: [string, { games: number; wins: number }][] = []
                  if (selectedComboData.runes.primary) {
                    runeEntries.push(...Object.entries(selectedComboData.runes.primary))
                  }
                  if (selectedComboData.runes.secondary) {
                    runeEntries.push(...Object.entries(selectedComboData.runes.secondary))
                  }
                  
                  // Only include runes that meet the 2% pickrate threshold
                  comboRunes = runeEntries
                    .filter(([, data]) => meetsPickrateThreshold(data.games))
                    .map(([runeId, data]) => ({
                      rune_id: parseInt(runeId),
                      games: data.games,
                      wins: data.wins,
                      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
                    }))
                }

                // Use combo runes if we have them (already filtered by useGlobalDataForNonItems)
                const useComboRunes = comboRunes.length > 0
                
                // Get all runes from global stats (for fallback and tier lookup)
                const allGlobalRunes: RuneStat[] = []
                Object.values(runeStats).forEach(slotRunes => {
                  slotRunes.forEach(rune => {
                    if (!allGlobalRunes.find(r => r.rune_id === rune.rune_id)) {
                      allGlobalRunes.push(rune)
                    }
                  })
                })

                // Calculate total games for pickrate baseline
                const runesSource = useComboRunes ? comboRunes : allGlobalRunes

                // Use Wilson score for ranking - same as core builds
                const getWilsonScoreForRune = (rune: { games: number; wins?: number; winrate?: number }) => {
                  const wins = rune.wins ?? (rune.winrate ? Math.round(rune.games * rune.winrate / 100) : 0)
                  return calculateWilsonScore(rune.games, wins)
                }

                // Find best keystone by Wilson score
                const keystones = runesSource.filter(r => getRuneTree(r.rune_id)?.tier === 'keystone')
                const bestKeystone = keystones.sort((a, b) => getWilsonScoreForRune(b) - getWilsonScoreForRune(a))[0]

                if (!bestKeystone) return <div className="text-center text-subtitle py-4">No rune data available</div>

                const primaryTreeInfo = getRuneTree(bestKeystone.rune_id)
                if (!primaryTreeInfo) return null

                // Get best rune for each tier in the primary tree
                const primaryTreeName = primaryTreeInfo.tree.name.toLowerCase()
                const getBestRuneForTier = (tier: 'tier1' | 'tier2' | 'tier3') => {
                  // Filter runes for this tier from combo data
                  const tierRunes = runesSource.filter(r => {
                    const info = getRuneTree(r.rune_id)
                    return info?.tree.name.toLowerCase() === primaryTreeName && info?.tier === tier
                  })
                  // If no combo runes meet threshold for this tier, fall back to global
                  if (useComboRunes && tierRunes.length === 0) {
                    const globalTierRunes = allGlobalRunes.filter(r => {
                      const info = getRuneTree(r.rune_id)
                      return info?.tree.name.toLowerCase() === primaryTreeName && info?.tier === tier
                    })
                    return globalTierRunes.sort((a, b) => getWilsonScoreForRune(b) - getWilsonScoreForRune(a))[0]
                  }
                  return tierRunes.sort((a, b) => getWilsonScoreForRune(b) - getWilsonScoreForRune(a))[0]
                }

                const bestTier1 = getBestRuneForTier('tier1')
                const bestTier2 = getBestRuneForTier('tier2')
                const bestTier3 = getBestRuneForTier('tier3')

                // Find best secondary tree (not primary)
                const secondaryTreeRunes = runesSource.filter(r => {
                  const info = getRuneTree(r.rune_id)
                  return info && info.tree.name.toLowerCase() !== primaryTreeName && info.tier !== 'keystone'
                })

                // Group by tree and find which tree has highest total Wilson score
                const treeScores: Record<string, number> = {}
                secondaryTreeRunes.forEach(rune => {
                  const info = getRuneTree(rune.rune_id)
                  if (!info) return
                  const treeName = info.tree.name.toLowerCase()
                  treeScores[treeName] = (treeScores[treeName] || 0) + getWilsonScoreForRune(rune)
                })

                const bestSecondaryTreeName = Object.entries(treeScores).sort((a, b) => b[1] - a[1])[0]?.[0]
                const bestSecondaryTree = bestSecondaryTreeName
                  ? RUNE_TREES[bestSecondaryTreeName as keyof typeof RUNE_TREES]
                  : null

                // Get top 2 runes from secondary tree by Wilson score
                const secondaryRunesList = secondaryTreeRunes
                  .filter(r => getRuneTree(r.rune_id)?.tree.name.toLowerCase() === bestSecondaryTreeName)
                  .sort((a, b) => getWilsonScoreForRune(b) - getWilsonScoreForRune(a))
                  .slice(0, 2)

                const primaryTree = primaryTreeInfo.tree
                const selectedRuneIds = new Set([
                  bestKeystone.rune_id,
                  bestTier1?.rune_id,
                  bestTier2?.rune_id,
                  bestTier3?.rune_id,
                  ...secondaryRunesList.map(r => r.rune_id)
                ].filter(Boolean) as number[])

                // Get best stat perks by Wilson score - returns index
                // Use combo-specific tertiary data if available and has enough games, otherwise fall back to global
                type StatPerk = { id: number; name: string; icon: string }
                type TertiaryData = Record<string, { games: number; wins: number }>
                
                // Get combo tertiary data if available
                const comboTertiary = selectedComboData?.runes?.tertiary as { 
                  offense?: TertiaryData
                  flex?: TertiaryData
                  defense?: TertiaryData 
                } | undefined
                
                // Use combo data only if we're NOT using global for non-items
                const useComboTertiary = !useGlobalDataForNonItems && !!comboTertiary
                
                const getBestStatPerkIndexFromCombo = (
                  perks: readonly StatPerk[], 
                  comboData: TertiaryData | undefined,
                  globalData: StatPerkStat[],
                  useCombo: boolean
                ): number => {
                  let bestIdx = 0
                  let bestScore = 0
                  
                  perks.forEach((perk, idx) => {
                    let games = 0
                    let wins = 0
                    
                    // Use combo data only if it meets 2% pickrate threshold
                    if (useCombo && comboData && comboData[perk.id.toString()]) {
                      const comboStat = comboData[perk.id.toString()]
                      if (meetsPickrateThreshold(comboStat.games)) {
                        games = comboStat.games
                        wins = comboStat.wins
                      } else {
                        // Fall back to global if combo doesn't meet threshold
                        const stat = globalData.find(s => s.key === perk.id.toString())
                        if (stat) {
                          games = stat.games
                          wins = stat.wins
                        }
                      }
                    } else {
                      // Fall back to global data
                      const stat = globalData.find(s => s.key === perk.id.toString())
                      if (stat) {
                        games = stat.games
                        wins = stat.wins
                      }
                    }
                    
                    if (games > 0) {
                      const score = calculateWilsonScore(games, wins)
                      if (score > bestScore) {
                        bestScore = score
                        bestIdx = idx
                      }
                    }
                  })
                  return bestIdx
                }

                const bestOffenseIdx = getBestStatPerkIndexFromCombo(
                  STAT_PERKS.offense, 
                  comboTertiary?.offense, 
                  statPerks.offense,
                  useComboTertiary
                )
                const bestFlexIdx = getBestStatPerkIndexFromCombo(
                  STAT_PERKS.flex, 
                  comboTertiary?.flex, 
                  statPerks.flex,
                  useComboTertiary
                )
                const bestDefenseIdx = getBestStatPerkIndexFromCombo(
                  STAT_PERKS.defense, 
                  comboTertiary?.defense, 
                  statPerks.defense,
                  useComboTertiary
                )
                
                // Helper to render a rune icon with selected/unselected state
                const renderRune = (runeId: number, isKeystone: boolean = false) => {
                  const runeInfo = (runesData as Record<string, any>)[runeId.toString()]
                  const isSelected = selectedRuneIds.has(runeId)
                  const size = isKeystone ? 'w-9 h-9' : 'w-7 h-7'
                  const imgSize = isKeystone ? 36 : 28
                  
                  return (
                    <Tooltip key={runeId} id={runeId} type="rune">
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
                    </Tooltip>
                  )
                }

                // Helper to render stat shard row
                const renderStatShardRow = (shardOptions: readonly StatPerk[], selectedIdx: number) => {
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
                  <div>
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
                        
                        {/* Tier runes only (no keystones for secondary) */}
                        {[bestSecondaryTree.tier1, bestSecondaryTree.tier2, bestSecondaryTree.tier3].map((tier, idx) => (
                          <div key={idx} className="grid grid-cols-3 gap-1 justify-items-center mb-1 last:mb-0">
                            {tier.map(id => renderRune(id))}
                          </div>
                        ))}
                        
                        {/* Stat Shards - under separator in secondary tree */}
                        <div className="border-t border-gray-700/50 my-2" />
                        <div className="flex flex-col gap-1">
                          {renderStatShardRow(STAT_PERKS.offense, bestOffenseIdx)}
                          {renderStatShardRow(STAT_PERKS.flex, bestFlexIdx)}
                          {renderStatShardRow(STAT_PERKS.defense, bestDefenseIdx)}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                )
              })()}
            </Card>

            {/* Starting Items, Spells, Level Order Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Starting Items */}
              <Card title="Starting Items" headerRight={LowSampleWarning}>
                {(() => {
                  // Use combo-specific starting items if available and combo has enough games
                  if (!useGlobalDataForNonItems && selectedComboData?.starting && Object.keys(selectedComboData.starting).length > 0) {
                    const sortedStarting = Object.entries(selectedComboData.starting)
                      .filter(([, data]) => meetsPickrateThreshold(data.games)) // 2% pickrate filter
                      .map(([key, data]) => ({
                        items: key.split(',').map(Number),
                        games: data.games,
                        wins: data.wins,
                        winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
                        wilsonScore: calculateWilsonScore(data.games, data.wins),
                      }))
                      .sort((a, b) => b.wilsonScore - a.wilsonScore) // Sort by Wilson score
                    
                    if (sortedStarting.length > 0) {
                      const best = sortedStarting[0]
                      return (
                        <div>
                          <div className="flex gap-2 mb-2 text-sm">
                            <div className="text-white font-bold" style={{ color: getWinrateColor(best.winrate) }}>
                              {best.winrate.toFixed(1)}%
                            </div>
                            <div className="text-subtitle">{best.games.toLocaleString()}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {best.items.map((itemId, itemIdx) => (
                              <ItemIcon
                                key={itemIdx}
                                itemId={itemId}
                                ddragonVersion={ddragonVersion}
                                size="lg"
                                className="bg-abyss-800 border-gray-700"
                              />
                            ))}
                          </div>
                        </div>
                      )
                    }
                  }
                  
                  // Fallback to global starter items - sort by Wilson score
                  if (starterItems.length > 0) {
                    const sortedStarters = [...starterItems]
                      .map(s => ({
                        ...s,
                        wilsonScore: calculateWilsonScore(s.games, s.wins),
                      }))
                      .sort((a, b) => b.wilsonScore - a.wilsonScore)
                    const best = sortedStarters[0]
                    return (
                      <div>
                        <div className="flex gap-2 mb-2 text-sm">
                          <div className="text-white font-bold" style={{ color: getWinrateColor(best.winrate) }}>
                            {best.winrate.toFixed(1)}%
                          </div>
                          <div className="text-subtitle">{best.games.toLocaleString()}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {best.items.map((itemId, itemIdx) => (
                            <ItemIcon
                              key={itemIdx}
                              itemId={itemId}
                              ddragonVersion={ddragonVersion}
                              size="lg"
                              className="bg-abyss-800 border-gray-700"
                            />
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
                  // Use combo-specific spells if available and combo has enough games
                  if (!useGlobalDataForNonItems && selectedComboData?.spells && Object.keys(selectedComboData.spells).length > 0) {
                    const sortedSpells = Object.entries(selectedComboData.spells)
                      .filter(([, data]) => meetsPickrateThreshold(data.games)) // 2% pickrate filter
                      .map(([key, data]) => {
                        const [spell1, spell2] = key.split('_').map(Number)
                        return {
                          spell1_id: spell1,
                          spell2_id: spell2,
                          games: data.games,
                          wins: data.wins,
                          winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
                          wilsonScore: calculateWilsonScore(data.games, data.wins),
                        }
                      })
                      .sort((a, b) => b.wilsonScore - a.wilsonScore) // Sort by Wilson score
                    
                    if (sortedSpells.length > 0) {
                      const best = sortedSpells[0]
                      return (
                        <div>
                          <div className="flex gap-2 mb-2 text-sm">
                            <div className="text-white font-bold" style={{ color: getWinrateColor(best.winrate) }}>
                              {best.winrate.toFixed(1)}%
                            </div>
                            <div className="text-subtitle">{best.games.toLocaleString()}</div>
                          </div>
                          <div className="flex gap-2">
                            <Tooltip id={best.spell1_id} type="summoner-spell">
                              <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer">
                                <Image
                                  src={getSummonerSpellUrl(best.spell1_id, ddragonVersion)}
                                  alt=""
                                  width={40}
                                  height={40}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              </div>
                            </Tooltip>
                            <Tooltip id={best.spell2_id} type="summoner-spell">
                              <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer">
                                <Image
                                  src={getSummonerSpellUrl(best.spell2_id, ddragonVersion)}
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
                      )
                    }
                  }
                  
                  // Fallback to global summoner spell stats - sort by Wilson score
                  if (summonerSpellStats.length > 0) {
                    const sortedSpells = [...summonerSpellStats]
                      .map(s => ({
                        ...s,
                        wilsonScore: calculateWilsonScore(s.games, s.wins),
                      }))
                      .sort((a, b) => b.wilsonScore - a.wilsonScore)
                    const best = sortedSpells[0]
                    return (
                      <div>
                        <div className="flex gap-2 mb-2 text-sm">
                          <div
                            className="text-white font-bold"
                            style={{ color: getWinrateColor(best.winrate) }}
                          >
                            {best.winrate.toFixed(1)}%
                          </div>
                          <div className="text-subtitle">{best.games.toLocaleString()}</div>
                        </div>
                        <div className="flex gap-2">
                          <Tooltip id={best.spell1_id} type="summoner-spell">
                            <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer">
                              <Image
                                src={getSummonerSpellUrl(best.spell1_id, ddragonVersion)}
                                alt=""
                                width={40}
                                height={40}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </div>
                          </Tooltip>
                          <Tooltip id={best.spell2_id} type="summoner-spell">
                            <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer">
                              <Image
                                src={getSummonerSpellUrl(best.spell2_id, ddragonVersion)}
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
                    )
                  }
                  
                  return <div className="text-xs text-gray-500">No data</div>
                })()}
              </Card>

              {/* Level Order */}
              <Card title="Skill Max Order" headerRight={useGlobalDataForNonItems ? LowSampleWarning : undefined}>
                {(() => {
                  // Use per-core skill data if available and has enough games
                  const comboSkills = selectedComboData?.skills
                  const useComboSkills = comboHasEnoughGames && comboSkills && Object.keys(comboSkills).length > 0
                  
                  if (useComboSkills) {
                    // Convert combo skills to ability stats format and filter by pickrate
                    const skillsArray = Object.entries(comboSkills)
                      .filter(([, stats]) => meetsPickrateThreshold(stats.games))
                      .map(([order, stats]) => ({
                        ability_order: order,
                        games: stats.games,
                        wins: stats.wins,
                        winrate: stats.games > 0 ? (stats.wins / stats.games) * 100 : 0,
                        wilsonScore: calculateWilsonScore(stats.games, stats.wins),
                      }))
                      .sort((a, b) => b.wilsonScore - a.wilsonScore)
                    
                    if (skillsArray.length > 0) {
                      const best = skillsArray[0]
                      return (
                        <div>
                          <div className="flex gap-2 mb-3 text-sm">
                            <div
                              className="text-white font-bold"
                              style={{ color: getWinrateColor(best.winrate) }}
                            >
                              {best.winrate.toFixed(1)}%
                            </div>
                            <div className="text-subtitle">{best.games.toLocaleString()}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getAbilityMaxOrder(best.ability_order)
                              .split(' > ')
                              .map((ability, idx, arr) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <div className="w-10 h-10 flex items-center justify-center rounded-lg font-bold text-lg bg-abyss-800 border border-gray-600 text-white">
                                    {ability}
                                  </div>
                                  {idx < arr.length - 1 && <span className="text-gray-500 font-bold">&gt;</span>}
                                </div>
                              ))}
                          </div>
                        </div>
                      )
                    }
                  }
                  
                  // Fall back to global ability stats
                  if (abilityLevelingStats.length > 0) {
                    const sortedAbilities = [...abilityLevelingStats]
                      .map(s => ({
                        ...s,
                        wilsonScore: calculateWilsonScore(s.games, s.wins),
                      }))
                      .sort((a, b) => b.wilsonScore - a.wilsonScore)
                    const best = sortedAbilities[0]
                    return (
                      <div>
                        <div className="flex gap-2 mb-3 text-sm">
                          <div
                            className="text-white font-bold"
                            style={{ color: getWinrateColor(best.winrate) }}
                          >
                            {best.winrate.toFixed(1)}%
                          </div>
                          <div className="text-subtitle">{best.games.toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getAbilityMaxOrder(best.ability_order)
                            .split(' > ')
                            .map((ability, idx, arr) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div className="w-10 h-10 flex items-center justify-center rounded-lg font-bold text-lg bg-abyss-800 border border-gray-600 text-white">
                                  {ability}
                                </div>
                                {idx < arr.length - 1 && <span className="text-gray-500 font-bold">&gt;</span>}
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
      )}

      {/* Items Tab */}
      {selectedTab === 'items' && (
        <div className="space-y-6 pb-8">
          {/* Starter Items Section */}
          {starterItems.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gold-light">Starter Items</h2>
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
            </div>
          )}

          {/* Boots Section */}
          {bootsItems.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gold-light">Boots</h2>
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
            </div>
          )}

          {/* Item Slots */}
          {[0, 1, 2, 3, 4, 5].map(slot => {
            const items = itemsBySlot[slot]
            if (!items || items.length === 0) return null

            return (
              <div key={slot}>
                <h2 className="text-lg font-semibold mb-3 text-gold-light">{slot === 0 ? 'Slot 1' : `Slot ${slot + 1}`}</h2>
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
              </div>
            )
          })}
        </div>
      )}

      {/* Runes Tab */}
      {selectedTab === 'runes' && (
        <div className="space-y-6 pb-8">
          {(() => {
            // Collect PRIMARY runes from slots 0-3 (keystone + primary tree tiers)
            const primaryRunesMap = new Map<number, RuneStat>()
            ;[0, 1, 2, 3].forEach(slot => {
              runeStats[slot]?.forEach(rune => {
                if (!primaryRunesMap.has(rune.rune_id)) {
                  primaryRunesMap.set(rune.rune_id, rune)
                }
              })
            })

            // Collect SECONDARY runes from slots 4-5 (secondary tree tiers only)
            const secondaryRunesMap = new Map<number, RuneStat>()
            ;[4, 5].forEach(slot => {
              runeStats[slot]?.forEach(rune => {
                if (!secondaryRunesMap.has(rune.rune_id)) {
                  secondaryRunesMap.set(rune.rune_id, rune)
                }
              })
            })

            // Fixed tree order: Precision, Domination, Sorcery, Resolve, Inspiration
            const treeOrder = ['precision', 'domination', 'sorcery', 'resolve', 'inspiration']

            // Render a single rune icon with stats
            const renderRune = (runeId: number, statsMap: Map<number, RuneStat>, size: 'lg' | 'sm' = 'sm') => {
              const runeInfo = (runesData as Record<string, any>)[runeId.toString()]
              const runeStat = statsMap.get(runeId)
              const hasData = runeStat && runeStat.games > 0
              const isLowPickrate = runeStat && runeStat.pickrate < 1
              const shouldGrey = !hasData || isLowPickrate
              const sizeClass = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
              const imgSize = size === 'lg' ? 40 : 32
              
              return (
                <Tooltip key={runeId} id={runeId} type="rune">
                  <div className="flex flex-col items-center cursor-pointer">
                    <div className={clsx(
                      sizeClass, "rounded-full overflow-hidden",
                      shouldGrey && "opacity-40"
                    )}>
                      {runeInfo?.icon && (
                        <Image
                          src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                          alt=""
                          width={imgSize}
                          height={imgSize}
                          className={clsx("w-full h-full", shouldGrey && "grayscale")}
                          unoptimized
                        />
                      )}
                    </div>
                    <div className="text-[10px] text-center mt-1">
                      {hasData ? (
                        <>
                          <div className={clsx("font-bold", isLowPickrate && "text-gray-600")} style={!isLowPickrate ? { color: getWinrateColor(runeStat.winrate) } : undefined}>
                            {runeStat.winrate.toFixed(1)}%
                          </div>
                          <div className={clsx(isLowPickrate ? "text-gray-600" : "text-subtitle")}>{runeStat.games.toLocaleString()}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-gray-600">-</div>
                          <div className="text-gray-600">0</div>
                        </>
                      )}
                    </div>
                  </div>
                </Tooltip>
              )
            }

            return (
              <>
                {/* Primary Runes Section */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {treeOrder.map(treeName => {
                    const tree = RUNE_TREES[treeName as keyof typeof RUNE_TREES]
                    if (!tree) return null

                    return (
                      <div key={treeName} className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-3">
                        {/* Tree Header */}
                        <div className="flex items-center gap-2 mb-6">
                          <h2 className="text-sm font-bold text-white">{tree.name}</h2>
                          <span className="text-xs text-text-muted">Primary</span>
                        </div>

                        {/* Keystones Row */}
                        <div className={clsx(
                          "grid gap-1 justify-items-center mb-3",
                          tree.keystones.length === 4 ? "grid-cols-4" : "grid-cols-3"
                        )}>
                          {tree.keystones.map(runeId => renderRune(runeId, primaryRunesMap, 'lg'))}
                        </div>

                        {/* Separator */}
                        <div className="border-t border-gold-dark/40 my-3" />

                        {/* Tier Runes */}
                        {[tree.tier1, tree.tier2, tree.tier3].map((tierRuneIds, tierIdx) => (
                          <div key={tierIdx} className="mb-2 last:mb-0">
                            <div className="grid grid-cols-3 gap-1 justify-items-center">
                              {tierRuneIds.map(runeId => renderRune(runeId, primaryRunesMap))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>

                {/* Secondary Runes Section */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {treeOrder.map(treeName => {
                    const tree = RUNE_TREES[treeName as keyof typeof RUNE_TREES]
                    if (!tree) return null

                    return (
                      <div key={treeName} className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-3">
                        {/* Tree Header */}
                        <div className="flex items-center gap-2 mb-6">
                          <h2 className="text-sm font-bold text-white">{tree.name}</h2>
                          <span className="text-xs text-text-muted">Secondary</span>
                        </div>

                        {/* Tier Runes Only (no keystones for secondary) */}
                        {[tree.tier1, tree.tier2, tree.tier3].map((tierRuneIds, tierIdx) => (
                          <div key={tierIdx} className="mb-2 last:mb-0">
                            <div className="grid grid-cols-3 gap-1 justify-items-center">
                              {tierRuneIds.map(runeId => renderRune(runeId, secondaryRunesMap))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>

                {/* Stat Shards Section - 3 separate boxes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Offense Box */}
                  <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-3">
                    <div className="flex items-center gap-2 mb-6">
                      <h2 className="text-sm font-bold text-white">Offense</h2>
                      <span className="text-xs text-text-muted">Stats</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 justify-items-center">
                      {STAT_PERKS.offense.map((perk, idx) => {
                        const stat = statPerks.offense.find(s => s.key === perk.id.toString())
                        const hasData = stat && stat.games > 0
                        const pickrate = hasData && totalGames > 0 ? (stat.games / totalGames) * 100 : 0
                        const isLowPickrate = pickrate < 1
                        const shouldGrey = !hasData || isLowPickrate
                        return (
                          <div key={`offense-${idx}`} className="flex flex-col items-center">
                            <div className={clsx(
                              "w-8 h-8 rounded-full overflow-hidden",
                              shouldGrey && "opacity-40"
                            )}>
                              <Image
                                src={`https://ddragon.leagueoflegends.com/cdn/img/${perk.icon}`}
                                alt={perk.name}
                                width={32}
                                height={32}
                                className={clsx("w-full h-full", shouldGrey && "grayscale")}
                                unoptimized
                              />
                            </div>
                            <div className="text-[10px] text-center mt-1">
                              {hasData ? (
                                <>
                                  <div className={clsx("font-bold", isLowPickrate && "text-gray-600")} style={!isLowPickrate ? { color: getWinrateColor(stat.winrate) } : undefined}>
                                    {stat.winrate.toFixed(1)}%
                                  </div>
                                  <div className={clsx(isLowPickrate ? "text-gray-600" : "text-subtitle")}>{stat.games.toLocaleString()}</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-gray-600">-</div>
                                  <div className="text-gray-600">0</div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Flex Box */}
                  <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-sm font-bold text-white">Flex</h2>
                      <span className="text-xs text-text-muted">Stats</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 justify-items-center">
                      {STAT_PERKS.flex.map((perk, idx) => {
                        const stat = statPerks.flex.find(s => s.key === perk.id.toString())
                        const hasData = stat && stat.games > 0
                        const pickrate = hasData && totalGames > 0 ? (stat.games / totalGames) * 100 : 0
                        const isLowPickrate = pickrate < 1
                        const shouldGrey = !hasData || isLowPickrate
                        return (
                          <div key={`flex-${idx}`} className="flex flex-col items-center">
                            <div className={clsx(
                              "w-8 h-8 rounded-full overflow-hidden",
                              shouldGrey && "opacity-40"
                            )}>
                              <Image
                                src={`https://ddragon.leagueoflegends.com/cdn/img/${perk.icon}`}
                                alt={perk.name}
                                width={32}
                                height={32}
                                className={clsx("w-full h-full", shouldGrey && "grayscale")}
                                unoptimized
                              />
                            </div>
                            <div className="text-[10px] text-center mt-1">
                              {hasData ? (
                                <>
                                  <div className={clsx("font-bold", isLowPickrate && "text-gray-600")} style={!isLowPickrate ? { color: getWinrateColor(stat.winrate) } : undefined}>
                                    {stat.winrate.toFixed(1)}%
                                  </div>
                                  <div className={clsx(isLowPickrate ? "text-gray-600" : "text-subtitle")}>{stat.games.toLocaleString()}</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-gray-600">-</div>
                                  <div className="text-gray-600">0</div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Defense Box */}
                  <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-sm font-bold text-white">Defense</h2>
                      <span className="text-xs text-text-muted">Stats</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 justify-items-center">
                      {STAT_PERKS.defense.map((perk, idx) => {
                        const stat = statPerks.defense.find(s => s.key === perk.id.toString())
                        const hasData = stat && stat.games > 0
                        const pickrate = hasData && totalGames > 0 ? (stat.games / totalGames) * 100 : 0
                        const isLowPickrate = pickrate < 1
                        const shouldGrey = !hasData || isLowPickrate
                        return (
                          <div key={`defense-${idx}`} className="flex flex-col items-center">
                            <div className={clsx(
                              "w-8 h-8 rounded-full overflow-hidden",
                              shouldGrey && "opacity-40"
                            )}>
                              <Image
                                src={`https://ddragon.leagueoflegends.com/cdn/img/${perk.icon}`}
                                alt={perk.name}
                                width={32}
                                height={32}
                                className={clsx("w-full h-full", shouldGrey && "grayscale")}
                                unoptimized
                              />
                            </div>
                            <div className="text-[10px] text-center mt-1">
                              {hasData ? (
                                <>
                                  <div className={clsx("font-bold", isLowPickrate && "text-gray-600")} style={!isLowPickrate ? { color: getWinrateColor(stat.winrate) } : undefined}>
                                    {stat.winrate.toFixed(1)}%
                                  </div>
                                  <div className={clsx(isLowPickrate ? "text-gray-600" : "text-subtitle")}>{stat.games.toLocaleString()}</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-gray-600">-</div>
                                  <div className="text-gray-600">0</div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )
          })()}

          {Object.keys(runeStats).length === 0 && (
            <div className="text-center text-gray-400 py-8">No rune data available</div>
          )}
        </div>
      )}

      {/* Leveling Order Tab */}
      {selectedTab === 'leveling' && (
        <div className="space-y-4 pb-8">
          {abilityLevelingStats.length > 0 ? (
            <>
              <div className="text-sm text-gray-400 mb-4">Most popular skill max orders</div>
              {abilityLevelingStats.map((stat, idx) => {
                const maxOrder = getAbilityMaxOrder(stat.ability_order)
                return (
                  <div key={idx} className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-4">
                    {/* Max Order Display */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {maxOrder.split(' > ').map((ability, abilityIdx, arr) => (
                          <div key={abilityIdx} className="flex items-center gap-2">
                            <div className="w-12 h-12 flex items-center justify-center rounded-lg font-bold text-xl bg-abyss-800 border border-gray-600 text-white">
                              {ability}
                            </div>
                            {abilityIdx < arr.length - 1 && (
                              <span className="text-gray-500 font-bold text-lg">&gt;</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 text-sm ml-auto">
                        <span className="text-subtitle">
                          Pick: <span className="font-bold text-white">{stat.pickrate.toFixed(1)}%</span>
                        </span>
                        <span className="text-subtitle">
                          Win:{' '}
                          <span className="font-bold" style={{ color: getWinrateColor(stat.winrate) }}>
                            {stat.winrate.toFixed(1)}%
                          </span>
                        </span>
                        <span className="text-subtitle">
                          Games: <span className="font-bold text-white">{stat.games.toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
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
