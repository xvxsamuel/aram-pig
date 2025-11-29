import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchChampionNames, getApiNameFromUrl, getChampionDisplayName, getChampionUrlName, getLatestVersion } from '@/lib/ddragon'
import { getLatestPatches } from '@/lib/game'
import ChampionPageClient from '@/components/champions/ChampionPageClient'

export const revalidate = 0 // disable cache for patch filter to work

// pre-render all champion pages at build time
export async function generateStaticParams() {
  try {
    const ddragonVersion = await getLatestVersion()
    const championNames = await fetchChampionNames(ddragonVersion)
    
    return Object.keys(championNames).map(apiName => ({
      championName: getChampionUrlName(apiName, championNames)
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { championName } = await params
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
  
  return {
    title: `${capitalizedName} Stats | ARAM PIG`,
    description: `Detailed ARAM statistics for ${capitalizedName}`,
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
    <ChampionPageClient
      championName={championName}
      displayName={displayName}
      apiName={apiName}
      ddragonVersion={ddragonVersion}
      availablePatches={availablePatches}
      selectedPatch={selectedPatch}
    />
  )
}
