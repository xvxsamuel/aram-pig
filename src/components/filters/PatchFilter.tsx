'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { HIDDEN_PATCHES } from '@/lib/game'

interface PatchFilterProps {
  availablePatches: string[]
  currentPatch: string
}

export default function PatchFilter({ availablePatches, currentPatch }: PatchFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  const visiblePatches = availablePatches.filter(p => !HIDDEN_PATCHES.includes(p))

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

  const handlePatchChange = (patch: string) => {
    localStorage.setItem('championPatch', patch)
    router.push(`${pathname}?patch=${patch}`)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="gold-border relative p-px h-8 bg-gradient-to-b from-gold-light to-gold-dark rounded-xl w-full sm:w-auto sm:inline-block sm:min-w-[150px]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative z-10 w-full h-full px-4 py-2 text-sm bg-abyss-800 text-white rounded-[inherit] transition-all flex items-center justify-between gap-2"
        >
          <span>{currentPatch ? `Patch ${currentPatch}` : 'Select Patch'}</span>
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
          {visiblePatches.length > 0 ? (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-gold-light uppercase tracking-wider bg-abyss-800">
                Select Patch
              </div>
              {visiblePatches.map(patch => (
                <button
                  key={patch}
                  onClick={() => handlePatchChange(patch)}
                  className={`w-full px-4 py-2 text-left transition-colors text-sm text-white ${
                    currentPatch === patch ? 'bg-accent-light/20 hover:brightness-150' : 'hover:bg-gold-light/20'
                  }`}
                >
                  Patch {patch}
                </button>
              ))}
            </>
          ) : (
            <div className="px-4 py-3 text-sm text-subtitle">No patches available</div>
          )}
        </div>
      )}
    </div>
  )
}
