'use client'

import { useMemo } from 'react'
import AugmentDisplay from '@/components/game/AugmentDisplay'
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

    augments.forEach(augment => {
      groups[augment.performanceTier].push(augment)
    })

    // Sort augments within each tier alphabetically
    Object.values(groups).forEach(group => {
      group.sort((a, b) => a.name.localeCompare(b.name))
    })

    return groups
  }, [augments])

  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-6xl mx-auto px-12 py-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">ARAM Mayhem Augments</h2>
          <p className="text-subtitle">
            {augments.length} augments analyzed
          </p>
        </div>

        {/* Tier groups */}
        <div className="space-y-4">
          {TIER_ORDER.map(tier => {
            const tierAugments = groupedAugments[tier]
            if (tierAugments.length === 0) return null

            const tierConfig = TIER_CONFIGS[tier]
            const tierBorder = `linear-gradient(to bottom, ${tierConfig.borderColors.from}, ${tierConfig.borderColors.to})`

            return (
              <div key={tier} className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
                {/* Tier header */}
                <div
                  className="px-4 py-3 border-b border-abyss-700"
                  style={{
                    background: tierConfig.bgColor,
                    borderBottom: `2px solid ${tierConfig.borderColors.from}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="p-px rounded-full"
                      style={{ background: tierBorder }}
                    >
                      <div className="px-3 py-1 rounded-[inherit] bg-abyss-900 flex items-center justify-center">
                        <span
                          className="text-sm font-bold"
                          style={{
                            color: tierConfig.textColor,
                            textShadow: tier === 'S+' ? '0 0 10px rgba(74, 158, 255, 1)' : 'none',
                          }}
                        >
                          {tier}
                        </span>
                      </div>
                    </div>
                    <span className="text-lg font-semibold text-white">
                      {tierAugments.length} {tierAugments.length === 1 ? 'Augment' : 'Augments'}
                    </span>
                  </div>
                </div>

                {/* Augments grid */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tierAugments.map(augment => (
                    <div
                      key={augment.name}
                      className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3 hover:bg-gold-light/10 transition-colors"
                    >
                      <AugmentDisplay
                        augmentName={augment.name}
                        tier={augment.tier}
                        showTooltip={true}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
