'use client'

import Image from 'next/image'
import Card from '@/components/ui/Card'
import ChampionAbility from '@/components/ui/ChampionAbility'
import SummonerSpellTooltip from '@/components/ui/SummonerSpellTooltip'
import { getSummonerSpellUrl } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'
import { getAbilityMaxOrder } from './utils'
import type { AbilityLevelingStat, SummonerSpellStat } from '@/types/champion-stats'

interface LevelingTabProps {
  abilityLevelingStats: AbilityLevelingStat[]
  summonerSpellStats: SummonerSpellStat[]
  ddragonVersion: string
  championName: string
}

export function LevelingTab({ abilityLevelingStats, summonerSpellStats, ddragonVersion, championName }: LevelingTabProps) {
  return (
    <div className="space-y-4 pb-8">
      {/* summoner spells card */}
      <Card title="Summoner Spells">
        <div className="flex gap-3">
          <div className="flex flex-col space-y-1 text-[10px] text-subtitle pt-[52px]">
            <div className="h-[14px] leading-[14px]">Win Rate</div>
            <div className="h-[14px] leading-[14px]">Pick Rate</div>
            <div className="h-[14px] leading-[14px]">Games</div>
          </div>
          <div className="overflow-x-auto flex-1 -mr-4.5">
            <div className="flex gap-2 pr-4.5 pb-1">
              {summonerSpellStats.length > 0 ? (
                summonerSpellStats.map((stat, idx) => (
                  <div key={idx} className="bg-abyss-700 rounded-lg p-2 flex-shrink-0">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex gap-1 justify-center">
                        {[stat.spell1_id, stat.spell2_id].map((spellId, spellIdx) => (
                          <SummonerSpellTooltip key={spellIdx} spellId={spellId}>
                            <div className="w-10 h-10 rounded bg-abyss-800 border border-gold-dark overflow-hidden cursor-pointer">
                              <Image
                                src={getSummonerSpellUrl(spellId, ddragonVersion)}
                                alt=""
                                width={40}
                                height={40}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </div>
                          </SummonerSpellTooltip>
                        ))}
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[10px] font-bold text-center" style={{ color: getWinrateColor(stat.winrate) }}>
                          {stat.winrate.toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-bold text-white text-center">
                          {stat.pickrate.toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-bold text-text-muted text-center">
                          {stat.games.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-400 py-8">
                  No summoner spell data available.
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* levelling orders card */}
      <Card title="Levelling Orders">
        <div className="flex gap-3">
          <div className="flex flex-col space-y-1 text-[10px] text-subtitle pt-[52px]">
            <div className="h-[14px] leading-[14px]">Win Rate</div>
            <div className="h-[14px] leading-[14px]">Pick Rate</div>
            <div className="h-[14px] leading-[14px]">Games</div>
          </div>
          <div className="overflow-x-auto flex-1 -mr-4.5">
            <div className="flex gap-2 pr-4.5 pb-1">
              {abilityLevelingStats.length > 0 ? (
                abilityLevelingStats.map((stat, idx) => {
                  const maxOrder = getAbilityMaxOrder(stat.ability_order)
                  return (
                    <div key={idx} className="bg-abyss-700 rounded-lg p-2 flex-shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 justify-center">
                          {maxOrder.map((ability, abilityIdx) => (
                            <div key={abilityIdx} className="flex items-center">
                              {abilityIdx > 0 && <span className="text-gray-500 font-bold text-sm mx-0.5">&gt;</span>}
                              <ChampionAbility 
                                championName={championName} 
                                ability={ability as 'P' | 'Q' | 'W' | 'E' | 'R'} 
                                size="lg"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-bold text-center" style={{ color: getWinrateColor(stat.winrate) }}>
                            {stat.winrate.toFixed(1)}%
                          </div>
                          <div className="text-[10px] font-bold text-white text-center">
                            {stat.pickrate.toFixed(1)}%
                          </div>
                          <div className="text-[10px] font-bold text-text-muted text-center">
                            {stat.games.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center text-gray-400 py-8">
                  No leveling order data available yet. Data is collected from recent profile updates.
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
