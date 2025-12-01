'use client'

import { useState, useRef, useEffect } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'
import { getChampionImageUrl, getChampionDisplayName, getSortedChampionNames } from '@/lib/ddragon'

interface Props {
  value: string
  onChange: (champion: string) => void
  championNames: Record<string, string>
  ddragonVersion: string
}

export default function ChampionFilter({ value, onChange, championNames, ddragonVersion }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allChampions = getSortedChampionNames(championNames)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchInput('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const displayValue = value ? getChampionDisplayName(value, championNames) : 'All Champions'
  const filteredChampions = allChampions.filter(champ => {
    const displayName = getChampionDisplayName(champ, championNames)
    return displayName.toLowerCase().includes(searchInput.toLowerCase())
  })

  const handleInputClick = () => {
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSelect = (champion: string) => {
    onChange(champion)
    setIsOpen(false)
    setSearchInput('')
  }

  return (
    <div className="relative w-48" ref={dropdownRef}>
      <div className="gold-border relative h-7 rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
        <div
          onClick={handleInputClick}
          className="relative h-full w-full rounded-[inherit] bg-abyss-700 flex items-center pl-4 pr-8 cursor-pointer transition-colors"
        >
          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search champions"
              className="text-xs flex-1 bg-transparent outline-none text-white placeholder:text-text-muted"
            />
          ) : (
            <span
              className={`text-xs flex-1 text-left truncate ${value ? 'text-white' : 'text-text-muted font-light'}`}
            >
              {displayValue}
            </span>
          )}
          <MagnifyingGlassIcon className="w-4 h-4 text-gold-light absolute right-3 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-full bg-abyss-700 rounded-xl border border-gold-dark/40 shadow-xl z-30 overflow-hidden">
          <div
            className="max-h-64 overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--color-gold-dark) var(--color-accent-dark)',
              WebkitOverflowScrolling: 'touch',
              willChange: 'scroll-position',
            }}
          >
            <button
              onClick={() => handleSelect('')}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-gold-light/20 text-gold-light"
            >
              All Champions
            </button>
            <div className="h-px bg-gold-dark/20" />
            {filteredChampions.map(champion => {
              const displayName = getChampionDisplayName(champion, championNames)
              return (
                <button
                  key={champion}
                  onClick={() => handleSelect(champion)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gold-light/20 flex items-center gap-2 ${
                    value === champion ? ' bg-accent-light/20' : 'text-white'
                  }`}
                >
                  <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0 border border-gold-dark/30">
                    <Image
                      src={getChampionImageUrl(champion, ddragonVersion)}
                      alt={displayName}
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                  <span>{displayName}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
