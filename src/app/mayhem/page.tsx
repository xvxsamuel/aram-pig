import type { Metadata } from 'next'
import MayhemPageClient from '@/components/mayhem/MayhemPageClient'
import augmentsData from '@/data/augments.json'

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
    // For now, assign all to COAL tier
    performanceTier: 'COAL' as const,
  }))

  return <MayhemPageClient augments={augments} />
}
