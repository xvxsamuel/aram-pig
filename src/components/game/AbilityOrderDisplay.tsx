'use client'

import clsx from 'clsx'
import { getAbilityMaxOrder } from '@/components/champions/tabs/utils'
import { getWinrateColor } from '@/lib/ui'
import ChampionAbility from '@/components/ui/ChampionAbility'

// Map abilities to KDA colors - lowest to highest (3=green, 4=blue, 5=pink)
const getAbilityColor = (ability: string, position: number): string => {
  if (ability === 'R') return 'text-gold-light'
  const colorMap = ['text-kda-3', 'text-kda-4', 'text-kda-5']
  return colorMap[position] || 'text-white'
}

interface AbilityOrderDisplayProps {
  abilityOrder: string
  showFullSequence?: boolean
  compact?: boolean
  championName?: string
}

export function AbilityOrderDisplay({
  abilityOrder,
  showFullSequence = true,
  compact: _compact = false,
  championName,
}: AbilityOrderDisplayProps) {
  const abilities = abilityOrder.split('.')
  const maxOrder = getAbilityMaxOrder(abilityOrder)

  return (
    <div className="space-y-3">
      {/* Max order display */}
      <div className="flex items-center gap-2">
        {championName ? (
          maxOrder.map((ability, idx) => (
            <div key={ability} className="flex items-center gap-1.5">
              {idx > 0 && <span className="text-text-muted text-sm">&gt;</span>}
              <ChampionAbility 
                championName={championName} 
                ability={ability as 'P' | 'Q' | 'W' | 'E' | 'R'} 
                size="lg"
              />
            </div>
          ))
        ) : (
          maxOrder.map((ability, idx) => (
            <div key={ability} className="flex items-center gap-1.5">
              {idx > 0 && <span className="text-text-muted text-sm">&gt;</span>}
              <div
                className={clsx(
                  'w-7 h-7 rounded border bg-abyss-800 flex items-center justify-center text-xs font-bold',
                  ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                  getAbilityColor(ability, idx)
                )}
              >
                {ability === 'R' ? <h2 className="text-xs">{ability}</h2> : ability}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Full sequence */}
      {showFullSequence && (
        <div className="flex flex-wrap gap-1">
          {abilities.map((ability, idx) => {
            // For full sequence, find ability position in maxOrder for consistent coloring
            const maxOrderPosition = maxOrder.indexOf(ability)
            return (
              <div
                key={idx}
                className={clsx(
                  'w-6 h-6 rounded border bg-abyss-800 text-[12px] font-bold flex items-center justify-center',
                  ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                  getAbilityColor(ability, maxOrderPosition)
                )}
              >
                {ability === 'R' ? <h2 className="text-[12px]">{ability}</h2> : ability}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface AbilityOrderWithStatsProps {
  abilityOrder: string
  winrate: number
  pickrate: number
  games: number
  championName: string
  showFullSequence?: boolean
}

export function AbilityOrderWithStats({
  abilityOrder,
  winrate,
  pickrate,
  games,
  championName,
  showFullSequence = false,
}: AbilityOrderWithStatsProps) {
  const abilities = abilityOrder.split('.')
  const maxOrder = getAbilityMaxOrder(abilityOrder)

  return (
    <div className="bg-abyss-700 rounded-lg border border-gold-dark/20 p-3">
      <div className="flex items-center justify-between gap-4">
        {/* Ability sequence */}
        <div className="flex items-center gap-1.5">
          {maxOrder.map((ability, idx) => (
            <div key={ability} className="flex items-center">
              {idx > 0 && <span className="text-gray-500 font-bold text-lg">&gt;</span>}
              <div className="mx-0.5">
                <ChampionAbility 
                  championName={championName} 
                  ability={ability as 'P' | 'Q' | 'W' | 'E' | 'R'} 
                  size="lg"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm ml-auto">
          <span className="text-subtitle">
            Pick: <span className="font-bold text-white">{pickrate.toFixed(1)}%</span>
          </span>
          <span className="text-subtitle">
            Win:{' '}
            <span className="font-bold" style={{ color: getWinrateColor(winrate) }}>
              {winrate.toFixed(1)}%
            </span>
          </span>
          <span className="text-subtitle">
            <span className="font-bold text-white">{games.toLocaleString()}</span> games
          </span>
        </div>
      </div>

      {/* Full sequence if requested */}
      {showFullSequence && (
        <div className="flex flex-wrap gap-1 mt-3">
          {abilities.map((ability, idx) => {
            // For full sequence, find ability position in maxOrder for consistent coloring
            const maxOrderPosition = maxOrder.indexOf(ability)
            return (
              <div
                key={idx}
                className={clsx(
                  'w-6 h-6 rounded border bg-abyss-800 text-[12px] font-bold flex items-center justify-center',
                  ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                  getAbilityColor(ability, maxOrderPosition)
                )}
              >
                {ability}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
