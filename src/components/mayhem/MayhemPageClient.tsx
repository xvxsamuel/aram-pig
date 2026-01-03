'use client'

import { useMemo, useState } from 'react'
import AugmentIcon from '@/components/ui/AugmentIcon'
import TierFilter, { type AugmentTier } from '@/components/filters/TierFilter'
import { TIER_CONFIGS, type ChampionTier } from '@/lib/ui'

interface Augment {
  name: string
  tier: string
  description: string
  performanceTier: ChampionTier
}

interface Props {
  augments: Augment[]
}

// tier order for grouping
const TIER_ORDER: ChampionTier[] = ['S+', 'S', 'A', 'B', 'C', 'D', 'COAL']

export default function MayhemPageClient({ augments }: Props) {
  const [selectedTier, setSelectedTier] = useState<AugmentTier>('All')

  // Filter augments by selected tier (Silver/Gold/Prismatic)
  const filteredAugments = useMemo(() => {
    if (selectedTier === 'All') return augments
    return augments.filter(augment => augment.tier === selectedTier)
  }, [augments, selectedTier])

  // Group augments by performance tier
  const groupedAugments = useMemo(() => {
    const groups: Record<ChampionTier, Augment[]> = {
      'S+': [],
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
      COAL: [],
    }

    filteredAugments.forEach(augment => {
      groups[augment.performanceTier].push(augment)
    })

    // Sort augments within each tier: by tier (Prismatic > Gold > Silver), then alphabetically
    const tierPriority = { Prismatic: 0, Gold: 1, Silver: 2 }
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const tierDiff = (tierPriority[a.tier as keyof typeof tierPriority] ?? 99) - (tierPriority[b.tier as keyof typeof tierPriority] ?? 99)
        if (tierDiff !== 0) return tierDiff
        return a.name.localeCompare(b.name)
      })
    })

    return groups
  }, [filteredAugments])

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-6xl mx-auto px-12 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">ARAM Mayhem Augment Tier List</h2>
            <p className="text-subtitle">
              {filteredAugments.length} augments analyzed
            </p>
          </div>
          <TierFilter selectedTier={selectedTier} onTierChange={setSelectedTier} />
        </div>

        {/* Tier list */}
        <div className="space-y-3">
          {TIER_ORDER.map(tier => {
            const tierAugments = groupedAugments[tier]
            if (tierAugments.length === 0) return null

            const tierConfig = TIER_CONFIGS[tier]

            return (
              <div 
                key={tier} 
                className="flex items-stretch rounded-lg overflow-hidden border border-gold-dark/40"
                style={{
                  background: `linear-gradient(to right, ${tierConfig.borderColors.from}, ${tierConfig.borderColors.to})`,
                }}
              >
                {/* Tier badge */}
                <div 
                  className="flex items-center justify-center w-[80px] px-4"
                  style={{
                    background: `linear-gradient(135deg, ${tierConfig.borderColors.from}, ${tierConfig.borderColors.to})`,
                  }}
                >
                  <span
                    className={`font-bold ${tier === 'COAL' ? 'text-2xl' : 'text-3xl'}`}
                    style={{
                      color: tierConfig.textColor,
                    }}
                  >
                    {tier}
                  </span>
                </div>

                {/* Augments container */}
                <div className="flex-1 bg-abyss-600 p-4">
                  <div className="flex flex-wrap gap-3">
                    {tierAugments.map(augment => (
                      <div
                        key={augment.name}
                        className="flex flex-col items-center gap-1 h-[72px] w-[72px]"
                      >
                        <AugmentIcon
                          augmentName={augment.name}
                          size="lg"
                          showTooltip={true}
                        />
                        <span className="text-xs text-center text-subtitle line-clamp-2 leading-tight max-w-[72px]">
                          {augment.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
