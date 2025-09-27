'use client'
import { useRouter } from 'next/navigation'
import RegionSelector from './RegionSelector'
import { useState } from 'react'
import { clsx } from 'clsx'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
 
type Props = { className?: string }

export default function SearchBar({ className = 'w-full max-w-3xl' }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [region] = useState('euw')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    router.push(`/${region}/${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className={clsx('relative rounded-2xl p-0.5 bg-gradient-to-b from-gold-light to-gold-dark overflow-hidden', className)}>
      <div className="relative z-10 h-full w-full rounded-[inherit] bg-accent-darker backdrop-blur-sm flex items-center cursor-text">
        <form onSubmit={onSubmit} className="flex items-center gap-3 w-full">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Search summoner name or champion"
            className="flex-1 h-full px-6 font-light leading-none text-white placeholder:text-subtitle bg-transparent outline-none"
          />

          <div className="flex items-center gap-3 pr-4">
            <RegionSelector
              value={region}
            />
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
  )
}