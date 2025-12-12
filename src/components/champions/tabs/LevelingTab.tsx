'use client'

import Card from '@/components/ui/Card'
import { AbilityOrderWithStats } from '@/components/game/AbilityOrderDisplay'
import type { AbilityLevelingStat } from '@/types/champion-stats'

interface LevelingTabProps {
  abilityLevelingStats: AbilityLevelingStat[]
}

export function LevelingTab({ abilityLevelingStats }: LevelingTabProps) {
  return (
    <div className="pb-8">
      <Card title="Skill Max Orders">
        {abilityLevelingStats.length > 0 ? (
          <div className="space-y-4">
            {abilityLevelingStats.map((stat, idx) => (
              <AbilityOrderWithStats
                key={idx}
                abilityOrder={stat.ability_order}
                winrate={stat.winrate}
                pickrate={stat.pickrate}
                games={stat.games}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            No leveling order data available yet. Data is collected from recent profile updates.
          </div>
        )}
      </Card>
    </div>
  )
}
