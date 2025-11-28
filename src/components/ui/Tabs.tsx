"use client"

import { useState, useEffect, useCallback, ReactNode } from 'react'

export interface Tab {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  useUrlHash?: boolean
  onTabChange?: (tabId: string) => void
  className?: string
  tabClassName?: string
  activeTabClassName?: string
  inactiveTabClassName?: string
  contentClassName?: string
  /** keep rendered tabs in DOM (hidden) for instant switching */
  keepMounted?: boolean
}

export default function Tabs({
  tabs,
  defaultTab,
  useUrlHash = false,
  onTabChange,
  className = '',
  tabClassName = 'px-6 py-2 font-semibold tracking-wide transition-all border-b-2',
  activeTabClassName = 'border-accent-light text-white',
  inactiveTabClassName = 'border-transparent text-text-muted hover:text-white',
  contentClassName = '',
  keepMounted = true,
}: TabsProps) {
  const getTabFromHash = useCallback((): string => {
    if (typeof window === 'undefined' || !useUrlHash) return defaultTab || tabs[0]?.id || ''
    const hash = window.location.hash.slice(1)
    const validTab = tabs.find(t => t.id === hash)
    return validTab ? hash : defaultTab || tabs[0]?.id || ''
  }, [useUrlHash, defaultTab, tabs])

  const [selectedTab, setSelectedTab] = useState<string>(defaultTab || tabs[0]?.id || '')
  const [renderedTabs, setRenderedTabs] = useState<Set<string>>(new Set([defaultTab || tabs[0]?.id || '']))

  // sync tab with URL hash on mount and handle browser back/forward
  useEffect(() => {
    if (!useUrlHash) return
    
    const initialTab = getTabFromHash()
    if (initialTab !== selectedTab) {
      setSelectedTab(initialTab)
      setRenderedTabs(prev => new Set([...prev, initialTab]))
    }

    const handlePopState = () => {
      const tab = getTabFromHash()
      setSelectedTab(tab)
      setRenderedTabs(prev => new Set([...prev, tab]))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [useUrlHash, getTabFromHash, selectedTab])

  const handleTabClick = useCallback((tabId: string) => {
    setSelectedTab(tabId)
    setRenderedTabs(prev => new Set([...prev, tabId]))

    if (useUrlHash) {
      const defaultId = defaultTab || tabs[0]?.id
      const newHash = tabId === defaultId ? '' : `#${tabId}`
      const newUrl = window.location.pathname + window.location.search + newHash
      window.history.pushState(null, '', newUrl)
    }

    onTabChange?.(tabId)
  }, [useUrlHash, defaultTab, tabs, onTabChange])

  if (tabs.length === 0) return null

  return (
    <div className={className}>
      {/* tab navigation */}
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`cursor-pointer ${tabClassName} ${
              selectedTab === tab.id ? activeTabClassName : inactiveTabClassName
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      <div className={contentClassName}>
        {keepMounted ? (
          // keep rendered tabs in DOM, hide with css
          tabs.map((tab) => {
            if (!renderedTabs.has(tab.id)) return null
            return (
              <div
                key={tab.id}
                className={selectedTab === tab.id ? '' : 'hidden'}
              >
                {tab.content}
              </div>
            )
          })
        ) : (
          // only render selected tab
          tabs.find(t => t.id === selectedTab)?.content
        )}
      </div>
    </div>
  )
}
