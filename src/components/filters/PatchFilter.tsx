"use client"

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

interface PatchFilterProps {
  availablePatches: string[]
}

// temporarily hide patches we didn't scrape data for (site didn't exist yet)
// remove this when new patches come out and push these off the list
const HIDDEN_PATCHES = ['25.21', '25.22']

export default function PatchFilter({ availablePatches }: PatchFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  
  // filter out hidden patches
  const visiblePatches = availablePatches.filter(p => !HIDDEN_PATCHES.includes(p))
  
  // load from localStorage or URL params
  const [_currentFilter, setCurrentFilter] = useState<string>('')
  const [currentPatch, setCurrentPatch] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // initialize from localStorage or defaults
  useEffect(() => {
    const _savedFilter = localStorage.getItem('championFilter')
    const savedPatch = localStorage.getItem('championPatch')
    
    const urlFilter = searchParams.get('filter')
    const urlPatch = searchParams.get('patch')
    
    // Only support patch filtering now
    const filter = 'patch'
    const patch = urlPatch || savedPatch || (visiblePatches.length > 0 ? visiblePatches[0] : null)
    
    setCurrentFilter(filter)
    setCurrentPatch(patch)
    
    // save to localStorage
    localStorage.setItem('championFilter', 'patch')
    if (patch) localStorage.setItem('championPatch', patch)
    
    // if URL params are missing, update URL with defaults
    if (!urlFilter || !urlPatch) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('filter', 'patch')
      if (patch) {
        params.set('patch', patch)
      }
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [searchParams, visiblePatches, pathname, router])

  // close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleFilterChange = (patch: string) => {
    const params = new URLSearchParams(searchParams.toString())
    
    params.set('filter', 'patch')
    params.set('patch', patch)
    localStorage.setItem('championFilter', 'patch')
    localStorage.setItem('championPatch', patch)
    setCurrentFilter('patch')
    setCurrentPatch(patch)
    
    // stay on current page (champions list or detail)
    router.push(`${pathname}?${params.toString()}`)
    setIsOpen(false)
  }

  // get current display label
  const getDisplayLabel = () => {
    return currentPatch ? `Patch ${currentPatch}` : 'Select Patch'
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="gold-border relative p-px h-8 bg-gradient-to-b from-gold-light to-gold-dark rounded-xl w-full sm:w-auto sm:inline-block sm:min-w-[150px]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative z-10 w-full h-full px-4 py-2 text-sm bg-abyss-800 text-white rounded-[inherit] transition-all flex items-center justify-between gap-2"
        >
          <span>{getDisplayLabel()}</span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full sm:w-auto min-w-[200px] bg-abyss-700 rounded-xl border border-gold-dark/40 shadow-xl z-10 overflow-hidden">
          {/* patch selection */}
          {visiblePatches.length > 0 ? (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-gold-light uppercase tracking-wider bg-abyss-800">
                Select Patch
              </div>
              {visiblePatches.map(patch => (
                <button
                  key={patch}
                  onClick={() => handleFilterChange(patch)}
                  className={`w-full px-4 py-2 text-left hover:bg-accent-light/20 transition-colors text-sm ${
                    currentPatch === patch
                      ? 'bg-accent-light/20 text-accent-light'
                      : 'text-white'
                  }`}
                >
                  Patch {patch}
                </button>
              ))}
            </>
          ) : (
            <div className="px-4 py-3 text-sm text-subtitle">
              No patches available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
