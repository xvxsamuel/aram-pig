'use client'

import clsx from 'clsx'
import { getChampionImageUrl } from '@/lib/ddragon'
import { getPigScoreColor } from '@/lib/ui'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { SpiderChart } from './SpiderChart'
import {
  TabProps,
  coordToPercent,
  formatTimeSec,
} from './shared'

// Section component with minimal styling (matching BuildTab)
function PerformanceSection({ 
  title, 
  children, 
  className,
  rightContent
}: { 
  title: React.ReactNode
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
      </div>
      <div className={clsx("flex-1", className)}>
        {children}
      </div>
    </div>
  )
}

export function PerformanceTab({
  match,
  currentPlayer,
  currentPuuid,
  ddragonVersion,
  participantDetails,
  pigScoreBreakdown,
  loadingBreakdown,
}: TabProps) {
  if (loadingBreakdown || !pigScoreBreakdown) {
    return (
      <div className="p-4">
        <div className="min-h-[200px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light"></div>
        </div>
      </div>
    )
  }

  // Prepare metrics for SpiderChart using raw stats comparison
  const getChartData = (playerVal: number, avgVal: number, inverse = false) => {
    if (inverse) {
      // For deaths: 0 is best (100%), higher is worse.
      // Baseline is ~0.75 deaths/min. Max reasonable is ~1.5.
      const maxVal = Math.max(playerVal, avgVal, 1.2) * 1.2
      const p = Math.max(0, 100 - (playerVal / maxVal) * 100)
      const a = Math.max(0, 100 - (avgVal / maxVal) * 100)
      return { value: p, baseline: a }
    } else {
      // For others: 0 is worst, higher is better.
      const maxVal = Math.max(playerVal, avgVal) * 1.2
      const p = maxVal > 0 ? (playerVal / maxVal) * 100 : 0
      const a = maxVal > 0 ? (avgVal / maxVal) * 100 : 0
      return { value: p, baseline: a }
    }
  }

  const spiderMetrics = [
    {
      label: 'Damage',
      ...getChartData(
        pigScoreBreakdown.playerStats.damageToChampionsPerMin,
        pigScoreBreakdown.championAvgStats.damageToChampionsPerMin
      )
    },
    {
      label: 'Healing',
      ...getChartData(
        pigScoreBreakdown.playerStats.healingShieldingPerMin,
        pigScoreBreakdown.championAvgStats.healingShieldingPerMin
      )
    },
    {
      label: 'CC',
      ...getChartData(
        pigScoreBreakdown.playerStats.ccTimePerMin,
        pigScoreBreakdown.championAvgStats.ccTimePerMin
      )
    },
    {
      label: 'KP',
      ...getChartData(
        pigScoreBreakdown.playerStats.killParticipation || 0,
        0.5 // Assume 50% avg KP for ARAM
      )
    },
    {
      label: 'Survival',
      ...getChartData(
        pigScoreBreakdown.playerStats.deathsPerMin,
        0.75, // Assume 0.75 avg deaths/min for ARAM
        true
      )
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Top Row: Analysis & Stats */}
      <PerformanceSection 
        title="Performance Analysis"
        className="p-4"
        rightContent={
          <div className="flex items-center gap-2 text-xs text-text-muted font-normal normal-case tracking-normal">
            <span>Based on {pigScoreBreakdown.totalGames.toLocaleString()} games</span>
            
            {(() => {
              const warnings: string[] = []
              if (pigScoreBreakdown.usedFallbackPatch) {
                warnings.push("Using data from older patches due to low sample size")
              }
              if (!pigScoreBreakdown.usedCoreStats) {
                warnings.push("Using champion-wide data due to low sample size for this build")
              } else if (pigScoreBreakdown.usedFallbackCore) {
                warnings.push("Using data from a similar core build due to low sample size")
              }

              if (warnings.length === 0) return null

              const isGoldWarning = pigScoreBreakdown.usedFallbackPatch || !pigScoreBreakdown.usedCoreStats

              return (
                <SimpleTooltip content={
                  <div className="flex flex-col gap-1">
                    {warnings.map((w, i) => (
                      <span key={i} className="text-xs text-white">{w}</span>
                    ))}
                  </div>
                }>
                  <div className={clsx("cursor-help", isGoldWarning ? "text-gold-light" : "text-blue-400")}>
                    {isGoldWarning ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </SimpleTooltip>
              )
            })()}
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Spider Chart & Scores */}
          <div>
            <div className="flex justify-center py-2">
              <SpiderChart data={spiderMetrics} size={220} />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <div className="text-center p-2 bg-abyss-800/50 rounded border border-gold-dark/10">
                <div className="text-[10px] text-text-muted uppercase">Performance</div>
                <div className={clsx(
                  'text-lg font-bold',
                  pigScoreBreakdown.componentScores.performance >= 70 ? 'text-accent-light' : 'text-text-primary'
                )}>
                  {pigScoreBreakdown.componentScores.performance}
                </div>
              </div>
              <div className="text-center p-2 bg-abyss-800/50 rounded border border-gold-dark/10">
                <div className="text-[10px] text-text-muted uppercase">Timeline</div>
                <div className={clsx(
                  'text-lg font-bold',
                  pigScoreBreakdown.componentScores.timeline >= 70 ? 'text-accent-light' : 'text-text-primary'
                )}>
                  {pigScoreBreakdown.componentScores.timeline}
                </div>
              </div>
              <div className="text-center p-2 bg-abyss-800/50 rounded border border-gold-dark/10">
                <div className="text-[10px] text-text-muted uppercase">KDA</div>
                <div className={clsx(
                  'text-lg font-bold',
                  pigScoreBreakdown.componentScores.kda >= 70 ? 'text-accent-light' : 'text-text-primary'
                )}>
                  {pigScoreBreakdown.componentScores.kda}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Stats List */}
          <div className="flex flex-col justify-center">
            <div className="space-y-3">
              {[
                {
                  label: 'Damage/min',
                  value: pigScoreBreakdown.playerStats.damageToChampionsPerMin,
                  avg: pigScoreBreakdown.championAvgStats.damageToChampionsPerMin,
                  metric: 'Damage to Champions'
                },
                {
                  label: 'Healing/min',
                  value: pigScoreBreakdown.playerStats.healingShieldingPerMin,
                  avg: pigScoreBreakdown.championAvgStats.healingShieldingPerMin,
                  metric: 'Healing/Shielding'
                },
                {
                  label: 'CC Time/min',
                  value: pigScoreBreakdown.playerStats.ccTimePerMin,
                  avg: pigScoreBreakdown.championAvgStats.ccTimePerMin,
                  metric: 'CC Time',
                  suffix: 's'
                },
                {
                  label: 'Deaths/min',
                  value: pigScoreBreakdown.playerStats.deathsPerMin,
                  avg: 0.6, // optimal
                  metric: 'Deaths',
                  inverse: true
                }
              ].map((stat, idx) => {
                const m = pigScoreBreakdown.metrics.find(m => m.name === stat.metric)
                const score = m?.score || 0
                const isGood = score >= 85
                const isBad = score < 50
                
                return (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{stat.label}</span>
                    <div className="text-right">
                      <div className="font-medium tabular-nums text-white">
                        {stat.value.toFixed(1)}{stat.suffix}
                        <span className="text-xs text-text-muted mx-1">vs</span>
                        {stat.avg.toFixed(1)}{stat.suffix}
                      </div>
                      <div className={clsx(
                        'text-xs',
                        isGood ? 'text-accent-light' : isBad ? 'text-negative' : 'text-gold-light'
                      )}>
                        {isGood ? 'Excellent' : isBad ? 'Below Avg' : 'Average'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </PerformanceSection>

      {/* Bottom Row: Kill/Death Timeline */}
      {(() => {
        const details = participantDetails.get(currentPuuid)
        const timeline = details?.kill_death_timeline
        const gameDurationSec = match.info.gameDuration

        if (!timeline || (timeline.takedowns.length === 0 && timeline.deaths.length === 0)) {
          return null
        }

        // combine all events into a sorted timeline (including towers)
        const events: Array<{
          type: 'takedown' | 'death' | 'tower'
          t: number
          gold?: number
          wasKill?: boolean
          pos?: number
          value?: number
          x?: number
          y?: number
          team?: 'ally' | 'enemy'
          wasTrade?: boolean
          tradeKills?: number
          zone?: string
        }> = [
          ...timeline.takedowns.map(k => ({ type: 'takedown' as const, ...k })),
          ...timeline.deaths.map(d => ({ type: 'death' as const, ...d })),
          ...(timeline.towers || []).map(t => ({ type: 'tower' as const, ...t })),
        ].sort((a, b) => a.t - b.t)

        return (
          <div className="border-t border-abyss-700">
            <PerformanceSection 
              title="Kill/Death Timeline"
              className="p-4"
              rightContent={
                <div className="flex gap-3 text-xs font-normal normal-case tracking-normal">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-accent-light"></span>
                    <span className="text-text-muted">{timeline.takedowns.length} K/A</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-negative"></span>
                    <span className="text-text-muted">{timeline.deaths.length} D</span>
                  </span>
                </div>
              }
            >
              {/* Visual Timeline Bar */}
              <div className="relative h-8 bg-abyss-800 rounded-lg mb-4 overflow-visible">
                {/* Minute markers */}
                {(() => {
                  const gameMins = Math.ceil(gameDurationSec / 60)
                  const markers: React.ReactNode[] = []
                  for (let min = 0; min <= gameMins; min++) {
                    const pct = ((min * 60) / gameDurationSec) * 100
                    if (pct > 100) continue
                    const isMajor = min % 5 === 0
                    markers.push(
                      <div
                        key={min}
                        className={clsx(
                          'absolute',
                          isMajor
                            ? 'h-full border-l border-abyss-500'
                            : 'h-2/3 top-1/2 -translate-y-1/2 border-l border-abyss-600/50'
                        )}
                        style={{ left: `${pct}%` }}
                      >
                        {isMajor && (
                          <span className="absolute -bottom-4 left-0 -translate-x-1/2 text-[9px] text-text-muted tabular-nums">
                            {min}m
                          </span>
                        )}
                      </div>
                    )
                  }
                  return markers
                })()}

                {/* Event markers */}
                {events.map((event, idx) => {
                  const leftPct = (event.t / gameDurationSec) * 100
                  const isTower = event.type === 'tower'
                  const isTakedown = event.type === 'takedown'
                  const isKill = isTakedown && event.wasKill
                  const eventLabel = isTower
                    ? event.team === 'enemy' ? 'Tower Destroyed' : 'Tower Lost'
                    : isTakedown ? (isKill ? 'Kill' : 'Assist') : 'Death'

                  const hasPosition = event.x !== undefined && event.y !== undefined
                  const mapPos = hasPosition ? coordToPercent(event.x!, event.y!) : null

                  return (
                    <div
                      key={`${event.type}-${idx}`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                      style={{ left: `${leftPct}%` }}
                    >
                      <SimpleTooltip
                        content={
                          <div className="text-xs">
                            {hasPosition && (
                              <div className="relative w-[120px] h-[120px] mb-2 rounded overflow-hidden border border-abyss-600">
                                <img
                                  src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/map/map12.png`}
                                  alt="ARAM Map"
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                                {mapPos && (
                                  <div
                                    className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left: `${mapPos.x}%`,
                                      top: `${100 - mapPos.y}%`,
                                    }}
                                  >
                                    {isTower ? (
                                      <div className={clsx(
                                        'w-3 h-3 rotate-45 border',
                                        event.team === 'enemy' ? 'bg-accent-light/90 border-white' : 'bg-negative/90 border-white'
                                      )} />
                                    ) : (
                                      <div className={clsx(
                                        'w-5 h-5 rounded-full border-[1.5px] overflow-hidden',
                                        isTakedown ? 'border-accent-light' : 'border-negative',
                                        event.wasTrade && 'ring-1 ring-accent-light'
                                      )}>
                                        <img
                                          src={getChampionImageUrl(currentPlayer?.championName || '', ddragonVersion)}
                                          alt={currentPlayer?.championName}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="min-w-[120px]">
                              <div className={clsx(
                                'font-semibold mb-1.5',
                                isTower ? (event.team === 'enemy' ? 'text-accent-light' : 'text-negative')
                                  : isTakedown ? 'text-accent-light' : 'text-negative'
                              )}>
                                {eventLabel} at {formatTimeSec(event.t)}
                              </div>
                              {!isTower && (
                                <div className="space-y-0.5">
                                  {event.gold !== undefined && event.gold > 0 && (
                                    <div className="text-text-muted flex justify-between">
                                      <span>{isTakedown ? 'Victim gold:' : 'Gold spent:'}</span>
                                      <span className="text-gold-light">{event.gold.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {event.pos !== undefined && (
                                    <div className="text-text-muted flex justify-between">
                                      <span>Position:</span>
                                      <span className={clsx(
                                        event.pos >= 60 ? 'text-accent-light' : event.pos <= 40 ? 'text-negative' : 'text-text-muted'
                                      )}>
                                        {event.pos >= 60 ? 'Aggressive' : event.pos <= 40 ? 'Passive' : 'Neutral'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        }
                      >
                        {isTower ? (
                          <div className={clsx(
                            'w-2 h-2 rotate-45 cursor-pointer transition-transform hover:scale-150',
                            event.team === 'enemy' ? 'bg-accent-light border border-accent-light/50' : 'bg-negative border border-negative/50'
                          )} />
                        ) : (
                          <div className={clsx(
                            'w-2 h-2 rounded-full cursor-pointer transition-transform hover:scale-150',
                            isTakedown ? 'bg-accent-light' : 'bg-negative',
                            event.wasTrade && 'ring-1 ring-accent-light/50'
                          )} />
                        )}
                      </SimpleTooltip>
                    </div>
                  )
                })}
              </div>

              {/* Event List */}
              <div className="space-y-1.5 mt-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {events.map((event, idx) => {
                  const isTower = event.type === 'tower'
                  const isTakedown = event.type === 'takedown'
                  const isKill = isTakedown && event.wasKill
                  const pos = event.pos
                  const eventLabel = isTower
                    ? event.team === 'enemy' ? 'Tower Destroyed' : 'Tower Lost'
                    : isTakedown ? (isKill ? 'Kill' : 'Assist') : 'Death'
                  
                  return (
                    <div key={`list-${event.type}-${idx}`} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-abyss-800/50 transition-colors">
                      <span className="text-text-muted w-10 text-right tabular-nums flex-shrink-0">
                        {formatTimeSec(event.t)}
                      </span>
                      <div className="flex items-center justify-center w-4 flex-shrink-0">
                        {isTower ? (
                          <span className={clsx(
                            'w-1.5 h-1.5 rotate-45',
                            event.team === 'enemy' ? 'bg-accent-light' : 'bg-negative'
                          )} />
                        ) : (
                          <span className={clsx(
                            'w-1.5 h-1.5 rounded-full',
                            isTakedown ? 'bg-accent-light' : 'bg-negative'
                          )} />
                        )}
                      </div>
                      <span className={clsx(
                        'font-medium flex-1 truncate',
                        isTower ? (event.team === 'enemy' ? 'text-accent-light' : 'text-negative')
                          : isTakedown ? 'text-accent-light' : 'text-negative'
                      )}>
                        {eventLabel}
                      </span>
                      {!isTower && event.gold !== undefined && event.gold > 0 && (
                        <span className="text-gold-light tabular-nums flex-shrink-0">
                          {event.gold.toLocaleString()}g
                        </span>
                      )}
                      {!isTower && pos !== undefined && (
                        <span className={clsx(
                          'px-1.5 py-0.5 text-[10px] rounded flex-shrink-0 w-10 text-center',
                          pos >= 60 ? 'bg-accent-light/20 text-accent-light' : pos <= 40 ? 'bg-negative/20 text-negative' : 'bg-abyss-600/50 text-text-muted'
                        )}>
                          {pos >= 60 ? 'AGG' : pos <= 40 ? 'PAS' : 'NEU'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </PerformanceSection>
          </div>
        )
      })()}
    </div>
  )
}
