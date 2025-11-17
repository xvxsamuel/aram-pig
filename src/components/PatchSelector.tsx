'use client'

import { useRouter, usePathname } from 'next/navigation'

interface PatchSelectorProps {
  availablePatches: string[]
  currentPatch: string | null
}

export default function PatchSelector({ availablePatches, currentPatch }: PatchSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handlePatchChange = (patch: string) => {
    const url = new URL(window.location.href)
    if (patch) {
      url.searchParams.set('patch', patch)
    } else {
      url.searchParams.delete('patch')
    }
    router.push(`${pathname}?${url.searchParams.toString()}`)
  }

  if (availablePatches.length === 0) return null

  return (
    <div className="flex flex-col items-end gap-2">
      <label htmlFor="patch-select" className="text-sm text-subtitle">Patch</label>
      <select
        id="patch-select"
        value={currentPatch || ''}
        onChange={(e) => handlePatchChange(e.target.value)}
        className="bg-abyss-700 border border-gold-dark rounded px-4 py-2 text-white hover:border-gold-light transition-colors cursor-pointer"
      >
        {availablePatches.map(patch => (
          <option key={patch} value={patch}>
            Patch {patch}
          </option>
        ))}
      </select>
    </div>
  )
}
