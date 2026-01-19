'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { getItemImageUrl } from '@/lib/ddragon'
import { getPigScoreColor } from '@/lib/ui'
import Tooltip from '@/components/ui/Tooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { RuneDisplay } from '@/components/game/RuneDisplay'
import { SummonerSpellDisplay } from '@/components/game/SummonerSpellDisplay'
import { AbilityOrderDisplay } from '@/components/game/AbilityOrderDisplay'
import DataWarning from '@/components/ui/DataWarning'
import runesData from '@/data/runes.json'
import {
  TabProps,
  ItemTimelineEvent,
  isCompletedItemById,
  formatTime,
  BOOT_IDS,
} from './shared'

// animated glow component for scored items with pig score color
// (glow removed - just passes through children)
function ScoredItemGlow({ 
  children, 
}: { 
  children: React.ReactNode
  score?: number 
}) {
  return <>{children}</>
}

// PIG label component for category scores
function PigLabel({ score }: { score: number | undefined }) {
  if (score === undefined) return null
  return (
    <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full inline-flex">
      <div className="bg-abyss-700 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none flex items-center gap-0.5 uppercase tracking-wide">
        <span style={{ color: getPigScoreColor(score) }}>{score}</span>
        <span className="text-white">PIG</span>
      </div>
    </div>
  )
}

function BuildSection({ 
  title, 
  score, 
  children, 
  className,
  rightContent
}: { 
  title: React.ReactNode
  score?: number 
  children: React.ReactNode
  className?: string
  rightContent?: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b border-abyss-700 shrink-0 bg-abyss-700">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wide">{title}</h3>
          {rightContent}
        </div>
        <PigLabel score={score} />
      </div>
      <div className={clsx("flex-1", className)}>
        {children}
      </div>
    </div>
  )
}

export function BuildTab({
  currentPlayer,
  ddragonVersion,
  participantDetails,
  pigScoreBreakdown,
  showPigScores = true,
  loadingBreakdown,
}: TabProps) {
  if (!currentPlayer) return null

  // check if we're still loading details
  const playerDetails = participantDetails.get(currentPlayer.puuid)
  const isLoading = loadingBreakdown || !playerDetails || playerDetails.loading

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="min-h-[200px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
        </div>
      </div>
    )
  }

  // check if we have timeline data, only show PIG labels if we do AND showPigScores is true
  const hasTimelineData = playerDetails?.item_timeline && playerDetails.item_timeline.length > 0
  const displayPigScores = showPigScores && hasTimelineData

  return (
    <div className="flex flex-col">
      {/* 1. Item Build (Timeline) */}
      <BuildSection 
        title="Item Build" 
        score={displayPigScores ? pigScoreBreakdown?.buildSubScores?.items : undefined}
        rightContent={displayPigScores && pigScoreBreakdown?.fallbackInfo?.items && (
          <DataWarning warnings={['Using data from a different patch or build because not enough games with this exact build were found.']} />
        )}
        className="p-4"
      >
        {(() => {
          // Get timeline and deduplicate by timestamp+itemId+action
          const rawTimeline = (playerDetails.item_timeline || []) as ItemTimelineEvent[]
          const seenEvents = new Set<string>()
          const itemTimeline = rawTimeline.filter(event => {
            const key = `${event.timestamp}-${event.itemId}-${event.action}`
            if (seenEvents.has(key)) return false
            seenEvents.add(key)
            return true
          })

          if (itemTimeline.length === 0) {
            // No timeline - show simple items list
            const playerItems = [
              currentPlayer.item0,
              currentPlayer.item1,
              currentPlayer.item2,
              currentPlayer.item3,
              currentPlayer.item4,
              currentPlayer.item5,
            ].filter(itemId => itemId > 0)

            if (playerItems.length === 0) {
              return <div className="text-xs text-text-muted">No items data available</div>
            }

            return (
              <div className="flex gap-2 items-center flex-wrap">
                {playerItems.map((itemId, idx) => {
                  const isFinished = isCompletedItemById(itemId)
                  // Match by itemId, not by slot (penalties use actual item positions, not purchase order)
                  const itemDetail = pigScoreBreakdown?.itemDetails?.find(d => d.itemId === itemId)
                  const winrate = itemDetail?.playerWinrate
                  // Calculate item score from penalty (max penalty is 20 per item)
                  const itemScore = itemDetail ? Math.round(100 - (itemDetail.penalty / 20) * 100) : undefined

                  return (
                    <SimpleTooltip
                      key={idx}
                      content={
                        isFinished && itemScore !== undefined ? (
                          <div className="text-xs">
                            <div className="flex justify-center">
                              <div className="bg-abyss-700 rounded-full px-2 py-1 text-xs font-semibold leading-none flex items-center gap-1 border border-gold-dark/40 uppercase tracking-wide">
                                <span style={{ color: getPigScoreColor(itemScore) }}>
                                  {itemScore}
                                </span>
                                <span className="text-white">PIG</span>
                              </div>
                            </div>
                            {winrate !== undefined && itemDetail && (
                              <div className="mt-1 text-center text-text-muted">
                                {winrate.toFixed(1)}% WR as {itemDetail.slot + 1}{itemDetail.slot === 0 ? 'st' : itemDetail.slot === 1 ? 'nd' : itemDetail.slot === 2 ? 'rd' : 'th'} item
                              </div>
                            )}
                          </div>
                        ) : null
                      }
                    >
                      {isFinished ? (
                        <ScoredItemGlow score={itemScore}>
                          <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800 relative">
                            <Tooltip id={itemId} type="item">
                              <Image
                                src={getItemImageUrl(itemId, ddragonVersion)}
                                alt={`Item ${itemId}`}
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </Tooltip>
                          </div>
                        </ScoredItemGlow>
                      ) : (
                        <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800 relative border border-gold-dark/50">
                          <Tooltip id={itemId} type="item">
                            <Image
                              src={getItemImageUrl(itemId, ddragonVersion)}
                              alt={`Item ${itemId}`}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </Tooltip>
                        </div>
                      )}
                    </SimpleTooltip>
                  )
                })}
              </div>
            )
          }

          // Have timeline - show all events in order
          // Track completed items for highlighting
          const completedItemIds = new Set<number>()

          for (const event of itemTimeline) {
            if (
              event.action === 'buy' &&
              (event.itemType === 'legendary' || event.itemType === 'boots' || event.itemType === 'mythic')
            ) {
              completedItemIds.add(event.itemId)
            }
          }

          // Group items by 20-second proximity
          const GROUP_GAP_MS = 20000 // 20 seconds
          const itemGroups: ItemTimelineEvent[][] = []
          let currentGroup: ItemTimelineEvent[] = []

          for (const event of itemTimeline) {
            if (currentGroup.length === 0) {
              currentGroup.push(event)
            } else {
              const lastEvent = currentGroup[currentGroup.length - 1]
              if (event.timestamp - lastEvent.timestamp <= GROUP_GAP_MS) {
                currentGroup.push(event)
              } else {
                itemGroups.push(currentGroup)
                currentGroup = [event]
              }
            }
          }
          if (currentGroup.length > 0) {
            itemGroups.push(currentGroup)
          }

          // Skip first group if it's starter items (already shown above)
          const startingDetails = pigScoreBreakdown?.startingItemsDetails
          const firstGroup = itemGroups[0]
          // Check if first group is starter items (< 30s) for glow purposes
          // Starter items should glow regardless of whether we have stats data
          const isFirstGroupStarter = firstGroup && 
            firstGroup[0].timestamp < 30000 && 
            firstGroup.every(e => e.action === 'buy')

          // Show ALL groups including starter items in the timeline
          const displayGroups = itemGroups

          return (
            <div className="relative">
              {/* Timeline container */}
              <div className="relative flex flex-wrap gap-y-4 gap-x-1 items-start">
                {displayGroups.map((group, groupIdx) => {
                  // Check if this group is the starter items group
                  const isStarterGroup = groupIdx === 0 && isFirstGroupStarter
                  const groupContent = (
                    <div className="flex gap-1 items-end">
                      {group.map((event, idx) => {
                        const isFinished =
                          event.itemType === 'legendary' ||
                          event.itemType === 'boots' ||
                          event.itemType === 'mythic'
                        const isSell = event.action === 'sell'
                        // For starter items, use the starting items score
                        const isStarterItem = isStarterGroup && !isSell
                        // Match by itemId, not by slot (penalties use actual item positions, not purchase order)
                        const itemDetail = pigScoreBreakdown?.itemDetails?.find(d => d.itemId === event.itemId)
                        const winrate = itemDetail?.playerWinrate
                        // Calculate item score from penalty (max penalty is 20 per item)
                        const itemScore = itemDetail ? Math.round(100 - (itemDetail.penalty / 20) * 100) : undefined
                        // For starter items, show the starter score
                        const starterScore = startingDetails ? Math.round(100 - (startingDetails.penalty / 10) * 100) : undefined
                        // Get the display score for glow coloring
                        const displayScore = isStarterItem ? starterScore : itemScore
                        // Apply glow to finished items OR starter items
                        const shouldGlow = (isFinished && !isSell) || isStarterItem

                        return (
                          <div key={idx} className="flex flex-col items-center gap-1">
                            <SimpleTooltip
                              content={
                                <div className="text-xs">
                                  <div className="font-medium text-white">{event.itemName}</div>
                                  <div className="text-text-muted">
                                    {isSell ? 'Sold' : 'Bought'} at {formatTime(event.timestamp)}
                                  </div>
                                  {isStarterItem && starterScore !== undefined && (
                                    <div className="mt-2 flex justify-center">
                                      <div className="bg-abyss-700 rounded-full px-2 py-1 text-xs font-semibold leading-none flex items-center gap-1 border border-gold-dark/40 uppercase tracking-wide">
                                        <span style={{ color: getPigScoreColor(starterScore) }}>
                                          {starterScore}
                                        </span>
                                        <span className="text-white">PIG</span>
                                      </div>
                                    </div>
                                  )}
                                  {isStarterItem && startingDetails?.playerWinrate !== undefined && (
                                    <div className="mt-1 text-center text-text-muted">
                                      {startingDetails.playerWinrate.toFixed(1)}% WR
                                    </div>
                                  )}
                                  {!isStarterItem && isFinished && !isSell && itemScore !== undefined && (
                                    <div className="mt-2 flex justify-center">
                                      <div className="bg-abyss-700 rounded-full px-2 py-1 text-xs font-semibold leading-none flex items-center gap-1 border border-gold-dark/40 uppercase tracking-wide">
                                        <span style={{ color: getPigScoreColor(itemScore) }}>
                                          {itemScore}
                                        </span>
                                        <span className="text-white">PIG</span>
                                      </div>
                                    </div>
                                  )}
                                  {!isStarterItem && isFinished && !isSell && winrate !== undefined && itemDetail && (
                                    <div className="mt-1 text-center text-text-muted">
                                      {winrate.toFixed(1)}% WR as {itemDetail.slot + 1}{itemDetail.slot === 0 ? 'st' : itemDetail.slot === 1 ? 'nd' : itemDetail.slot === 2 ? 'rd' : 'th'} item
                                    </div>
                                  )}
                                </div>
                              }
                            >
                              {shouldGlow ? (
                                <ScoredItemGlow score={displayScore}>
                                  <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800 relative">
                                    <Image
                                      src={getItemImageUrl(event.itemId, ddragonVersion)}
                                      alt={event.itemName || `Item ${event.itemId}`}
                                      width={32}
                                      height={32}
                                      className="w-full h-full object-cover"
                                      unoptimized
                                    />
                                  </div>
                                </ScoredItemGlow>
                              ) : (
                                <div
                                  className={clsx(
                                    'w-8 h-8 rounded overflow-hidden bg-abyss-800 relative border border-gold-dark/50',
                                    isSell && 'opacity-50'
                                  )}
                                >
                                  <Image
                                    src={getItemImageUrl(event.itemId, ddragonVersion)}
                                    alt={event.itemName || `Item ${event.itemId}`}
                                    width={32}
                                    height={32}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                  {isSell && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-negative/30">
                                      <span className="text-white text-[10px] font-bold">×</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </SimpleTooltip>
                            <span className="text-[9px] text-text-muted tabular-nums">
                              {formatTime(event.timestamp)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )

                  const isLastGroup = groupIdx === displayGroups.length - 1

                  return (
                    <div
                      key={groupIdx}
                      className="flex items-center"
                    >
                      {/* Item group with solid background */}
                      <div className="bg-abyss-900 rounded-lg p-1.5 relative z-10">
                        <div className="relative">
                          {groupContent}
                        </div>
                      </div>
                      {/* Connector line through middle of item+timestamp */}
                      {!isLastGroup && (
                        <div className="w-3 h-[1px] bg-gold-light flex-shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </BuildSection>
      
      {/* 2. Core Build & Starter Items - 2 columns */}
      {(() => {
        const startingDetails = pigScoreBreakdown?.startingItemsDetails
        const coreKey = pigScoreBreakdown?.coreKey
        const fallbackInfo = pigScoreBreakdown?.fallbackInfo

        // Get player's final completed items (including boots)
        const finalItems = [
          currentPlayer.item0, currentPlayer.item1, currentPlayer.item2,
          currentPlayer.item3, currentPlayer.item4, currentPlayer.item5
        ].filter(id => id > 0 && isCompletedItemById(id))
        
        // Get core items in PURCHASE ORDER (first 3 completed items, including boots)
        const coreItemIds: number[] = []
        const buildOrderStr = currentPlayer.buildOrder
        if (buildOrderStr) {
          const buildOrderItems = buildOrderStr.split(',').map((id: string) => parseInt(id, 10)).filter((id: number) => !isNaN(id) && id > 0)
          const seen = new Set<number>()
          for (const itemId of buildOrderItems) {
            if (coreItemIds.length >= 3) break
            if (isCompletedItemById(itemId) && finalItems.includes(itemId) && !seen.has(itemId)) {
              coreItemIds.push(itemId)
              seen.add(itemId)
            }
          }
        }
        // Fallback to coreKey if no build order (but coreKey has normalized boot ID 99999)
        if (coreItemIds.length < 3 && coreKey) {
          // coreKey uses 99999 for boots, so we need to find actual boot from final items
          const coreKeyItems = coreKey.split('_').map(id => parseInt(id, 10)).filter(id => !isNaN(id))
          for (const itemId of coreKeyItems) {
            if (itemId === 99999) {
              // find actual boot from final items
              const actualBoot = finalItems.find(id => BOOT_IDS.has(id))
              if (actualBoot) coreItemIds.push(actualBoot)
            } else {
              coreItemIds.push(itemId)
            }
          }
        }

        // Get starter items from timeline (items bought before 1 minute)
        const rawTimeline = (playerDetails?.item_timeline || []) as ItemTimelineEvent[]
        const starterItems = rawTimeline.filter(e => e.timestamp < 60000 && e.action === 'buy')

        return (
          <div className="grid grid-cols-2 divide-x divide-abyss-700 border-t border-abyss-700">
            {/* Core Build */}
            <BuildSection 
              title="Core Build" 
              score={displayPigScores ? pigScoreBreakdown?.buildSubScores?.core : undefined}
              className="p-4"
            >
              {coreItemIds.length > 0 ? (
                <div className="flex flex-col gap-2 h-full">
                  <div className="flex gap-2 items-center">
                    {coreItemIds.map((itemId, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {idx > 0 && <span className="text-gold-light/50 text-sm">→</span>}
                        <Tooltip id={itemId} type="item">
                          <div className="w-9 h-9 rounded overflow-hidden bg-abyss-800 border border-gold-dark/30">
                            <Image
                              src={getItemImageUrl(itemId, ddragonVersion)}
                              alt={`Item ${itemId}`}
                              width={36}
                              height={36}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                  {displayPigScores && pigScoreBreakdown?.coreBuildDetails?.playerWinrate !== undefined && (
                    <div className="text-xs text-text-muted">
                      {pigScoreBreakdown.coreBuildDetails.playerWinrate.toFixed(1)}% WR
                      {pigScoreBreakdown.coreBuildDetails.games && (
                        <span className="text-text-muted/70"> · {pigScoreBreakdown.coreBuildDetails.games} games</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-text-muted text-center">No core data</div>
              )}
            </BuildSection>

            {/* Starter Build */}
            <BuildSection 
              title="Starter Items" 
              score={displayPigScores ? pigScoreBreakdown?.buildSubScores?.starting : undefined}
              rightContent={displayPigScores && fallbackInfo?.starting && (
                <DataWarning warnings={['Using data from a different patch or build because not enough games with this exact build were found.']} />
              )}
              className="p-4"
            >
              {starterItems.length > 0 ? (
                <div className="flex flex-col gap-2 h-full">
                  <div className="flex gap-1.5 items-center">
                    {starterItems.map((item, idx) => (
                      <Tooltip key={idx} id={item.itemId} type="item">
                        <div className="w-9 h-9 rounded overflow-hidden bg-abyss-800 border border-gold-dark/30">
                          <Image
                            src={getItemImageUrl(item.itemId, ddragonVersion)}
                            alt={item.itemName || `Item ${item.itemId}`}
                            width={36}
                            height={36}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                  {startingDetails?.playerWinrate !== undefined && (
                    <div className="text-xs text-text-muted">
                      {startingDetails.playerWinrate.toFixed(1)}% WR
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-text-muted text-center">No starter data</div>
              )}
            </BuildSection>
          </div>
        )
      })()}

      {/* 3. Skill Order & Summoner Spells - 2 columns */}
      <div className="grid grid-cols-2 divide-x divide-abyss-700 border-t border-abyss-700">
        {/* Skill Order */}
        <BuildSection 
          title="Skill Order" 
          score={hasTimelineData ? pigScoreBreakdown?.buildSubScores?.skills : undefined}
          className="p-4"
        >
          {(() => {
            const abilityOrder = playerDetails?.ability_order
            if (!abilityOrder) return <div className="text-xs text-text-muted text-center">No skill order data</div>

            // Convert space-separated to dot-separated for AbilityOrderDisplay
            const formattedOrder = abilityOrder.split(' ').join('.')

            return (
              <div className="">
                <AbilityOrderDisplay abilityOrder={formattedOrder} showFullSequence championName={currentPlayer.championName} />
              </div>
            )
          })()}
        </BuildSection>

        {/* Summoner Spells */}
        <BuildSection 
          title="Summoner Spells" 
          score={hasTimelineData ? pigScoreBreakdown?.buildSubScores?.spells : undefined}
          className="p-4"
        >
          <div className="h-full">
            <SummonerSpellDisplay
              spell1Id={currentPlayer.summoner1Id}
              spell2Id={currentPlayer.summoner2Id}
              ddragonVersion={ddragonVersion}
              size="item"
            />
          </div>
        </BuildSection>
      </div>

      {/* 4. Runes */}
      <div className="border-t border-abyss-700">
        <BuildSection 
          title="Runes" 
          score={hasTimelineData ? pigScoreBreakdown?.buildSubScores?.keystone : undefined}
          rightContent={displayPigScores && pigScoreBreakdown?.fallbackInfo?.keystone && (
            <DataWarning warnings={['Using data from a different patch or build because not enough games with this exact build were found.']} />
          )}
          className="p-4"
        >
          {(() => {
            // Get player's selected runes
            const primaryTreeId = currentPlayer.perks?.styles[0]?.style
            const secondaryTreeId = currentPlayer.perks?.styles[1]?.style
            const selectedRuneIds = new Set<number>()

            // Collect all selected rune IDs
            currentPlayer.perks?.styles[0]?.selections?.forEach(s => selectedRuneIds.add(s.perk))
            currentPlayer.perks?.styles[1]?.selections?.forEach(s => selectedRuneIds.add(s.perk))

            if (!primaryTreeId || !secondaryTreeId) {
              return <div className="text-xs text-text-muted text-center">No rune data available</div>
            }

            return (
              <div className="flex justify-center w-full">
                <RuneDisplay
                  primaryTreeId={primaryTreeId}
                  secondaryTreeId={secondaryTreeId}
                  selectedRuneIds={selectedRuneIds}
                  statPerks={{
                    offense: currentPlayer.perks?.statPerks?.offense,
                    flex: currentPlayer.perks?.statPerks?.flex,
                    defense: currentPlayer.perks?.statPerks?.defense,
                  }}
                  variant="minimal"
                />
              </div>
            )
          })()}
        </BuildSection>
      </div>
    </div>
  )
}
