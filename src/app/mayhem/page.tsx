import type { Metadata } from 'next'
import MayhemPageClient from '@/components/mayhem/MayhemPageClient'
import augmentsData from '@/data/augments.json'
import type { ChampionTier } from '@/lib/ui'

export const metadata: Metadata = {
  title: 'Mayhem Augments | ARAM PIG',
  description: 'View ARAM Arena augment statistics and tier list.',
}

export default function MayhemPage() {
  // Load all augments from JSON
  const augments = Object.entries(augmentsData).map(([name, data]) => ({
    name,
    tier: (data as { tier: string }).tier,
    description: (data as { description: string }).description,
    performanceTier: ((data as { performanceTier?: string }).performanceTier || 'COAL') as ChampionTier,
  }))

  return <MayhemPageClient augments={augments} />
}
