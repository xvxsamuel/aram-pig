"use client"
import { useRouter } from "nextjs-toploader/app"
import RegionSelector from "./RegionSelector"
import { useState, useRef, useEffect } from "react"
import { clsx } from "clsx"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { getDefaultTag } from "../lib/regions"
 
type Props = { className?: string }

export default function SearchBar({ className = "w-full max-w-3xl" }: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [region, setRegion] = useState("EUW")
  const [isHydrated, setIsHydrated] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // load saved region from localStorage after mount
  useEffect(() => {
    const savedRegion = localStorage.getItem('selected-region')
    if (savedRegion) {
      setRegion(savedRegion)
    }
    setIsHydrated(true)
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !isHydrated) return // don't submit until hydrated
    
    // tag
    const nameWithTag = trimmed.includes("#") 
      ? trimmed 
      : `${trimmed}#${getDefaultTag(region)}`
    
    // split by # and trim each part to remove any extra spaces
    const [gameName, tagLine] = nameWithTag.split("#").map(part => part.trim())
    const normalizedName = `${gameName}-${tagLine}`
    
    router.push(`/${region}/${encodeURIComponent(normalizedName)}`)
  }

  const showDefaultTag = name && !name.includes("#") && isHydrated

  function handleRegionSelect(regionLabel: string) {
    setRegion(regionLabel)
    localStorage.setItem('selected-region', regionLabel)
  }

  return (
    <div className={clsx("relative px-4", className)}>
      <div className="gold-border relative h-full rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
      <div className="relative z-10 h-full w-full rounded-[inherit] bg-abyss-700 flex items-center cursor-text">
        <form onSubmit={onSubmit} className="flex items-center gap-3 w-full h-full">
          <div className="relative flex-1 h-full flex items-center">
            <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none">
              <span className="text-white opacity-0 whitespace-pre" style={{ fontFamily: 'var(--font-regular)', fontWeight: 400 }}>
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
              onChange={(e) => setName(e.target.value)}
              placeholder="Search summoner name"
              className="w-full h-full px-4 sm:px-6 text-white text-base placeholder:text-transparent md:placeholder:text-text-muted placeholder:text-sm bg-transparent outline-none relative z-10"
              style={{ fontFamily: 'var(--font-regular)', fontWeight: 400 }}
            />
          </div>            <div className="flex items-center gap-3 pr-4 h-full">
              <div className="relative h-full flex items-center">
                {/* only render RegionSelector after hydration to prevent flicker of default */}
                {isHydrated && (
                  <RegionSelector
                    value={region}
                    onChange={handleRegionSelect}
                  />
                )}
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="h-8 w-8 sm:h-10 sm:w-10 grid place-items-center text-gold-light cursor-pointer flex-shrink-0"
              >
                <MagnifyingGlassIcon className="w-5 sm:w-6 h-auto" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
