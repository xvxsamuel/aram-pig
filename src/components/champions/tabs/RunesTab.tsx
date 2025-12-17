'use client'

import Image from 'next/image'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import RuneTooltip from '@/components/ui/RuneTooltip'
import { getWinrateColor } from '@/lib/ui'
import { RUNE_TREES, STAT_PERKS } from '@/lib/game/runes'
import type { RuneStat, StatPerkStat } from '@/types/champion-stats'
import runesData from '@/data/runes.json'

interface RunesTabProps {
  runeStats: Record<number, RuneStat[]>
  statPerks: {
    offense: StatPerkStat[]
    flex: StatPerkStat[]
    defense: StatPerkStat[]
  }
  totalGames: number
}

export function RunesTab({ runeStats, statPerks, totalGames }: RunesTabProps) {
  // Collect PRIMARY runes from slots 0-3 (keystone + primary tree tiers)
  const primaryRunesMap = new Map<number, RuneStat>()
  ;[0, 1, 2, 3].forEach(slot => {
    runeStats[slot]?.forEach(rune => {
      if (!primaryRunesMap.has(rune.rune_id)) {
        primaryRunesMap.set(rune.rune_id, rune)
      }
    })
  })

  // Collect SECONDARY runes from slots 4-5 (secondary tree tiers only)
  const secondaryRunesMap = new Map<number, RuneStat>()
  ;[4, 5].forEach(slot => {
    runeStats[slot]?.forEach(rune => {
      if (!secondaryRunesMap.has(rune.rune_id)) {
        secondaryRunesMap.set(rune.rune_id, rune)
      }
    })
  })

  // Fixed tree order: Precision, Domination, Sorcery, Resolve, Inspiration
  const treeOrder = ['precision', 'domination', 'sorcery', 'resolve', 'inspiration']

  // Render a single rune icon with stats
  const renderRune = (
    runeId: number,
    statsMap: Map<number, RuneStat>,
    size: 'lg' | 'sm' = 'sm'
  ) => {
    const runeInfo = (runesData as Record<string, any>)[runeId.toString()]
    const runeStat = statsMap.get(runeId)
    const hasData = runeStat && runeStat.games > 0
    const isLowPickrate = runeStat && runeStat.pickrate < 1
    const shouldGrey = !hasData || isLowPickrate
    const sizeClass = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
    const imgSize = size === 'lg' ? 40 : 32

    return (
      <RuneTooltip key={runeId} runeId={runeId}>
        <div className="flex flex-col items-center cursor-pointer">
          <div className={clsx(sizeClass, 'rounded-full overflow-hidden', shouldGrey && 'opacity-40')}>
            {runeInfo?.icon && (
              <Image
                src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                alt=""
                width={imgSize}
                height={imgSize}
                className={clsx('w-full h-full', shouldGrey && 'grayscale')}
                unoptimized
              />
            )}
          </div>
          <div className="text-[10px] text-center mt-1">
            {hasData ? (
              <>
                <div
                  className={clsx('font-bold', isLowPickrate && 'text-gray-600')}
                  style={!isLowPickrate ? { color: getWinrateColor(runeStat.winrate) } : undefined}
                >
                  {runeStat.winrate.toFixed(1)}%
                </div>
                <div className={clsx(isLowPickrate ? 'text-gray-600' : 'text-subtitle')}>
                  {runeStat.games.toLocaleString()}
                </div>
              </>
            ) : (
              <>
                <div className="text-gray-600">-</div>
                <div className="text-gray-600">0</div>
              </>
            )}
          </div>
        </div>
      </RuneTooltip>
    )
  }

  const renderStatPerk = (
    perk: { id: number; name: string; icon: string },
    stat: StatPerkStat | undefined,
    idx: number,
    category: string
  ) => {
    const hasData = stat && stat.games > 0
    const pickrate = hasData && totalGames > 0 ? (stat.games / totalGames) * 100 : 0
    const isLowPickrate = pickrate < 1
    const shouldGrey = !hasData || isLowPickrate

    return (
      <div key={`${category}-${idx}`} className="flex flex-col items-center">
        <div className={clsx('w-8 h-8 rounded-full overflow-hidden', shouldGrey && 'opacity-40')}>
          <Image
            src={`https://ddragon.leagueoflegends.com/cdn/img/${perk.icon}`}
            alt={perk.name}
            width={32}
            height={32}
            className={clsx('w-full h-full', shouldGrey && 'grayscale')}
            unoptimized
          />
        </div>
        <div className="text-[10px] text-center mt-1">
          {hasData ? (
            <>
              <div
                className={clsx('font-bold', isLowPickrate && 'text-gray-600')}
                style={!isLowPickrate ? { color: getWinrateColor(stat.winrate) } : undefined}
              >
                {stat.winrate.toFixed(1)}%
              </div>
              <div className={clsx(isLowPickrate ? 'text-gray-600' : 'text-subtitle')}>
                {stat.games.toLocaleString()}
              </div>
            </>
          ) : (
            <>
              <div className="text-gray-600">-</div>
              <div className="text-gray-600">0</div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (Object.keys(runeStats).length === 0) {
    return <div className="text-center text-gray-400 py-8">No rune data available</div>
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Primary Runes Section */}
      <Card title="Primary">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {treeOrder.map(treeName => {
            const tree = RUNE_TREES[treeName as keyof typeof RUNE_TREES]
            if (!tree) return null

            return (
              <div key={treeName} className="bg-abyss-700 rounded-lg px-4.5 py-2">
                {/* Keystones Row */}
                <div
                  className={clsx(
                    'grid gap-1 justify-items-center mb-3',
                    tree.keystones.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
                  )}
                >
                  {tree.keystones.map(runeId => renderRune(runeId, primaryRunesMap, 'lg'))}
                </div>

                {/* Separator */}
                <div className="border-t border-gold-dark/40 my-3" />

                {/* Tier Runes */}
                {[tree.tier1, tree.tier2, tree.tier3].map((tierRuneIds, tierIdx) => (
                  <div key={tierIdx} className="mb-2 last:mb-0">
                    <div className="grid grid-cols-3 gap-1 justify-items-center">
                      {tierRuneIds.map(runeId => renderRune(runeId, primaryRunesMap))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Secondary Runes Section */}
      <Card title="Secondary">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {treeOrder.map(treeName => {
            const tree = RUNE_TREES[treeName as keyof typeof RUNE_TREES]
            if (!tree) return null

            return (
              <div key={treeName} className="bg-abyss-700 rounded-lg px-4.5 py-2">
                {/* Tier Runes Only (no keystones for secondary) */}
                {[tree.tier1, tree.tier2, tree.tier3].map((tierRuneIds, tierIdx) => (
                  <div key={tierIdx} className="mb-2 last:mb-0">
                    <div className="grid grid-cols-3 gap-1 justify-items-center">
                      {tierRuneIds.map(runeId => renderRune(runeId, secondaryRunesMap))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Stat Shards Section */}
      <Card title="Stats">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Offense Box */}
          <div className="bg-abyss-700 rounded-lg px-4.5 py-2">
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              {STAT_PERKS.offense.map((perk, idx) => {
                const stat = statPerks.offense.find(s => s.key === perk.id.toString())
                return renderStatPerk(perk, stat, idx, 'offense')
              })}
            </div>
          </div>

          {/* Flex Box */}
          <div className="bg-abyss-700 rounded-lg px-4.5 py-2">
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              {STAT_PERKS.flex.map((perk, idx) => {
                const stat = statPerks.flex.find(s => s.key === perk.id.toString())
                return renderStatPerk(perk, stat, idx, 'flex')
              })}
            </div>
          </div>

          {/* Defense Box */}
          <div className="bg-abyss-700 rounded-lg px-4.5 py-2">
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              {STAT_PERKS.defense.map((perk, idx) => {
                const stat = statPerks.defense.find(s => s.key === perk.id.toString())
                return renderStatPerk(perk, stat, idx, 'defense')
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
