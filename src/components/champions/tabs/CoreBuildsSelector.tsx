'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import ItemIcon from '@/components/ui/ItemIcon'
import { getWinrateColor } from '@/lib/ui'
import type { ComboDisplay } from './OverviewTab'

interface CoreBuildsSelectorProps {
  bestCombinations: ComboDisplay[]
  worstCombinations: ComboDisplay[]
  ddragonVersion: string
  onComboSelect: (index: number) => void
  selectedCombo: number | null
}

export function CoreBuildsSelector({
  bestCombinations,
  worstCombinations,
  ddragonVersion,
  onComboSelect,
  selectedCombo,
}: CoreBuildsSelectorProps) {
  const [selectedBestCombo, setSelectedBestCombo] = useState<number | null>(null)
  const [selectedWorstCombo, setSelectedWorstCombo] = useState<number | null>(null)
  const [showAllBuilds, setShowAllBuilds] = useState(false)
  const [coreBuildsView, setCoreBuildsView] = useState<'best' | 'worst'>('best')
  const [selectorStyle, setSelectorStyle] = useState<{ top: number; height: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [viewJustChanged, setViewJustChanged] = useState(false)
  const prevViewRef = useRef<'best' | 'worst'>('best')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const buildsListRef = useRef<HTMLDivElement>(null)

  // initialize selected combos for each view
  useEffect(() => {
    setMounted(true)
    if (selectedBestCombo === null && bestCombinations.length > 0) {
      setSelectedBestCombo(bestCombinations[0].originalIndex)
    }
    if (selectedWorstCombo === null && worstCombinations.length > 0) {
      setSelectedWorstCombo(worstCombinations[0].originalIndex)
    }
  }, [bestCombinations, worstCombinations, selectedBestCombo, selectedWorstCombo])

  // sync with parent and notify on changes
  useEffect(() => {
    const currentCombo = coreBuildsView === 'best' ? selectedBestCombo : selectedWorstCombo
    if (currentCombo !== null && currentCombo !== selectedCombo) {
      onComboSelect(currentCombo)
    }
  }, [coreBuildsView, selectedBestCombo, selectedWorstCombo, selectedCombo, onComboSelect])

  // update selector position
  useLayoutEffect(() => {
    if (selectedCombo === null) return
    
    const button = buttonRefs.current.get(selectedCombo)
    const buildsList = buildsListRef.current
    if (button && buildsList) {
      const buildsListRect = buildsList.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      const newStyle = {
        top: buttonRect.top - buildsListRect.top,
        height: buttonRect.height,
      }
      
      // check if view changed - if so, set position immediately without animation
      if (prevViewRef.current !== coreBuildsView) {
        setViewJustChanged(true)
        setSelectorStyle(newStyle)
        prevViewRef.current = coreBuildsView
        // Reset flag after animation completes
        setTimeout(() => setViewJustChanged(false), 200)
      } else {
        setSelectorStyle(newStyle)
      }
    }
  }, [selectedCombo, coreBuildsView, showAllBuilds])

  const combinations = coreBuildsView === 'best' ? bestCombinations : worstCombinations
  const isWorst = coreBuildsView === 'worst'
  const visibleCombos = showAllBuilds ? combinations : combinations.slice(0, 5)

  return (
    <div className="sticky top-20 max-w-full" style={{ maxHeight: 'calc(100vh)' }}>
      {/* fixed Header */}
      <div className={clsx(
        "rounded-t-lg border border-b-0 border-gold-dark/40 px-4.5 py-2 pb-0 transition-colors duration-200",
        isWorst ? "bg-worst-dark" : "bg-abyss-600"
      )}>
        <div className="flex items-center justify-between gap-4 pb-1.5">
          <h2 className="text-lg font-semibold" style={{ color: isWorst ? 'oklch(62% 0.15 17.952)' : '#ffffff' }}>
            {coreBuildsView === 'best' ? 'Best' : 'Worst'} Core Builds
          </h2>
          <button
            onClick={() => setCoreBuildsView(coreBuildsView === 'best' ? 'worst' : 'best')}
            className="text-xs text-text-muted hover:text-white transition-colors flex items-center gap-0.5"
          >
            {isWorst && <span className="text-[10px]">‹</span>}
            <span>{coreBuildsView === 'best' ? 'Worst' : 'Best'}</span>
            {!isWorst && <span className="text-[10px]">›</span>}
          </button>
        </div>
        <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent -mx-4.5" />
      </div>

      {/* animated content Area */}
      <motion.div
        layout
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={clsx(
          "rounded-b-lg border border-t-0 border-gold-dark/40 overflow-hidden transition-colors duration-200",
          isWorst ? "bg-worst-dark" : "bg-abyss-600"
        )}
      >
        <div ref={containerRef} className="px-4.5 pb-2 pt-2">
          <motion.div 
            layout 
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-y-auto scrollbar-hide" 
            style={{ maxHeight: 'calc(100vh - 12rem)' }}
          >
          {combinations.length === 0 ? (
            <motion.div
              key={`${coreBuildsView}-empty`}
              initial={{ x: isWorst ? 200 : -200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: isWorst ? -200 : 200, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="text-sm text-text-muted text-center py-4 px-6"
            >
              No core builds discovered yet, check back later!
            </motion.div>
          ) : (
            <motion.div
              ref={buildsListRef}
              key={coreBuildsView}
              layout
              initial={mounted ? { x: isWorst ? 200 : -200, opacity: 0 } : false}
              animate={{ x: 0, opacity: 1 }}
              exit={mounted ? { x: isWorst ? -200 : 200, opacity: 0 } : undefined}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="space-y-2 relative"
            >
                {/* selector */}
                {selectedCombo !== null && selectorStyle && (
                  <div
                    className={clsx(
                      "absolute left-0 right-0 rounded-lg pointer-events-none z-10",
                      !viewJustChanged && "transition-all duration-200 ease-in-out"
                    )}
                    style={{ 
                      padding: '1px',
                      top: `${selectorStyle.top}px`,
                      height: `${selectorStyle.height}px`,
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
                      'w-full text-left p-3 rounded-lg relative',
                      isWorst ? 'bg-worst-darker' : 'bg-abyss-800'
                    )}
                  >
                    <div className="mb-2">
                      <div className="flex items-center justify-between">
                        {combo.itemIds.map((itemId, position) => (
                          <>
                            {position > 0 && <span key={`plus-${position}`} className="text-gray-600 text-xs">+</span>}
                            <ItemIcon key={itemId} itemId={itemId} ddragonVersion={ddragonVersion} size="sm" className="flex-shrink-0 bg-abyss-900 border-gray-700" />
                          </>
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
            )}
        </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
