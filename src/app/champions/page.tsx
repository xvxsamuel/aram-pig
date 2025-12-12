import type { Metadata } from 'next'
import { getLatestVersion, fetchChampionNames } from '@/lib/ddragon'
import { getLatestPatches } from '@/lib/game'
import ChampionsPageClient from '@/components/champions/ChampionsPageClient'

export const metadata: Metadata = {
  title: 'Champions | ARAM PIG',
  description: 'View champion statistics and performance in ARAM.',
}

// ISR: Regenerate page every hour to refresh patches/champion data
// This caches the page and reduces DDragon API calls significantly
export const revalidate = 3600 // 1 hour (patches change ~every 2 weeks)

export default async function ChampionsPage() {
  // get latest 3 patches from Riot API
  const availablePatches = await getLatestPatches()
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)

  return (
    <ChampionsPageClient
      availablePatches={availablePatches}
      ddragonVersion={ddragonVersion}
      championNames={championNames}
    />
  )
}
