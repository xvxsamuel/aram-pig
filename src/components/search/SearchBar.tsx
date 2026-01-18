'use client'
import { useRouter } from 'nextjs-toploader/app'
import RegionSelector from './RegionSelector'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { clsx } from 'clsx'
import { MagnifyingGlassIcon, UserIcon } from '@heroicons/react/24/outline'
import { getDefaultTag, PLATFORM_TO_LABEL, toLabel, type PlatformCode } from '@/lib/game'
import { 
  getChampionImageUrl, 
  getProfileIconUrl, 
  getChampionUrlName, 
  getLatestVersion,
  fetchChampionNames 
} from '@/lib/ddragon'
import Image from 'next/image'

// track if we've already prefetched to avoid duplicate work
let championIconsPrefetched = false

// prefetch all champion icons in batches to avoid overwhelming the browser
function prefetchChampionIcons(championIds: string[], version: string) {
  if (championIconsPrefetched) return
  championIconsPrefetched = true

  const batchSize = 20
  let currentBatch = 0

  function loadBatch() {
    const start = currentBatch * batchSize
    const end = Math.min(start + batchSize, championIds.length)
    
    for (let i = start; i < end; i++) {
      const img = new window.Image()
      img.src = getChampionImageUrl(championIds[i], version)
    }
    
    currentBatch++
    if (currentBatch * batchSize < championIds.length) {
      // load next batch after a short delay to not block the main thread
      setTimeout(loadBatch, 100)
    }
  }

  loadBatch()
}

// cache of already-prefetched profile icon IDs to avoid duplicate requests
const prefetchedProfileIcons = new Set<number>()

// prefetch profile icons for summoners in history
function prefetchProfileIconsFromHistory(history: SearchHistoryItem[], version: string) {
  for (const item of history) {
    if (item.type === 'summoner' && item.profile_icon_id && !prefetchedProfileIcons.has(item.profile_icon_id)) {
      prefetchedProfileIcons.add(item.profile_icon_id)
      const url = getProfileIconUrl(item.profile_icon_id, version)
      
      // use link preload for higher priority and better caching
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = url
      if (!document.querySelector(`link[href="${url}"]`)) {
        document.head.appendChild(link)
      }
      
      // also create Image object as fallback/immediate fetch
      new window.Image().src = url
    }
  }
}

// prefetch profile icons for summoner search results
function prefetchProfileIcons(summoners: RecentSummoner[], version: string) {
  for (const summoner of summoners) {
    if (summoner.profile_icon_id && !prefetchedProfileIcons.has(summoner.profile_icon_id)) {
      prefetchedProfileIcons.add(summoner.profile_icon_id)
      const img = new window.Image()
      img.src = getProfileIconUrl(summoner.profile_icon_id, version)
    }
  }
}

interface RecentSummoner {
  game_name: string
  tag_line: string
  region: string
  profile_icon_id: number
  summoner_level: number
}

// search history item - can be either summoner or champion
interface SearchHistoryItem {
  type: 'summoner' | 'champion'
  // summoner fields
  game_name?: string
  tag_line?: string
  region?: string
  profile_icon_id?: number
  summoner_level?: number
  // champion fields
  champion_id?: string
  champion_name?: string
  // common
  searched_at: number
}

const SEARCH_HISTORY_KEY = 'search-history-v2'
const MAX_HISTORY_ITEMS = 20

// load search history from localStorage
function loadSearchHistory(): SearchHistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (!saved) return []
    return JSON.parse(saved)
  } catch {
    return []
  }
}

// save a summoner search to history
function saveSummonerToHistory(summoner: RecentSummoner): void {
  if (typeof window === 'undefined') return
  try {
    const history = loadSearchHistory()
    // remove existing entry for this summoner
    const filtered = history.filter(
      h => !(h.type === 'summoner' &&
             h.game_name?.toLowerCase() === summoner.game_name.toLowerCase() && 
             h.tag_line?.toLowerCase() === summoner.tag_line.toLowerCase() &&
             h.region === summoner.region)
    )
    // add to front with timestamp
    const newItem: SearchHistoryItem = {
      type: 'summoner',
      game_name: summoner.game_name,
      tag_line: summoner.tag_line,
      region: summoner.region,
      profile_icon_id: summoner.profile_icon_id,
      summoner_level: summoner.summoner_level,
      searched_at: Date.now(),
    }
    const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to save search history:', err)
  }
}

// save a champion search to history
function saveChampionToHistory(championId: string, championName: string): void {
  if (typeof window === 'undefined') return
  try {
    const history = loadSearchHistory()
    // remove existing entry for this champion
    const filtered = history.filter(
      h => !(h.type === 'champion' && h.champion_id === championId)
    )
    // add to front with timestamp
    const newItem: SearchHistoryItem = {
      type: 'champion',
      champion_id: championId,
      champion_name: championName,
      searched_at: Date.now(),
    }
    const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to save search history:', err)
  }
}

// client-side DDragon version cache
let cachedDdragonVersion: string | null = null

// simple LRU-ish cache for summoner search results
const summonerSearchCache = new Map<string, { data: RecentSummoner[]; timestamp: number }>()
const SEARCH_CACHE_TTL = 30000
const MAX_CACHE_ENTRIES = 50

function getCachedSearch(query: string): RecentSummoner[] | null {
  const cached = summonerSearchCache.get(query.toLowerCase())
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedSearch(query: string, data: RecentSummoner[]): void {
  // evict old entries if cache is too large
  if (summonerSearchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = summonerSearchCache.keys().next().value
    if (oldestKey) summonerSearchCache.delete(oldestKey)
  }
  summonerSearchCache.set(query.toLowerCase(), { data, timestamp: Date.now() })
}

type Props = { className?: string; ddragonVersion?: string; inputRef?: React.RefObject<HTMLInputElement | null> }

export default function SearchBar({ className = 'w-full max-w-3xl', ddragonVersion: propVersion, inputRef: externalInputRef }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [region, setRegion] = useState('EUW')
  const [isHydrated, setIsHydrated] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const internalInputRef = useRef<HTMLInputElement>(null)
  const inputRef = externalInputRef || internalInputRef
  const [championNames, setChampionNames] = useState<Record<string, string>>({})
  const [recentSummoners, setRecentSummoners] = useState<RecentSummoner[]>([])
  const [isSearchingSummoners, setIsSearchingSummoners] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [ddragonVersion, setDdragonVersion] = useState(propVersion || cachedDdragonVersion || '')
  const containerRef = useRef<HTMLDivElement>(null)

  // fetch latest DDragon version if not provided (uses shared utility)
  useEffect(() => {
    if (propVersion) {
      setDdragonVersion(propVersion)
      cachedDdragonVersion = propVersion // also update cache
      return
    }
    if (cachedDdragonVersion) {
      setDdragonVersion(cachedDdragonVersion)
      return
    }
    getLatestVersion().then(version => {
      cachedDdragonVersion = version
      setDdragonVersion(version)
    })
  }, [propVersion])

  // load saved region and search history from localStorage after mount
  useEffect(() => {
    const savedRegion = localStorage.getItem('selected-region')
    if (savedRegion) {
      setRegion(savedRegion)
    }
    // load search history
    const history = loadSearchHistory()
    setSearchHistory(history)
    // prefetch profile icons for history items
    if (ddragonVersion) {
      prefetchProfileIconsFromHistory(history, ddragonVersion)
    }
    setIsHydrated(true)
  }, [ddragonVersion])

  // fetch champion names on mount and prefetch all champion icons
  useEffect(() => {
    if (!ddragonVersion) return // wait for version to be loaded
    
    async function loadChampions() {
      try {
        const names = await fetchChampionNames(ddragonVersion)
        setChampionNames(names)

        // prefetch all champion icons in the background (low priority)
        // this ensures they're cached for instant display throughout the app
        const championIds = Object.keys(names)
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          ;(window as any).requestIdleCallback(() => {
            prefetchChampionIcons(championIds, ddragonVersion)
          })
        } else {
          // fallback for browsers without requestIdleCallback
          setTimeout(() => prefetchChampionIcons(championIds, ddragonVersion), 1000)
        }
      } catch (err) {
        console.error('Failed to fetch champions:', err)
      }
    }
    loadChampions()
  }, [ddragonVersion])

  // search summoners when typing (only when there's actual input)
  useEffect(() => {
    if (!name.trim()) {
      setRecentSummoners([]) // clear search results when input is empty
      setIsSearchingSummoners(false)
      return
    }
    
    const query = name.trim()
    
    // check cache first for instant results
    const cached = getCachedSearch(query)
    if (cached) {
      setRecentSummoners(cached)
      setIsSearchingSummoners(false)
      return
    }
    
    // show loading state immediately
    setIsSearchingSummoners(true)
    
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`)
        if (!res.ok) {
          setRecentSummoners([])
          return
        }
        const data = await res.json()
        const summoners = data.summoners || []
        // cache the result
        setCachedSearch(query, summoners)
        // prefetch profile icons immediately before setting state
        prefetchProfileIcons(summoners, ddragonVersion)
        setRecentSummoners(summoners)
      } catch (err) {
        console.error('Failed to search summoners:', err)
      } finally {
        setIsSearchingSummoners(false)
      }
    }, 100)

    return () => clearTimeout(timeout)
  }, [name, ddragonVersion])

  // filter champions based on search query
  const filteredChampions = useMemo(() => {
    if (!name.trim()) return []
    const query = name.toLowerCase().trim()
    return Object.entries(championNames)
      .filter(([, displayName]) => displayName.toLowerCase().startsWith(query))
      .slice(0, 5)
      .map(([id, displayName]) => ({ id, displayName }))
  }, [name, championNames])

  // only show champions when actively searching
  const displayedChampions = useMemo(() => {
    if (name.trim()) return filteredChampions // Show filtered results when typing
    return [] // Don't show champions in default view
  }, [name, filteredChampions])

  // show search history when no query, otherwise show search results  
  // when not searching, show unified history (both summoners and champions)
  const displayedSummoners = useMemo((): (RecentSummoner | SearchHistoryItem)[] => {
    if (name.trim()) return recentSummoners // Show search results
    // filter to only summoner items from history for the summoners section
    return searchHistory
      .filter(h => h.type === 'summoner') as SearchHistoryItem[]
  }, [name, recentSummoners, searchHistory])

  // champion history items (when not searching)
  const displayedChampionHistory = useMemo((): SearchHistoryItem[] => {
    if (name.trim()) return [] // Don't show history when searching
    return searchHistory
      .filter(h => h.type === 'champion') as SearchHistoryItem[]
  }, [name, searchHistory])

  const allItems = useMemo(() => {
    const items: { type: 'champion' | 'summoner' | 'champion-history'; data: any }[] = []
    
    // when actively searching, show search results
    if (name.trim()) {
      displayedChampions.forEach(c => items.push({ type: 'champion', data: c }))
      displayedSummoners.forEach(s => items.push({ type: 'summoner', data: s }))
      return items
    }
    
    // when not searching, show only history items sorted by timestamp
    displayedChampionHistory.forEach(c => items.push({ type: 'champion-history', data: c }))
    displayedSummoners.forEach(s => items.push({ type: 'summoner', data: s }))
    
    items.sort((a, b) => {
      const aTime = a.data.searched_at || 0
      const bTime = b.data.searched_at || 0
      return bTime - aTime
    })
    
    // limit to 8 history items
    return items.slice(0, 8)
  }, [displayedChampions, displayedChampionHistory, displayedSummoners, name])

  // close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
        setSelectedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // reset selection when items change
  useEffect(() => {
    setSelectedIndex(-1)
  }, [name])

  function navigateToSummoner(gameName: string, tagLine: string, summonerRegion: string, profileIconId?: number, summonerLevel?: number) {
    const historyItem: RecentSummoner = {
      game_name: gameName,
      tag_line: tagLine,
      region: summonerRegion,
      profile_icon_id: profileIconId || 0,
      summoner_level: summonerLevel || 0,
    }
    saveSummonerToHistory(historyItem)
    setSearchHistory(loadSearchHistory())
    
    const regionLabel = toLabel(summonerRegion)
    const normalizedName = `${gameName}-${tagLine}`
    router.push(`/${regionLabel}/${encodeURIComponent(normalizedName)}`)
    setIsFocused(false)
    setName('')
  }

  function navigateToChampion(championId: string) {
    const championName = championNames[championId] || championId
    saveChampionToHistory(championId, championName)
    setSearchHistory(loadSearchHistory())
    
    // use display name for URL (e.g., "wukong" instead of "MonkeyKing")
    const urlName = getChampionUrlName(championId, championNames)
    router.push(`/champions/${urlName}`)
    setIsFocused(false)
    setName('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev < allItems.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < allItems.length) {
          e.preventDefault()
          const item = allItems[selectedIndex]
          if (item.type === 'champion') {
            navigateToChampion(item.data.id)
          } else if (item.type === 'champion-history') {
            navigateToChampion(item.data.champion_id)
          } else {
            navigateToSummoner(item.data.game_name, item.data.tag_line, item.data.region, item.data.profile_icon_id, item.data.summoner_level)
          }
        }
        break
      case 'Escape':
        setIsFocused(false)
        setSelectedIndex(-1)
        inputRef.current?.blur()
        break
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !isHydrated) return

    // if an item is selected, navigate to it
    if (selectedIndex >= 0 && selectedIndex < allItems.length) {
      const item = allItems[selectedIndex]
      if (item.type === 'champion') {
        navigateToChampion(item.data.id)
      } else if (item.type === 'champion-history') {
        navigateToChampion(item.data.champion_id)
      } else {
        navigateToSummoner(item.data.game_name, item.data.tag_line, item.data.region, item.data.profile_icon_id, item.data.summoner_level)
      }
      return
    }

    // default: search for summoner
    const nameWithTag = trimmed.includes('#') ? trimmed : `${trimmed}#${getDefaultTag(region)}`
    const [gameName, tagLine] = nameWithTag.split('#').map(part => part.trim())
    const normalizedName = `${gameName}-${tagLine}`

    router.push(`/${region}/${encodeURIComponent(normalizedName)}`)
    setIsFocused(false)
    setName('')
  }

  const showDefaultTag = name && !name.includes('#') && isHydrated
  // keep dropdown open while focused - content updates inside without re-animating
  const showDropdown = isFocused && isHydrated && Object.keys(championNames).length > 0

  function handleRegionSelect(regionLabel: string) {
    setRegion(regionLabel)
    localStorage.setItem('selected-region', regionLabel)
  }

  function handleRegionSelectorOpen() {
    setIsFocused(false)
  }

  // calculate current item index in allItems for highlighting
  const getItemIndex = useCallback(
    (type: 'champion' | 'champion-history' | 'summoner', index: number) => {
      if (type === 'champion') return index
      if (type === 'champion-history') return displayedChampions.length + index
      return displayedChampions.length + displayedChampionHistory.length + index
    },
    [displayedChampions.length, displayedChampionHistory.length]
  )

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      {/* single unified container with gradient border */}
      <div className="relative p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-xl">
        <div className="bg-abyss-700 rounded-[11px]">
          {/* search input */}
          <form onSubmit={onSubmit} className="flex items-center gap-3 w-full h-full">
            <div className="relative flex-1 h-full flex items-center">
              <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none">
                <span
                  className="text-white opacity-0 whitespace-pre"
                  style={{ fontFamily: 'var(--font-regular)', fontWeight: 400 }}
                >
                  {name}
                </span>
                {showDefaultTag && (
                  <span className="text-text-muted" style={{ fontFamily: 'var(--font-regular)', fontWeight: 400 }}>
                    #{getDefaultTag(region)}
                  </span>
                )}
              </div>
              <input
                ref={inputRef}
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={() => {
                  setIsFocused(true)
                  // reload search history when focusing
                  setSearchHistory(loadSearchHistory())
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search summoner or champion"
                className="w-full h-full px-4 sm:px-6 text-white text-base placeholder:text-transparent sm:placeholder:text-text-muted placeholder:text-sm bg-transparent outline-none relative z-10"
                style={{ fontFamily: 'var(--font-regular)', fontWeight: 400 }}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-3 pr-4 h-full">
              <div className="relative h-full flex items-center">
                {isHydrated && <RegionSelector value={region} onChange={handleRegionSelect} onOpen={handleRegionSelectorOpen} />}
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="h-10 w-10 grid place-items-center text-gold-light cursor-pointer flex-shrink-0"
              >
                <MagnifyingGlassIcon className="w-6 h-auto" aria-hidden="true" />
              </button>
            </div>
          </form>

          {/* dropdown content */}
          {showDropdown && (
            <>

              <div className="h-px bg-gold-dark/30" />
              <div
                className="max-h-80 overflow-y-auto"
                onMouseLeave={() => setSelectedIndex(-1)}
              >
                {/* champions Section */}
                {displayedChampions.length > 0 && (
                  <div>
                    <div className="px-4 py-2.5 text-xs font-bold text-gold-light uppercase tracking-wider bg-abyss-800/50">
                      Champions
                    </div>
                    {displayedChampions.map((champ, idx) => {
                      const itemIdx = getItemIndex('champion', idx)
                      return (
                        <button
                          key={champ.id}
                          type="button"
                          onClick={() => navigateToChampion(champ.id)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          className={clsx(
                            'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors',
                            selectedIndex === itemIdx
                              ? 'bg-gold-light/20'
                              : 'hover:bg-gold-light/20'
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-abyss-600 flex-shrink-0">
                            <Image
                              src={getChampionImageUrl(champ.id, ddragonVersion)}
                              alt={champ.displayName}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-white font-medium">{champ.displayName}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* summoners section, show when searching or as a part of history */}
                {(name.trim() || displayedSummoners.length > 0 || displayedChampionHistory.length > 0) && (
                  <div>
                    <div className="px-4 py-2.5 text-xs font-bold text-gold-light uppercase tracking-wider bg-abyss-800/50 flex items-center gap-2">
                      {name.trim() ? 'Summoners' : 'Recently Searched'}
                      {isSearchingSummoners && (
                        <div className="w-3 h-3 border-2 border-gold-light/30 border-t-gold-light rounded-full animate-spin" />
                      )}
                    </div>
                    {/* loading state when searching */}
                    {name.trim() && isSearchingSummoners && displayedSummoners.length === 0 && (
                      <div className="px-4 py-4 text-center">
                        <p className="text-text-muted text-sm">Searching summoners...</p>
                      </div>
                    )}
                    {/* no results found state */}
                    {name.trim() && !isSearchingSummoners && displayedSummoners.length === 0 && (
                      <div className="px-4 py-4 text-center">
                        <p className="text-text-muted text-sm">No summoners found</p>
                      </div>
                    )}
                    {/* empty state when no search history */}
                    {!name.trim() && allItems.length === 0 && (
                      <div className="px-4 py-5 text-center">
                        <p className="text-text-muted text-sm">Your recent searches will appear here</p>
                      </div>
                    )}
                    {/* render summoner search results during search */}
                    {name.trim() && displayedSummoners.map((summoner, idx) => {
                      const s = summoner as SearchHistoryItem
                      const itemIdx = displayedChampions.length + idx // continue index after champions
                      return (
                        <button
                          key={`${s.game_name}-${s.tag_line}-${s.region}`}
                          type="button"
                          onClick={() => navigateToSummoner(s.game_name!, s.tag_line!, s.region!, s.profile_icon_id, s.summoner_level)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          className={clsx(
                            'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors',
                            selectedIndex === itemIdx
                              ? 'bg-gold-light/20'
                              : 'hover:bg-gold-light/20'
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-abyss-600 flex-shrink-0">
                            {s.profile_icon_id ? (
                              <Image
                                src={getProfileIconUrl(s.profile_icon_id, ddragonVersion)}
                                alt=""
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <UserIcon className="w-4 h-4 text-text-muted" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">
                              {s.game_name}
                              <span className="text-text-muted"> #{s.tag_line}</span>
                            </div>
                            <div className="text-xs text-subtitle flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-abyss-800 rounded text-[10px] font-medium">
                                {PLATFORM_TO_LABEL[s.region as PlatformCode] || s.region?.toUpperCase()}
                              </span>
                              {s.summoner_level && s.summoner_level > 0 && (
                                <span className="text-text-muted">Level {s.summoner_level}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                    {/* render items in timestamp order */}
                    {!name.trim() && allItems.map((item, idx) => {
                      if (item.type === 'champion-history') {
                        const champ = item.data as SearchHistoryItem
                        return (
                          <button
                            key={`champion-${champ.champion_id}`}
                            type="button"
                            onClick={() => navigateToChampion(champ.champion_id!)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={clsx(
                              'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors',
                              selectedIndex === idx
                                ? 'bg-gold-light/20'
                                : 'hover:bg-gold-light/20'
                            )}
                          >
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-abyss-600 flex-shrink-0">
                              <Image
                                src={getChampionImageUrl(champ.champion_id!, ddragonVersion)}
                                alt={champ.champion_name || ''}
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-medium truncate">{champ.champion_name}</div>
                              <div className="text-xs text-text-muted">Champion</div>
                            </div>
                          </button>
                        )
                      } else {
                        const s = item.data as SearchHistoryItem
                        return (
                          <button
                            key={`${s.game_name}-${s.tag_line}-${s.region}`}
                            type="button"
                            onClick={() => navigateToSummoner(s.game_name!, s.tag_line!, s.region!, s.profile_icon_id, s.summoner_level)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={clsx(
                              'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors',
                              selectedIndex === idx
                                ? 'bg-gold-light/20'
                                : 'hover:bg-gold-light/20'
                            )}
                          >
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-abyss-600 flex-shrink-0">
                              {s.profile_icon_id ? (
                                <Image
                                  src={getProfileIconUrl(s.profile_icon_id, ddragonVersion)}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <UserIcon className="w-4 h-4 text-text-muted" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-medium truncate">
                                {s.game_name}
                                <span className="text-text-muted"> #{s.tag_line}</span>
                              </div>
                              <div className="text-xs text-subtitle flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-abyss-800 rounded text-[10px] font-medium">
                                  {PLATFORM_TO_LABEL[s.region as PlatformCode] || s.region?.toUpperCase()}
                                </span>
                                {s.summoner_level && s.summoner_level > 0 && (
                                  <span className="text-text-muted">Level {s.summoner_level}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      }
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
