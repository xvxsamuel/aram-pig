import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  fetchChampionNames,
  getApiNameFromUrl,
  getChampionDisplayName,
  getChampionUrlName,
  getLatestVersion,
} from '@/lib/ddragon'
import { getLatestPatches, HIDDEN_PATCHES } from '@/lib/game'
import ChampionPageClient from '@/components/champions/ChampionPageClient'

// isr: regenerate page every hour to refresh patches/stats
// this caches the page and reduces ddragon api calls significantly
// patch filter still works via client-side navigation
export const revalidate = 3600

// pre-render all champion pages at build time
export async function generateStaticParams() {
  try {
    const ddragonVersion = await getLatestVersion()
    const championNames = await fetchChampionNames(ddragonVersion)

    return Object.keys(championNames).map(apiName => ({
      championName: getChampionUrlName(apiName, championNames),
    }))
  } catch (error) {
    console.error('Failed to generate static params for champions:', error)
    return []
  }
}

interface Props {
  params: Promise<{ championName: string }>
  searchParams: Promise<{ patch?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { championName } = await params
  const { patch } = await searchParams
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)
  const apiName = getApiNameFromUrl(championName, championNames)

  if (!apiName) {
    return {
      title: 'Champion Not Found | ARAM PIG',
      description: 'Champion statistics not available',
    }
  }

  const displayName = getChampionDisplayName(apiName, championNames)
  const capitalizedName = displayName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  // get available patches to determine default
  const availablePatches = await getLatestPatches()
  const defaultPatch = availablePatches.find(p => !HIDDEN_PATCHES.includes(p)) || availablePatches[0]
  const currentPatch = patch || defaultPatch

  return {
    title: `${capitalizedName} ARAM Build - Highest Win Rate Builds, Runes, and Items | Patch ${currentPatch}`,
    description: `${capitalizedName} ARAM build with the highest win rate. Best runes, items, and skill order for ${capitalizedName} in ARAM. Patch ${currentPatch}. ARAM PIG analyzes thousands of ARAM matches to give you the best ${capitalizedName} build and performance stats.`,
    openGraph: {
      title: `${capitalizedName} ARAM Build - Highest Win Rate Builds, Runes, and Items`,
      description: `Best ${capitalizedName} ARAM build with highest win rate runes, items, and skill order. Detailed performance statistics and guides for patch ${currentPatch}.`,
      siteName: 'ARAM PIG',
    },
  }
}

export default async function ChampionDetailPage({ params, searchParams }: Props) {
  const { championName } = await params
  const { patch: selectedPatch } = await searchParams

  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)
  const apiName = getApiNameFromUrl(championName, championNames)

  if (!apiName) {
    notFound()
  }

  const displayName = championNames[apiName] || apiName
  const availablePatches = await getLatestPatches()

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <ChampionPageClient
        championName={championName}
        displayName={displayName}
        apiName={apiName}
        ddragonVersion={ddragonVersion}
        availablePatches={availablePatches}
        selectedPatch={selectedPatch}
      />
    </main>
  )
}
