'use client'
import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { REGIONS } from '@/lib/game'

type Props = {
  value?: string
  onChange: (region: string) => void
  onOpen?: () => void
  className?: string
}

export default function RegionSelector({ value = 'EUW', onChange, onOpen, className = '' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selectedButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      // scroll to selected region when dropdown opens
      // manual scrollTop instead of scrollIntoView to prevent the whole page from scrolling
      if (selectedButtonRef.current && listRef.current) {
        const list = listRef.current
        const selected = selectedButtonRef.current
        
        // calculate the position to center the element:
        // element's top position - half the container height + half the element height
        list.scrollTop = selected.offsetTop - (list.clientHeight / 2) + (selected.clientHeight / 2)
      }
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (regionLabel: string) => {
    onChange(regionLabel)
    setIsOpen(false)
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const willOpen = !isOpen
    setIsOpen(willOpen)
    if (willOpen && onOpen) {
      onOpen()
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Region: ${value}. Change region`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={clsx(
          'w-12 h-6 grid place-items-center rounded-full',
          'bg-gradient-to-t from-action-200 to-action-100',
          'cursor-pointer outline-none',
          'font-bold text-[14px] text-white leading-none',
          className
        )}
      >
        <span>{value.toUpperCase()}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-16 bg-abyss-700 rounded-xl border border-gold-dark/40 shadow-xl z-50 overflow-hidden">
          <div ref={listRef} className="max-h-40 overflow-y-auto scrollbar-hide relative">
            {REGIONS.map((region: (typeof REGIONS)[number]) => (
              <button
                key={region.code}
                ref={value === region.label ? selectedButtonRef : null}
                type="button"
                onClick={() => handleSelect(region.label)}
                className={clsx(
                  'w-full px-3 py-1.5 text-center text-white font-bold text-xs transition-colors',
                  value === region.label 
                    ? 'bg-accent-light/20 hover:brightness-150' 
                    : 'hover:bg-gold-light/20'
                )}
              >
                {region.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
