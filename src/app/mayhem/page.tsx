import type { Metadata } from 'next'
import MayhemPageClient from '@/components/mayhem/MayhemPageClient'
import augmentsData from '@/data/augments.json'
import type { ChampionTier } from '@/lib/ui'

export const metadata: Metadata = {
  title: 'Mayhem Augment Tier List | ARAM PIG',
  description: 'ARAM Mayhem augment tier list. Find the best Silver, Gold, and Prismatic augments ranked by performance.',
  openGraph: {
    title: 'ARAM Mayhem Augment Tier List | ARAM PIG',
    description: 'ARAM Mayhem augment tier list. Find the best Silver, Gold, and Prismatic augments ranked by performance.',
    url: 'https://arampig.lol/mayhem',
    siteName: 'ARAM PIG',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ARAM PIG - Mayhem Augment Tier List',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARAM Mayhem Augment Tier List | ARAM PIG',
    description: 'Find the best ARAM Mayhem augments ranked by performance tier.',
    images: ['/og-image.png'],
  },
}

export default function MayhemPage() {
  // Load all augments from JSON, filtering out disabled ones
  const augments = Object.entries(augmentsData)
    .filter(([, data]) => (data as { performanceTier?: string }).performanceTier !== 'Disabled')
    .map(([name, data]) => ({
      name,
      tier: (data as { tier: string }).tier,
      description: (data as { description: string }).description,
      performanceTier: ((data as { performanceTier?: string }).performanceTier || 'COAL') as ChampionTier,
    }))

  return <MayhemPageClient augments={augments} />
}
