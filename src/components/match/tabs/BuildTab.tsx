'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { getItemImageUrl } from '@/lib/ddragon'
import { getPigScoreColor } from '@/lib/ui'
import Tooltip from '@/components/ui/Tooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import runesData from '@/data/runes.json'
import summonerSpellsData from '@/data/summoner-spells.json'
import {
  TabProps,
  ItemTimelineEvent,
  isCompletedItemById,
  formatTime,
  BOOT_IDS,
} from './shared'

// animated glow component for scored items with pig score color
function ScoredItemGlow({ 
  children, 
  score 
}: { 
  children: React.ReactNode
  score?: number 
}) {
  const [isHovered, setIsHovered] = useState(false)
  const glowColor = score !== undefined ? getPigScoreColor(score) : 'var(--color-gold-light)'
  
  return (
    <motion.div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="absolute -inset-1 rounded-lg"
        animate={{
          boxShadow: isHovered 
            ? `0 0 12px 3px ${glowColor}60, 0 0 20px 6px ${glowColor}30`
            : `0 0 6px 1px ${glowColor}30, 0 0 10px 2px ${glowColor}15`
        }}
        transition={{ duration: 0.2 }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  )
}

// fallback warning indicator
function FallbackWarning() {
  return (
    <SimpleTooltip
      content={
        <div className="text-xs max-w-[200px]">
          Using data from a different patch or build because not enough games with this exact build were found.
        </div>
      }
    >
      <span className="text-gold-light ml-1 cursor-help">⚠</span>
    </SimpleTooltip>
  )
}

// PIG label component for category scores
function PigLabel({ score }: { score: number | undefined }) {
  if (score === undefined) return null
  return (
    <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full inline-flex">
      <div className="bg-abyss-700 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none flex items-center gap-0.5">
        <span style={{ color: getPigScoreColor(score) }}>{score}</span>
        <span className="text-white">PIG</span>
      </div>
    </div>
  )
}

export function BuildTab({
  currentPlayer,
  ddragonVersion,
  participantDetails,
  pigScoreBreakdown,
}: TabProps) {
  if (!currentPlayer) return null

  // Calculate overall build score from sub-scores with new weights:
  // starter 5%, skills 5%, runes 10%, spells 5%, core 45%, items 30%
  const buildSubScores = pigScoreBreakdown?.buildSubScores
  const overallBuildScore = buildSubScores ? Math.round(
    (buildSubScores.starting ?? 50) * 0.05 +
    (buildSubScores.skills ?? 50) * 0.05 +
    (buildSubScores.keystone ?? 50) * 0.10 +
    (buildSubScores.spells ?? 50) * 0.05 +
    (buildSubScores.core ?? 50) * 0.45 +
    (buildSubScores.items ?? 50) * 0.30
  ) : null

  return (
    <div className="p-4 space-y-5">
      {/* Overall Build Rating - top right */}
      {overallBuildScore !== null && (
        <div className="flex justify-end mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Overall Build</span>
            <PigLabel score={overallBuildScore} />
          </div>
        </div>
      )}
      
      {/* Core Build & Starter Items - 2 columns */}
      {(() => {
        const details = participantDetails.get(currentPlayer.puuid)
        if (!details || details.loading) {
          return (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <div className="w-4 h-4 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
              Loading...
            </div>
          )
        }

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

        // Get starter items from timeline (items bought before 30s)
        const playerDetails = participantDetails.get(currentPlayer.puuid)
        const rawTimeline = (playerDetails?.item_timeline || []) as ItemTimelineEvent[]
        const starterItems = rawTimeline.filter(e => e.timestamp < 30000 && e.action === 'buy')

        return (
          <div className="grid grid-cols-2 gap-4">
            {/* Starter Build */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-text-muted">
                  Starter Items
                  {fallbackInfo?.starting && <FallbackWarning />}
                </h3>
                <PigLabel score={pigScoreBreakdown?.buildSubScores?.starting} />
              </div>
              {starterItems.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1 items-center">
                    {starterItems.map((item, idx) => (
                      <Tooltip key={idx} id={item.itemId} type="item">
                        <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800 border border-gold-dark/30">
                          <Image
                            src={getItemImageUrl(item.itemId, ddragonVersion)}
                            alt={item.itemName || `Item ${item.itemId}`}
                            width={32}
                            height={32}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                  {startingDetails?.playerWinrate !== undefined && (
                    <div className="text-[10px] text-text-muted">
                      {startingDetails.playerWinrate.toFixed(1)}% WR
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-text-muted">No starter data</div>
              )}
            </div>

            {/* Core Build */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-text-muted">Core Build</h3>
                <PigLabel score={pigScoreBreakdown?.buildSubScores?.core} />
              </div>
              {coreItemIds.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1.5 items-center">
                    {coreItemIds.map((itemId, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        {idx > 0 && <span className="text-gold-light/50 text-xs">→</span>}
                        <Tooltip id={itemId} type="item">
                          <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800 border border-gold-dark/30">
                            <Image
                              src={getItemImageUrl(itemId, ddragonVersion)}
                              alt={`Item ${itemId}`}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                  {pigScoreBreakdown?.coreBuildDetails?.playerWinrate !== undefined && (
                    <div className="text-[10px] text-text-muted">
                      {pigScoreBreakdown.coreBuildDetails.playerWinrate.toFixed(1)}% WR
                      {pigScoreBreakdown.coreBuildDetails.games && (
                        <span className="text-text-muted/70"> · {pigScoreBreakdown.coreBuildDetails.games} games</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-text-muted">No core data</div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Items Timeline */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-medium text-text-muted">
            Items
            {pigScoreBreakdown?.fallbackInfo?.items && <FallbackWarning />}
          </h3>
          <PigLabel score={pigScoreBreakdown?.buildSubScores?.items} />
        </div>
        {(() => {
          const details = participantDetails.get(currentPlayer.puuid)
          // Show loading if details not fetched yet or still loading
          if (!details || details.loading) {
            return (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <div className="w-4 h-4 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
                Loading...
              </div>
            )
          }

          // Get timeline and deduplicate by timestamp+itemId+action
          const rawTimeline = (details.item_timeline || []) as ItemTimelineEvent[]
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
                              <div className="bg-abyss-700 rounded-full px-2 py-1 text-xs font-bold leading-none flex items-center gap-1 border border-gold-dark/40">
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
                          <div className="w-7 h-7 rounded overflow-hidden bg-abyss-800 relative">
                            <Tooltip id={itemId} type="item">
                              <Image
                                src={getItemImageUrl(itemId, ddragonVersion)}
                                alt={`Item ${itemId}`}
                                width={28}
                                height={28}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </Tooltip>
                          </div>
                        </ScoredItemGlow>
                      ) : (
                        <div className="w-7 h-7 rounded overflow-hidden bg-abyss-800 relative border border-gold-dark/50">
                          <Tooltip id={itemId} type="item">
                            <Image
                              src={getItemImageUrl(itemId, ddragonVersion)}
                              alt={`Item ${itemId}`}
                              width={28}
                              height={28}
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
                          <div key={idx} className="flex flex-col items-center gap-0.5">
                            <SimpleTooltip
                              content={
                                <div className="text-xs">
                                  <div className="font-medium text-white">{event.itemName}</div>
                                  <div className="text-text-muted">
                                    {isSell ? 'Sold' : 'Bought'} at {formatTime(event.timestamp)}
                                  </div>
                                  {isStarterItem && starterScore !== undefined && (
                                    <div className="mt-2 flex justify-center">
                                      <div className="bg-abyss-700 rounded-full px-2 py-1 text-xs font-bold leading-none flex items-center gap-1 border border-gold-dark/40">
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
                                      <div className="bg-abyss-700 rounded-full px-2 py-1 text-xs font-bold leading-none flex items-center gap-1 border border-gold-dark/40">
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
                                  <div className="w-7 h-7 rounded overflow-hidden bg-abyss-800 relative">
                                    <Image
                                      src={getItemImageUrl(event.itemId, ddragonVersion)}
                                      alt={event.itemName || `Item ${event.itemId}`}
                                      width={28}
                                      height={28}
                                      className="w-full h-full object-cover"
                                      unoptimized
                                    />
                                  </div>
                                </ScoredItemGlow>
                              ) : (
                                <div
                                  className={clsx(
                                    'w-7 h-7 rounded overflow-hidden bg-abyss-800 relative border border-gold-dark/50',
                                    isSell && 'opacity-50'
                                  )}
                                >
                                  <Image
                                    src={getItemImageUrl(event.itemId, ddragonVersion)}
                                    alt={event.itemName || `Item ${event.itemId}`}
                                    width={28}
                                    height={28}
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
                      className="flex items-start"
                    >
                      {/* Item group with gold line through center of items */}
                      <div className="bg-abyss-900 rounded-lg p-1.5 relative z-10">
                        {/* Gold timeline line through center of items (item is 28px, padding 6px, so center is at 6 + 14 = 20px, but items have glow so ~17px works) */}
                        <div 
                          className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-gold-dark/60 via-gold-light/80 to-gold-dark/60 rounded-full pointer-events-none"
                          style={{ top: '17px' }}
                        />
                        <div className="relative z-10">
                          {groupContent}
                        </div>
                      </div>
                      {/* Connector line to next group */}
                      {!isLastGroup && (
                        <div className="w-3 h-[3px] bg-gradient-to-r from-gold-light/60 to-gold-dark/40 flex-shrink-0" style={{ marginTop: '23px' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Skill Order - only show if we have ability order data */}
      {(() => {
        const details = participantDetails.get(currentPlayer.puuid)
        const abilityOrder = details?.ability_order
        if (!abilityOrder || details?.loading) return null

        const abilities = abilityOrder.split(' ')

        // determine skill max order (Q, W, E first maxed)
        const counts = { Q: 0, W: 0, E: 0 }
        const maxOrder: string[] = []
        for (const ability of abilities) {
          if (ability === 'R') continue
          if (ability in counts) {
            counts[ability as keyof typeof counts]++
            // maxed at 5 points
            if (counts[ability as keyof typeof counts] === 5 && !maxOrder.includes(ability)) {
              maxOrder.push(ability)
            }
          }
        }
        // add any abilities not yet maxed (in order of most points)
        const remaining = ['Q', 'W', 'E'].filter(a => !maxOrder.includes(a))
        remaining.sort((a, b) => counts[b as keyof typeof counts] - counts[a as keyof typeof counts])
        maxOrder.push(...remaining)

        const abilityTextColors: Record<string, string> = {
          Q: 'text-kda-3',
          W: 'text-kda-4',
          E: 'text-kda-5',
        }

        return (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xs font-medium text-text-muted">Skill Order</h3>
              <PigLabel score={pigScoreBreakdown?.buildSubScores?.skills} />
            </div>
            <div className="space-y-3">
              {/* Max order display */}
              <div className="flex items-center gap-2">
                {maxOrder.map((ability, idx) => (
                  <div key={ability} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="text-text-muted text-sm">&gt;</span>}
                    <div
                      className={clsx(
                        'w-7 h-7 rounded border bg-abyss-800 flex items-center justify-center text-xs font-bold',
                        ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                        abilityTextColors[ability]
                      )}
                    >
                      {ability === 'R' ? <h2 className="text-xs">{ability}</h2> : ability}
                    </div>
                  </div>
                ))}
              </div>

              {/* full sequence */}
              <div className="flex flex-wrap gap-1">
                {abilities.map((ability, idx) => (
                  <div
                    key={idx}
                    className={clsx(
                      'w-6 h-6 rounded border bg-abyss-800 text-[12px] font-bold flex items-center justify-center',
                      ability === 'R' ? 'border-gold-light' : 'border-gold-dark',
                      abilityTextColors[ability]
                    )}
                  >
                    {ability === 'R' ? <h2 className="text-[12px]">{ability}</h2> : ability}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Runes */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-medium text-text-muted">
            Runes
            {pigScoreBreakdown?.fallbackInfo?.keystone && <FallbackWarning />}
          </h3>
          <PigLabel score={pigScoreBreakdown?.buildSubScores?.keystone} />
        </div>
        <div className="flex gap-8">
          {/* Primary Tree */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {(() => {
                const treeId = currentPlayer.perks?.styles[0]?.style
                const treeInfo = treeId ? (runesData as Record<string, { icon?: string; name?: string }>)[String(treeId)] : null
                return (
                  <>
                    {treeInfo?.icon && (
                      <div className="w-6 h-6 rounded-full overflow-hidden">
                        <Image
                          src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                          alt={treeInfo.name || 'Primary'}
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                    <span className="text-[10px] text-gold-light font-medium">
                      {treeInfo?.name || 'Primary'}
                    </span>
                  </>
                )
              })()}
            </div>
            <div className="flex gap-2">
              {/* Keystone */}
              {(() => {
                const runeId = currentPlayer.perks?.styles[0]?.selections[0]?.perk
                const runeInfo = runeId ? (runesData as Record<string, { icon?: string; name?: string }>)[String(runeId)] : null
                return runeInfo?.icon ? (
                  <Tooltip id={runeId!} type="rune">
                    <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-gold-light bg-abyss-800">
                      <Image
                        src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                        alt={runeInfo.name || 'Keystone'}
                        width={44}
                        height={44}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </Tooltip>
                ) : null
              })()}
              {/* Other primary runes */}
              {[1, 2, 3].map(idx => {
                const runeId = currentPlayer.perks?.styles[0]?.selections[idx]?.perk
                const runeInfo = runeId ? (runesData as Record<string, { icon?: string; name?: string }>)[String(runeId)] : null
                return runeInfo?.icon ? (
                  <Tooltip key={idx} id={runeId!} type="rune">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-gold-dark bg-abyss-800">
                      <Image
                        src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                        alt={runeInfo.name || 'Rune'}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </Tooltip>
                ) : null
              })}
            </div>
          </div>

          {/* Secondary Tree */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {(() => {
                const treeId = currentPlayer.perks?.styles[1]?.style
                const treeInfo = treeId ? (runesData as Record<string, { icon?: string; name?: string }>)[String(treeId)] : null
                return (
                  <>
                    {treeInfo?.icon && (
                      <div className="w-6 h-6 rounded-full overflow-hidden">
                        <Image
                          src={`https://ddragon.leagueoflegends.com/cdn/img/${treeInfo.icon}`}
                          alt={treeInfo.name || 'Secondary'}
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                    <span className="text-[10px] text-text-muted font-medium">
                      {treeInfo?.name || 'Secondary'}
                    </span>
                  </>
                )
              })()}
            </div>
            <div className="flex gap-2">
              {[0, 1].map(idx => {
                const runeId = currentPlayer.perks?.styles[1]?.selections[idx]?.perk
                const runeInfo = runeId ? (runesData as Record<string, { icon?: string; name?: string }>)[String(runeId)] : null
                return runeInfo?.icon ? (
                  <Tooltip key={idx} id={runeId!} type="rune">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-gold-dark bg-abyss-800">
                      <Image
                        src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                        alt={runeInfo.name || 'Rune'}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </Tooltip>
                ) : null
              })}
            </div>
          </div>

          {/* Stat Shards */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-text-muted font-medium">Shards</span>
            </div>
            <div className="flex gap-1.5">
              {[
                currentPlayer.perks?.statPerks?.offense,
                currentPlayer.perks?.statPerks?.flex,
                currentPlayer.perks?.statPerks?.defense,
              ].map((shardId, idx) => (
                <div
                  key={idx}
                  className="w-6 h-6 rounded-full bg-abyss-800 border border-gold-dark/50 flex items-center justify-center"
                >
                  <span className="text-[9px] text-text-muted font-medium">+</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summoner Spells */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-medium text-text-muted">Summoner Spells</h3>
          <PigLabel score={pigScoreBreakdown?.buildSubScores?.spells} />
        </div>
        <div className="flex gap-2">
          {[currentPlayer.summoner1Id, currentPlayer.summoner2Id].map((spellId, idx) => {
            const spellInfo = spellId ? (summonerSpellsData as Record<string, { name?: string; iconPath?: string }>)[String(spellId)] : null
            const iconUrl = spellInfo?.iconPath
              ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${spellInfo.iconPath.toLowerCase()}`
              : null
            return (
              <SimpleTooltip
                key={idx}
                content={
                  <div className="text-xs">
                    <div className="font-medium text-white">{spellInfo?.name || 'Unknown Spell'}</div>
                  </div>
                }
              >
                <div className="w-10 h-10 rounded border-2 border-gold-dark bg-abyss-800 overflow-hidden">
                  {iconUrl ? (
                    <Image
                      src={iconUrl}
                      alt={spellInfo?.name || 'Spell'}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                      ?
                    </div>
                  )}
                </div>
              </SimpleTooltip>
            )
          })}
        </div>
      </div>
    </div>
  )
}
