'use client'

import { useState, useEffect, useRef, useLayoutEffect, Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import ItemIcon from '@/components/ui/ItemIcon'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
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
  const [coreBuildsView, setCoreBuildsView] = useState<'best' | 'worst'>('best')
  const [selectorStyle, setSelectorStyle] = useState<{ top: number; height: number } | null>(null)
  const [viewJustChanged, setViewJustChanged] = useState(false)
  const [hideScrollIndicator, setHideScrollIndicator] = useState(false)
  const [isScrollable, setIsScrollable] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null)
  const prevViewRef = useRef<'best' | 'worst'>('best')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const combinations = coreBuildsView === 'best' ? bestCombinations : worstCombinations
  const isWorst = coreBuildsView === 'worst'

  // Sync with hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash === 'best') setCoreBuildsView('best')
      else if (hash === 'worst') setCoreBuildsView('worst')
    }
    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // initialize selection if null
  useEffect(() => {
    if (selectedCombo === null && bestCombinations.length > 0) {
      onComboSelect(bestCombinations[0].originalIndex)
    }
  }, [selectedCombo, bestCombinations, onComboSelect])

  // update selector position
  useLayoutEffect(() => {
    if (selectedCombo === null || !contentNode) {
      setSelectorStyle(null)
      return
    }
    
    const button = buttonRefs.current.get(selectedCombo)
    const buildsList = contentNode
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
        // reset flag after animation
        setTimeout(() => setViewJustChanged(false), 200)
      } else {
        setSelectorStyle(newStyle)
      }
    } else {
      // if button not found (e.g. during view switch before selection update), hide selector
      setSelectorStyle(null)
    }
  }, [selectedCombo, coreBuildsView, combinations, contentNode])

  // check if content is scrollable
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    const content = contentNode
    
    if (!scrollContainer || !content) return

    const checkScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const scrollable = scrollHeight > clientHeight
      setIsScrollable(scrollable)
      
      if (scrollable) {
        // use a small tolerance for float/zoom issues
        const isBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 2
        setIsAtBottom(isBottom)
      } else {
        setIsAtBottom(false)
      }
    }
    
    // Initial check
    checkScroll()
    
    // Observe content size changes
    const resizeObserver = new ResizeObserver(() => {
      checkScroll()
    })
    resizeObserver.observe(content)
    resizeObserver.observe(scrollContainer)
    
    // Scroll listener
    const handleScroll = () => {
      requestAnimationFrame(checkScroll)
    }
    
    scrollContainer.addEventListener('scroll', handleScroll)
    
    return () => {
      resizeObserver.disconnect()
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [contentNode]) // Re-run when content node changes (mounts/unmounts)

  const handleViewSwitch = () => {
    // Hide scroll indicator immediately
    setHideScrollIndicator(true)
    
    const newView = coreBuildsView === 'best' ? 'worst' : 'best'
    const newCombinations = newView === 'best' ? bestCombinations : worstCombinations
    
    // Reset scroll position
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
    setIsAtBottom(false)
    
    // Update view state
    setCoreBuildsView(newView)
    window.location.hash = newView === 'best' ? 'best' : 'worst'
    
    // Immediately select the first item of the new view
    if (newCombinations.length > 0) {
      onComboSelect(newCombinations[0].originalIndex)
    }
    
    // Re-enable scroll indicator after animation
    setTimeout(() => setHideScrollIndicator(false), 400)
  }

  return (
    <div className="w-full h-full flex flex-col">
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
            onClick={handleViewSwitch}
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
        className={clsx(
          "rounded-b-lg border border-t-0 border-gold-dark/40 overflow-hidden transition-colors duration-200 relative flex-1",
          isWorst ? "bg-worst-dark" : "bg-abyss-600"
        )}
      >
        <div ref={containerRef} className="px-4.5 pb-3 pt-3 relative overflow-hidden" style={{ minHeight: '100px' }}>
          <AnimatePresence mode="wait" initial={false}>
            {combinations.length === 0 ? (
              <motion.div
                key={`${coreBuildsView}-empty`}
                initial={{ x: isWorst ? 200 : -200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: isWorst ? 200 : -200, opacity: 0 }}
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
                exit={{ x: isWorst ? 200 : -200, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <div 
                  ref={scrollContainerRef}
                  className="overflow-y-auto overflow-x-hidden scrollbar-hide overscroll-contain" 
                  style={{ maxHeight: '500px' }}
                >
                  <div
                    ref={setContentNode}
                    className="space-y-2 relative pb-3"
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
                    onClick={() => onComboSelect(combo.originalIndex)}
                    className={clsx(
                      'w-full text-left p-3 rounded-lg relative',
                      isWorst ? 'bg-worst-darker' : 'bg-abyss-800'
                    )}
                  >
                    <div className="mb-2">
                      <div className="flex items-center justify-between">
                        {combo.itemIds.map((itemId, position) => (
                          <Fragment key={`${combo.originalIndex}-item-${position}`}>
                            {position > 0 && <span className="text-gold-dark text-xs">+</span>}
                            <ItemIcon itemId={itemId} ddragonVersion={ddragonVersion} size="sm" className="flex-shrink-0" />
                          </Fragment>
                        ))}
                        {combo.hasBoots && (
                          <>
                            <span className="text-gold-dark text-xs">+</span>
                            <SimpleTooltip
                              content={
                                <div className="text-left p-1 min-w-0 max-w-[280px]">
                                  <div className="text-sm font-semibold text-gold-light mb-2">Any Boots</div>
                                  <div className="text-xs text-gray-300 leading-relaxed">
                                    Any boots item. Check detailed statistics for boots information in this build.
                                  </div>
                                </div>
                              }
                            >
                              <div className="w-7 h-7 rounded bg-abyss-900 border border-gold-dark flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] text-center leading-tight px-0.5">Any<br />Boots</span>
                              </div>
                            </SimpleTooltip>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs items-end">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold" style={{ color: getWinrateColor(combo.winrate) }}>{combo.winrate.toFixed(1)}% WR</span>
                        {combo.pickrate !== undefined && (
                          <span className="text-[10px]">{combo.pickrate.toFixed(1)}% Pick</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 items-end">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-text-muted">{Math.round(combo.games).toLocaleString()}</span>
                          <span className="text-[10px] text-text-muted">Games</span>
                        </div>
                      </div>
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
        <AnimatePresence mode="wait">
          {isScrollable && !hideScrollIndicator && (
            <motion.div
              key={coreBuildsView}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: isAtBottom ? 0 : 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none flex items-end justify-center pb-1 z-50 "
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
      </motion.div>
    </div>
  )
}
