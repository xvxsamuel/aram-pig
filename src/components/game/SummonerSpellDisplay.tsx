'use client'

import Image from 'next/image'
import SummonerSpellTooltip from '@/components/ui/SummonerSpellTooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { getSummonerSpellUrl } from '@/lib/ddragon'
import { getWinrateColor } from '@/lib/ui'
import type { SummonerSpellStat } from '@/types/champion-stats'
import summonerSpellsData from '@/data/summoner-spells.json'

interface SummonerSpellDisplayProps {
  spell1Id: number
  spell2Id: number
  ddragonVersion: string
  showStats?: boolean
  stats?: {
    winrate: number
    games: number
  }
  size?: 'sm' | 'md' | 'lg'
  useSimpleTooltip?: boolean
}

export function SummonerSpellDisplay({
  spell1Id,
  spell2Id,
  ddragonVersion,
  showStats = false,
  stats,
  size = 'md',
  useSimpleTooltip = false,
}: SummonerSpellDisplayProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }

  const sizePixels = {
    sm: 32,
    md: 40,
    lg: 48,
  }

  const renderSpell = (spellId: number) => {
    const spellInfo = spellId
      ? (summonerSpellsData as Record<string, { name?: string; iconPath?: string }>)[String(spellId)]
      : null

    const content = (
      <div className={`${sizeClasses[size]} rounded bg-abyss-800 border border-gray-700 overflow-hidden cursor-pointer`}>
        <Image
          src={getSummonerSpellUrl(spellId, ddragonVersion)}
          alt={spellInfo?.name || ''}
          width={sizePixels[size]}
          height={sizePixels[size]}
          className="w-full h-full object-cover"
          unoptimized
        />
      </div>
    )

    if (useSimpleTooltip && spellInfo) {
      return (
        <SimpleTooltip
          key={spellId}
          content={
            <div className="text-xs">
              <div className="font-medium text-white">{spellInfo.name || 'Unknown Spell'}</div>
            </div>
          }
        >
          {content}
        </SimpleTooltip>
      )
    }

    return (
      <SummonerSpellTooltip key={spellId} spellId={spellId}>
        {content}
      </SummonerSpellTooltip>
    )
  }

  return (
    <div>
      {showStats && stats && (
        <div className="flex gap-2 mb-2 text-sm">
          <div className="text-white font-bold" style={{ color: getWinrateColor(stats.winrate) }}>
            {stats.winrate.toFixed(1)}%
          </div>
          <div className="text-subtitle">{stats.games.toLocaleString()}</div>
        </div>
      )}
      <div className="flex gap-2">
        {renderSpell(spell1Id)}
        {renderSpell(spell2Id)}
      </div>
    </div>
  )
}

interface BestSummonerSpellsProps {
  spellStats: SummonerSpellStat[]
  ddragonVersion: string
  calculateWilsonScore: (games: number, wins: number) => number
}

export function BestSummonerSpells({
  spellStats,
  ddragonVersion,
  calculateWilsonScore,
}: BestSummonerSpellsProps) {
  if (spellStats.length === 0) return null

  const sortedSpells = [...spellStats]
    .map(s => ({
      ...s,
      wilsonScore: calculateWilsonScore(s.games, s.wins),
    }))
    .sort((a, b) => b.wilsonScore - a.wilsonScore)

  const best = sortedSpells[0]

  return (
    <SummonerSpellDisplay
      spell1Id={best.spell1_id}
      spell2Id={best.spell2_id}
      ddragonVersion={ddragonVersion}
      showStats
      stats={{
        winrate: best.winrate,
        games: best.games,
      }}
    />
  )
}
