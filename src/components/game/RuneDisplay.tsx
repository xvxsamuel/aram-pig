'use client'

import Image from 'next/image'
import clsx from 'clsx'
import { STAT_PERKS, getRuneTreeById } from '@/lib/game/runes'
import RuneTooltip from '@/components/ui/RuneTooltip'
import runesData from '@/data/runes.json'

interface RuneDisplayProps {
  primaryTreeId: number
  secondaryTreeId: number
  selectedRuneIds: Set<number>
  statPerks?: {
    offense?: number
    flex?: number
    defense?: number
  }
  compact?: boolean
}

export function RuneDisplay({
  primaryTreeId,
  secondaryTreeId,
  selectedRuneIds,
  statPerks,
  compact: _compact = false,
}: RuneDisplayProps) {
  const primaryTree = getRuneTreeById(primaryTreeId)
  const secondaryTree = getRuneTreeById(secondaryTreeId)

  // Helper to render a rune icon
  const renderRune = (runeId: number, isKeystone: boolean = false) => {
    const runeInfo = (runesData as Record<string, { icon?: string; name?: string }>)[String(runeId)]
    const isSelected = selectedRuneIds.has(runeId)
    const size = isKeystone ? 'w-9 h-9' : 'w-7 h-7'
    const imgSize = isKeystone ? 36 : 28

    return (
      <RuneTooltip key={runeId} runeId={runeId}>
        <div
          className={clsx(
            size,
            'rounded-full overflow-hidden',
            isSelected ? 'border-2 border-gold-light' : 'border border-gray-700 opacity-30 grayscale'
          )}
        >
          {runeInfo?.icon && (
            <Image
              src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
              alt={runeInfo.name || ''}
              width={imgSize}
              height={imgSize}
              className="w-full h-full object-cover"
              unoptimized
            />
          )}
        </div>
      </RuneTooltip>
    )
  }

  // Helper to render stat shard
  const renderStatShard = (
    shardOptions: ReadonlyArray<{ readonly id: number; readonly name: string; readonly icon: string }>,
    selectedId: number | undefined
  ) => {
    return (
      <div className="flex gap-1">
        {shardOptions.map(shard => {
          const isSelected = shard.id === selectedId
          return (
            <div
              key={shard.id}
              className={clsx(
                'w-5 h-5 rounded-full overflow-hidden',
                isSelected ? 'border border-gold-light' : 'border border-gray-700 opacity-30 grayscale'
              )}
            >
              <Image
                src={`https://ddragon.leagueoflegends.com/cdn/img/${shard.icon}`}
                alt={shard.name}
                width={20}
                height={20}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      {/* Primary Tree */}
      {primaryTree && (
        <div className="bg-abyss-800 rounded-lg p-3 border border-gold-dark/30">
          <div className="flex items-center gap-2 mb-2">
            {(() => {
              const treeInfo = (runesData as Record<string, { icon?: string; name?: string }>)[
                String(primaryTree.id)
              ]
              return (
                <>
                  {treeInfo?.icon && (
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <Image
                        src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                        alt={primaryTree.name}
                        width={20}
                        height={20}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <span className="text-[10px] font-medium" style={{ color: primaryTree.color }}>
                    {primaryTree.name}
                  </span>
                </>
              )
            })()}
          </div>

          {/* Keystones */}
          <div
            className={clsx(
              'grid gap-1 justify-items-center mb-2',
              primaryTree.keystones.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
            )}
          >
            {primaryTree.keystones.map(id => renderRune(id, true))}
          </div>

          <div className="border-t border-gray-700/50 my-2" />

          {/* Tier runes */}
          {[primaryTree.tier1, primaryTree.tier2, primaryTree.tier3].map((tier, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-1 justify-items-center mb-1 last:mb-0">
              {tier.map(id => renderRune(id))}
            </div>
          ))}
        </div>
      )}

      {/* Secondary Tree */}
      {secondaryTree && (
        <div className="bg-abyss-800 rounded-lg p-3 border border-gray-700/30">
          <div className="flex items-center gap-2 mb-2">
            {(() => {
              const treeInfo = (runesData as Record<string, { icon?: string; name?: string }>)[
                String(secondaryTree.id)
              ]
              return (
                <>
                  {treeInfo?.icon && (
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <Image
                        src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                        alt={secondaryTree.name}
                        width={20}
                        height={20}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <span className="text-[10px] font-medium" style={{ color: secondaryTree.color }}>
                    {secondaryTree.name}
                  </span>
                </>
              )
            })()}
          </div>

          {/* Tier runes only (no keystones for secondary) */}
          {[secondaryTree.tier1, secondaryTree.tier2, secondaryTree.tier3].map((tier, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-1 justify-items-center mb-1 last:mb-0">
              {tier.map(id => renderRune(id))}
            </div>
          ))}

          {/* Stat Shards - under separator in secondary tree */}
          {statPerks && (
            <>
              <div className="border-t border-gray-700/50 my-2" />
              <div className="flex flex-col gap-1">
                {renderStatShard(STAT_PERKS.offense, statPerks.offense)}
                {renderStatShard(STAT_PERKS.flex, statPerks.flex)}
                {renderStatShard(STAT_PERKS.defense, statPerks.defense)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
