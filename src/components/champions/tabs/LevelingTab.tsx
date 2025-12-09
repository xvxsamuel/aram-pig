'use client'

import { AbilityOrderWithStats } from '@/components/game/AbilityOrderDisplay'
import type { AbilityLevelingStat } from '@/types/champion-stats'

interface LevelingTabProps {
  abilityLevelingStats: AbilityLevelingStat[]
}

export function LevelingTab({ abilityLevelingStats }: LevelingTabProps) {
  return (
    <div className="space-y-4 pb-8">
      {abilityLevelingStats.length > 0 ? (
        <>
          <div className="text-sm text-gray-400 mb-4">Most popular skill max orders</div>
          {abilityLevelingStats.map((stat, idx) => (
            <AbilityOrderWithStats
              key={idx}
              abilityOrder={stat.ability_order}
              winrate={stat.winrate}
              pickrate={stat.pickrate}
              games={stat.games}
            />
          ))}
        </>
      ) : (
        <div className="text-center text-gray-400 py-8">
          No leveling order data available yet. Data is collected from recent profile updates.
        </div>
      )}
    </div>
  )
}
