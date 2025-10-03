"use client"
import { useRouter } from "next/navigation"
import RegionSelector from "./RegionSelector"
import RegionDropdown from "./RegionDropdown"
import { useState, useRef, useEffect } from "react"
import { clsx } from "clsx"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
 
type Props = { className?: string }

export default function SearchBar({ className = "w-full max-w-3xl" }: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [region, setRegion] = useState("EUW")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const regionContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (regionContainerRef.current && !regionContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isDropdownOpen])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    
    const urlFriendlyName = trimmed.replace("#", "-")
    router.push(`/${region}/${encodeURIComponent(urlFriendlyName)}`)
  }

  function handleRegionSelect(regionLabel: string) {
    setRegion(regionLabel)
    setIsDropdownOpen(false)
  }

  return (
    <div className={clsx("relative", className)}>
      <div className="relative h-full rounded-2xl p-0.5 bg-gradient-to-b from-gold-light to-gold-dark">
        <div className="relative z-10 h-full w-full rounded-[inherit] bg-accent-darker flex items-center cursor-text">
          <form onSubmit={onSubmit} className="flex items-center gap-3 w-full h-full">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Search summoner name or champion"
              className="flex-1 h-full px-6 leading-none text-white placeholder:text-subtitle bg-transparent outline-none"
              style={{ fontFamily: 'var(--font-regular)', fontWeight: 400 }}
            />

            <div className="flex items-center gap-3 pr-4 h-full">
              <div className="relative h-full flex items-center" ref={regionContainerRef}>
                <RegionSelector
                  value={region}
                  isOpen={isDropdownOpen}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                />
                <RegionDropdown
                  isOpen={isDropdownOpen}
                  onSelect={handleRegionSelect}
                />
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="h-10 w-10 grid place-items-center text-gold-light cursor-pointer"
              >
                <MagnifyingGlassIcon className="w-6 h-auto" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}