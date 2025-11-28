"use client"
import { useState, useRef, useEffect } from "react"
import { clsx } from "clsx"
import { REGIONS } from "../lib/regions"

type Props = {
  value?: string
  onChange: (region: string) => void
  className?: string
}

export default function RegionSelector({
  value = "EUW",
  onChange,
  className = "",
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (regionLabel: string) => {
    onChange(regionLabel)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Region: ${value}. Change region`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={clsx(
          "w-12 h-6 flex items-center justify-center rounded-full",
          "bg-gradient-to-t from-action-200 to-action-100",
          "cursor-pointer outline-none",
          "font-bold text-[14px] text-white",
          className
        )}
      >
        <span className="translate-y-px">{value.toUpperCase()}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-16 bg-abyss-700 rounded-xl border border-gold-dark/40 shadow-xl z-50 overflow-hidden">
          <div className="max-h-64 overflow-y-auto" style={{ 
            scrollbarWidth: "thin",
            scrollbarColor: "var(--color-gold-dark) var(--color-accent-dark)",
          }}>
            {REGIONS.map((region: typeof REGIONS[number]) => (
              <button
                key={region.code}
                type="button"
                onClick={() => handleSelect(region.label)}
                className={clsx(
                  "w-full px-3 py-1.5 text-center text-white hover:bg-accent-light/20 font-bold text-xs",
                  value === region.label && "bg-accent-light/20"
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
