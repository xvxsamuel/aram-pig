'use client'

import { useState, useRef, useEffect } from 'react'

export type AugmentTier = 'All' | 'Prismatic' | 'Gold' | 'Silver'

interface TierFilterProps {
  selectedTier: AugmentTier
  onTierChange: (tier: AugmentTier) => void
}

const TIER_OPTIONS: { value: AugmentTier; label: string; colorClass?: string }[] = [
  { value: 'All', label: 'All Tiers' },
  { value: 'Prismatic', label: 'Prismatic', colorClass: 'bg-augment-prismatic' },
  { value: 'Gold', label: 'Gold', colorClass: 'bg-gold-light' },
  { value: 'Silver', label: 'Silver', colorClass: 'bg-augment-silver' },
]

export default function TierFilter({ selectedTier, onTierChange }: TierFilterProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

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

  const handleTierChange = (tier: AugmentTier) => {
    onTierChange(tier)
    setIsOpen(false)
  }

  const currentOption = TIER_OPTIONS.find(opt => opt.value === selectedTier) || TIER_OPTIONS[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="gold-border relative p-px h-8 bg-gradient-to-b from-gold-light to-gold-dark rounded-xl w-full sm:w-auto sm:inline-block sm:min-w-[150px]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative z-10 w-full h-full px-4 py-2 text-sm bg-abyss-800 text-white rounded-[inherit] transition-all flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            {currentOption.colorClass && (
              <span 
                className={`w-2 h-2 rounded-full ${currentOption.colorClass}`}
              />
            )}
            {currentOption.label}
          </span>
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
          <div className="px-4 py-2 text-xs font-semibold text-gold-light uppercase tracking-wider bg-abyss-800">
            Filter by Tier
          </div>
          {TIER_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => handleTierChange(option.value)}
              className={`w-full px-4 py-2 text-left transition-colors text-sm text-white flex items-center gap-2 ${
                selectedTier === option.value ? 'bg-accent-light/20 hover:brightness-150' : 'hover:bg-gold-light/20'
              }`}
            >
              {option.colorClass && (
                <span 
                  className={`w-2 h-2 rounded-full ${option.colorClass}`}
                />
              )}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
