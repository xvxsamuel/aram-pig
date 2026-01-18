'use client'

import Image from 'next/image'
import clsx from 'clsx'
import { STAT_PERKS } from '@/lib/game/runes'
import { getRuneIconUrl } from '@/lib/ddragon'

interface StatPerksDisplayProps {
  offense: number
  flex: number
  defense: number
}

export function StatPerksDisplay({ offense, flex, defense }: StatPerksDisplayProps) {
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
                src={getRuneIconUrl(shard.icon)}
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
    <div className="flex flex-col gap-1">
      {renderStatShard(STAT_PERKS.offense, offense)}
      {renderStatShard(STAT_PERKS.flex, flex)}
      {renderStatShard(STAT_PERKS.defense, defense)}
    </div>
  )
}
