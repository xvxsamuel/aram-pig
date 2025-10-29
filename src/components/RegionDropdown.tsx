"use client"
import { clsx } from "clsx"
import { REGIONS } from "../lib/regions"

type Props = {
  isOpen: boolean
  onSelect: (regionLabel: string) => void
  className?: string
}

export default function RegionDropdown({ isOpen, onSelect, className = "" }: Props) {
  if (!isOpen) return null

  return (
    <div className={clsx("absolute top-full left-1/2 -translate-x-1/2 mt-2 w-20 bg-abyss-700 rounded-xl border border-gold-dark/40 shadow-xl z-50 overflow-hidden", className)}>
      <div className="max-h-64 overflow-y-auto" style={{ 
        scrollbarWidth: "thin",
        scrollbarColor: "var(--color-gold-dark) var(--color-accent-dark)",
        WebkitOverflowScrolling: "touch",
        willChange: "scroll-position"
      }}>
        {REGIONS.map((region: typeof REGIONS[number]) => (
          <button
            key={region.code}
            type="button"
            onClick={() => onSelect(region.label)}
            className="w-full px-4 py-2 text-center text-white hover:bg-accent-light/20 font-bold tracking-wide text-sm"
          >
            {region.label}
          </button>
        ))}
      </div>
    </div>
  )
}
