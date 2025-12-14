'use client'

import { useState, useEffect, useRef, useLayoutEffect, Fragment } from 'react'
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
  const [coreBuildsView, setCoreBuildsView] = useState<'best' | 'worst'>('best')
  const [selectorStyle, setSelectorStyle] = useState<{ top: number; height: number } | null>(null)
  const [viewJustChanged, setViewJustChanged] = useState(false)
  const [isScrollable, setIsScrollable] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const prevViewRef = useRef<'best' | 'worst'>('best')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const buildsListRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // initialize selected combos for each view
  useEffect(() => {
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
  }, [selectedCombo, coreBuildsView])

  const combinations = coreBuildsView === 'best' ? bestCombinations : worstCombinations
  const isWorst = coreBuildsView === 'worst'

  // check if content is scrollable
  useEffect(() => {
    if (scrollContainerRef.current) {
      const checkScrollable = () => {
        const element = scrollContainerRef.current
        if (element) {
          const scrollable = element.scrollHeight > element.clientHeight
          setIsScrollable(scrollable)
          
          // Check if at bottom
          if (scrollable) {
            const isBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 5
            setIsAtBottom(isBottom)
          } else {
            setIsAtBottom(false)
          }
        }
      }
      
      const element = scrollContainerRef.current
      
      checkScrollable()
      // Recheck after animations/layout changes
      const timer = setTimeout(checkScrollable, 400)
      
      // Add scroll listener
      const handleScroll = () => {
        if (element) {
          const isBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 5
          setIsAtBottom(isBottom)
        }
      }
      
      // Prevent page scroll when scrolling this element
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Manually handle scrolling - faster scroll speed
        element.scrollTop += e.deltaY * 2
      }
      
      element.addEventListener('scroll', handleScroll)
      element.addEventListener('wheel', handleWheel, { passive: false })
      
      return () => {
        clearTimeout(timer)
        element.removeEventListener('scroll', handleScroll)
        element.removeEventListener('wheel', handleWheel)
      }
    }
  }, [combinations, coreBuildsView])

  return (
    <div className="w-full lg:sticky lg:top-20">
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
            onClick={() => {
              // Reset scroll position before switching views
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0
              }
              setIsAtBottom(false)
              setCoreBuildsView(coreBuildsView === 'best' ? 'worst' : 'best')
            }}
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
      <div
        className={clsx(
          "rounded-b-lg border border-t-0 border-gold-dark/40 overflow-hidden transition-colors duration-200 relative",
          isWorst ? "bg-worst-dark" : "bg-abyss-600"
        )}
      >
        <div ref={containerRef} className="px-4.5 pb-2 pt-2 relative overflow-hidden" style={{ minHeight: '100px' }}>
          <AnimatePresence mode="wait" initial={false}>
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
                key={coreBuildsView}
                initial={{ x: isWorst ? 200 : -200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: isWorst ? -200 : 200, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <div 
                  ref={scrollContainerRef}
                  className="overflow-y-auto overflow-x-hidden scrollbar-hide" 
                  style={{ maxHeight: '500px' }}
                >
                  <div
                    ref={buildsListRef}
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
                
                {combinations.map((combo) => (
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
                          <Fragment key={`${combo.originalIndex}-item-${position}`}>
                            {position > 0 && <span className="text-gray-600 text-xs">+</span>}
                            <ItemIcon itemId={itemId} ddragonVersion={ddragonVersion} size="sm" className="flex-shrink-0 bg-abyss-900 border-gray-700" />
                          </Fragment>
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
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* scroll indicator */}
        <AnimatePresence>
          {isScrollable && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: isAtBottom ? 0 : 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none flex items-end justify-center pb-1"
              style={{
                background: isWorst 
                  ? 'linear-gradient(to bottom, transparent, oklch(25% 0.03 17.952))' 
                  : 'linear-gradient(to bottom, transparent, oklch(22% 0.02 240))'
              }}
            >
              <motion.svg
                className="w-4 h-4 text-gold-light"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                animate={{ y: [0, 3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </motion.svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
