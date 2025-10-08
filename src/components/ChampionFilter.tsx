"use client"

import { useState, useRef, useEffect } from "react"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import Image from "next/image"
import { getChampionImageUrl } from "../lib/ddragon-client"
import { getChampionDisplayName, getSortedChampionNames } from "../lib/champion-names"

interface Props {
  value: string
  onChange: (champion: string) => void
  championNames: Record<string, string>
  ddragonVersion: string
}

export default function ChampionFilter({ value, onChange, championNames, ddragonVersion }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allChampions = getSortedChampionNames(championNames)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchInput("")
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const displayValue = value ? getChampionDisplayName(value, championNames) : "All Champions"
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
    setSearchInput("")
  }

  return (
    <div className="relative w-64" ref={dropdownRef}>
      <div className="relative h-8 rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
        <div
          onClick={handleInputClick}
          className="relative z-10 h-full w-full rounded-[inherit] bg-accent-darkest flex items-center px-4 gap-2 cursor-pointer transition-colors"
        >
          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search champions"
              className="text-sm flex-1 bg-transparent outline-none text-white placeholder:text-subtitle"
            />
          ) : (
            <span className={`text-sm flex-1 text-left ${value ? 'text-white' : 'text-subtitle'}`}>
              {displayValue}
            </span>
          )}
          <MagnifyingGlassIcon className="w-4 h-4 text-subtitle flex-shrink-0" />
        </div>
      </div>

      {isOpen && (
        <div className="fixed bg-accent-darker rounded-xl border border-gold-dark/30 shadow-xl z-[100] overflow-hidden" style={{
          top: dropdownRef.current ? `${dropdownRef.current.getBoundingClientRect().bottom + 8}px` : '0',
          left: dropdownRef.current ? `${dropdownRef.current.getBoundingClientRect().left}px` : '0',
          width: dropdownRef.current ? `${dropdownRef.current.offsetWidth}px` : 'auto'
        }}>
          <div className="max-h-64 overflow-y-auto" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--color-gold-dark) var(--color-accent-dark)',
            WebkitOverflowScrolling: 'touch',
            willChange: 'scroll-position'
          }}>
            <button
              onClick={() => handleSelect("")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent-light/20 text-gold-light font-bold"
            >
              All Champions
            </button>
            <div className="h-px bg-gold-dark/20" />
            {filteredChampions.map((champion) => {
              const displayName = getChampionDisplayName(champion, championNames)
              return (
                <button
                  key={champion}
                  onClick={() => handleSelect(champion)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-accent-light/20 flex items-center gap-2 ${
                    value === champion ? 'text-gold-light bg-accent-light/10' : 'text-white'
                  }`}
                >
                  <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0 border border-gold-dark/30">
                    <Image
                      src={getChampionImageUrl(champion, ddragonVersion)}
                      alt={displayName}
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"

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
