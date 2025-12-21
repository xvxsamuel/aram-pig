import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getLatestVersion, fetchChampionNames } from '@/lib/ddragon'
import { getLatestPatches } from '@/lib/game'
import ChampionsPageClient from '@/components/champions/ChampionsPageClient'

export const metadata: Metadata = {
  title: 'Champions | ARAM PIG',
  description: 'View champion statistics and performance in ARAM.',
}

// isr: regenerate page every hour to refresh patches/champion data
// this caches the page and reduces ddragon api calls significantly
export const revalidate = 3600 // 1 hour (patches change ~every 2 weeks)

export default async function ChampionsPage() {
  // get latest 3 patches from riot api
  const availablePatches = await getLatestPatches()
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)

  return (
    <Suspense fallback={<div className="min-h-screen bg-accent-darker" />}>
      <ChampionsPageClient
        availablePatches={availablePatches}
        ddragonVersion={ddragonVersion}
        championNames={championNames}
      />
    </Suspense>
  )
}
