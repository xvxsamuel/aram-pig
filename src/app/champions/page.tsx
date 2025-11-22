import type { Metadata } from 'next'
import { getLatestVersion } from '@/lib/ddragon-client'
import { fetchChampionNames } from '@/lib/champion-names'
import { getLatestPatches } from '@/lib/riot-patches'
import ChampionsPageClient from '@/components/ChampionsPageClient'

export const metadata: Metadata = {
  title: 'Champions | ARAM PIG',
  description: 'View champion statistics and performance in ARAM.',
}

export const revalidate = 0 // disable cache for filters to work

export default async function ChampionsPage() {
  // Get latest 3 patches from Riot API
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
