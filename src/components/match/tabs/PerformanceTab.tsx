'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { getChampionImageUrl } from '@/lib/ddragon'
import { getPigScoreColor } from '@/lib/ui'
import { calculateMatchLabels } from '@/lib/scoring/labels'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { LabelBadge } from '@/components/ui/Badge'
import { SpiderChart } from './SpiderChart'
import DataWarning from '@/components/ui/DataWarning'
import {
  TabProps,
  coordToPercent,
  formatTimeSec,
} from './shared'

// section component with minimal styling (matching BuildTab)
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

// timeline event type
type TimelineEvent = {
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
  tf?: boolean
  isBad?: boolean // for deaths
}

// separate component for timeline section with state
function TimelineSection({
  events,
  gameDurationSec,
  ddragonVersion,
  currentPlayer,
  takedownCount,
  deathCount,
}: {
  events: TimelineEvent[]
  gameDurationSec: number
  ddragonVersion: string
  currentPlayer: any
  takedownCount: number
  deathCount: number
}) {
  const [selectedEventIdx, setSelectedEventIdx] = useState<number | null>(null)
  const selectedEvent = selectedEventIdx !== null ? events[selectedEventIdx] : null

  const getEventLabel = (event: TimelineEvent) => {
    if (event.type === 'tower') {
      return event.team === 'enemy' ? 'Tower Destroyed' : 'Tower Lost'
    }
    if (event.type === 'takedown') {
      return event.wasKill ? 'Kill' : 'Assist'
    }
    return 'Death'
  }

  return (
    <div className="border-t border-abyss-700">
      <PerformanceSection 
        title="Kill/Death Timeline"
        className="p-4 bg-abyss-800"
        rightContent={
          <div className="flex gap-3 text-xs font-normal normal-case tracking-normal">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-light"></span>
              <span className="text-text-muted">{takedownCount} K/A</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-negative"></span>
              <span className="text-text-muted">{deathCount} D</span>
            </span>
          </div>
        }
      >
        {/* ARAM Map Display - only shows selected event position */}
        <div className="relative w-full aspect-square max-w-[360px] mx-auto rounded-lg mb-4 overflow-hidden p-[2px] bg-gradient-to-b from-gold-light to-gold-dark">
          <div className="relative w-full h-full rounded-md overflow-hidden">
          {/* ARAM minimap image */}
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/map/map12.png`}
            alt="ARAM Map"
            className={clsx(
              'w-full h-full object-cover transition-all duration-300',
              !selectedEvent && 'grayscale-[80%] brightness-[0.4]'
            )}
            draggable={false}
          />
          {/* Dark blue overlay when no event selected */}
          {!selectedEvent && (
            <div className="absolute inset-0 bg-abyss-900/60 pointer-events-none" />
          )}
          
          {/* Selected event marker on map */}
          {selectedEvent && selectedEvent.x !== undefined && selectedEvent.y !== undefined && (() => {
            const pos = coordToPercent(selectedEvent.x, selectedEvent.y)
            const isTower = selectedEvent.type === 'tower'
            
            return (
              <div
                className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10 transition-all duration-200"
                style={{ 
                  left: `${pos.x}%`, 
                  top: `${100 - pos.y}%`,
                }}
              >
                {isTower ? (
                  <div className="w-8 h-8 rotate-45 p-[2px] bg-gradient-to-b from-gold-light to-gold-dark shadow-lg">
                    <div className={clsx(
                      'w-full h-full relative',
                      selectedEvent.team === 'enemy' ? 'bg-accent-light' : 'bg-negative'
                    )}>
                      <div className="absolute inset-0 shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.7)] pointer-events-none" />
                    </div>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-b from-gold-light to-gold-dark shadow-lg">
                    <div className={clsx(
                      'w-full h-full rounded-full overflow-hidden relative',
                      selectedEvent.wasTrade && 'ring-2 ring-accent-light'
                    )}>
                      <img
                        src={getChampionImageUrl(currentPlayer?.championName || '', ddragonVersion)}
                        alt={currentPlayer?.championName}
                        className="w-full h-full object-cover scale-125"
                      />
                      <div className="absolute inset-0 rounded-full shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          </div>
        </div>

        {/* Event Info - always visible */}
        <div className={clsx(
          "-mx-4 px-4 py-4 border-t min-h-[100px]",
          selectedEvent?.type === 'death' && selectedEvent?.isBad 
            ? "bg-negative-dark/20 border-negative/50"
            : "bg-abyss-700 border-abyss-700"
        )}>
          {selectedEvent ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-3 h-3',
                    selectedEvent.type === 'tower' ? 'rotate-45' : 'rounded-full',
                    selectedEvent.type === 'tower' 
                      ? (selectedEvent.team === 'enemy' ? 'bg-accent-light' : 'bg-negative')
                      : selectedEvent.type === 'takedown' ? 'bg-accent-light' : 'bg-negative'
                  )} />
                <span className={clsx(
                  'font-semibold text-sm',
                  selectedEvent.type === 'death' && selectedEvent.isBad && 'text-negative',
                  selectedEvent.type === 'tower' && (selectedEvent.team === 'enemy' ? 'text-accent-light' : 'text-negative'),
                  selectedEvent.type === 'takedown' && 'text-accent-light',
                  selectedEvent.type === 'death' && !selectedEvent.isBad && 'text-white'
                )}>
                  {selectedEvent.type === 'death' && selectedEvent.isBad ? 'Bad Death' : getEventLabel(selectedEvent)}
                </span>
                <span className="text-text-muted text-sm">at {formatTimeSec(selectedEvent.t)}</span>
              </div>
              <button
                onClick={() => setSelectedEventIdx(null)}
                className="text-text-muted hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            
            {/* Event details */}
            {selectedEvent.type !== 'tower' && (
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                {selectedEvent.gold !== undefined && selectedEvent.gold > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">{selectedEvent.type === 'takedown' ? 'Victim gold:' : 'Gold spent:'}</span>
                    <span className="text-gold-light font-medium">{selectedEvent.gold.toLocaleString()}</span>
                  </div>
                )}
                {selectedEvent.pos !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Zone:</span>
                    <span className={clsx(
                      'font-medium',
                      selectedEvent.pos >= 60 ? 'text-accent-light' : selectedEvent.pos <= 40 ? 'text-negative' : 'text-text-primary'
                    )}>
                      {selectedEvent.pos >= 60 ? 'Aggressive' : selectedEvent.pos <= 40 ? 'Passive' : 'Neutral'}
                    </span>
                  </div>
                )}
                {selectedEvent.type === 'death' && (
                  <>
                    {selectedEvent.tf && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-muted">Context:</span>
                        <span className="text-text-primary font-medium">Teamfight</span>
                      </div>
                    )}
                    {selectedEvent.tradeKills !== undefined && selectedEvent.tradeKills > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-muted">Trade kills:</span>
                        <span className="text-accent-light font-medium">{selectedEvent.tradeKills}</span>
                      </div>
                    )}
                    {!selectedEvent.isBad && (
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-accent-dark/30 border border-accent-light/30 rounded text-accent-light text-xs font-medium uppercase">
                          Acceptable
                        </span>
                      </div>
                    )}
                  </>
                )}
                {selectedEvent.type === 'takedown' && selectedEvent.value !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">Value:</span>
                    <span className={clsx(
                      'font-medium',
                      selectedEvent.value >= 70 ? 'text-accent-light' : selectedEvent.value <= 40 ? 'text-negative' : 'text-text-primary'
                    )}>
                      {selectedEvent.value >= 70 ? 'High' : selectedEvent.value <= 40 ? 'Low' : 'Average'}
                    </span>
                  </div>
                )}
              </div>
            )}
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-full text-text-muted text-sm">
              Select an event from the timeline
            </div>
          )}
        </div>

        {/* Visual Timeline Bar */}
        <div className="relative h-8 bg-gold-light/10 border border-gold-light/50 rounded-lg overflow-visible mb-6">
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
                      ? 'h-full border-l border-gold-light/40'
                      : 'h-2/3 top-1/2 -translate-y-1/2 border-l border-gold-light/20'
                  )}
                  style={{ left: `${pct}%` }}
                >
                  {isMajor && (
                    <span className="absolute -bottom-5 left-0 -translate-x-1/2 text-[10px] text-text-muted tabular-nums">
                      {min}m
                    </span>
                  )}
                </div>
              )
            }
            // add game end marker
            const endMin = Math.floor(gameDurationSec / 60)
            markers.push(
              <span key="end" className="absolute -bottom-5 right-0 translate-x-1/2 text-[10px] text-text-muted tabular-nums">
                {endMin}m
              </span>
            )
            return markers
          })()}

          {/* Event markers */}
          {events.map((event, idx) => {
            const leftPct = (event.t / gameDurationSec) * 100
            const isTower = event.type === 'tower'
            const isTakedown = event.type === 'takedown'
            const isDeath = event.type === 'death'
            const isBadDeath = isDeath && event.isBad
            const isSelected = selectedEventIdx === idx

            return (
              <button
                key={`${event.type}-${idx}`}
                className={clsx(
                  'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 transition-all',
                  isSelected ? 'scale-150' : 'hover:scale-125',
                  isBadDeath && 'animate-pulse'
                )}
                style={{ left: `${leftPct}%` }}
                onClick={() => setSelectedEventIdx(isSelected ? null : idx)}
              >
                <div className={clsx(
                  isTower ? 'w-2.5 h-2.5 rotate-45 border border-gold-light/70' : 'rounded-full border border-gold-light/70',
                  isTower && (event.team === 'enemy' ? 'bg-accent-light' : 'bg-negative'),
                  !isTower && (isBadDeath ? 'w-3 h-3' : 'w-2.5 h-2.5'),
                  !isTower && isTakedown && 'bg-accent-light',
                  !isTower && isDeath && 'bg-negative',
                  !isTower && event.wasTrade && !isBadDeath && 'ring-1 ring-accent-light/50',
                  isBadDeath && 'ring-2 ring-negative/50'
                )} />
              </button>
            )
          })}
        </div>
      </PerformanceSection>
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

  // prepare metrics for SpiderChart using raw stats comparison
  const getChartData = (playerVal: number, avgVal: number, inverse = false) => {
    if (inverse) {
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
      label: 'CHAMP DMG',
      ...getChartData(
        pigScoreBreakdown.playerStats.damageToChampionsPerMin,
        pigScoreBreakdown.championAvgStats.damageToChampionsPerMin
      )
    },
    {
      label: 'TOTAL DMG',
      ...getChartData(
        pigScoreBreakdown.playerStats.totalDamagePerMin,
        pigScoreBreakdown.championAvgStats.totalDamagePerMin
      )
    },
    ...(pigScoreBreakdown.playerStats.healingShieldingPerMin > 500 ? [{
      label: 'Healing',
      ...getChartData(
        pigScoreBreakdown.playerStats.healingShieldingPerMin,
        pigScoreBreakdown.championAvgStats.healingShieldingPerMin
      )
    }] : []),
    ...(pigScoreBreakdown.playerStats.ccTimePerMin >= 1 ? [{
      label: 'CC',
      ...getChartData(
        pigScoreBreakdown.playerStats.ccTimePerMin,
        pigScoreBreakdown.championAvgStats.ccTimePerMin
      )
    }] : []),
    {
      label: 'KP',
      ...getChartData(
        pigScoreBreakdown.playerStats.killParticipation || 0,
        0.5 // Assume 50% avg KP for ARAM
      )
    },
  ]

  // Calculate match labels for this participant
  const labels = useMemo(() => {
    if (!currentPlayer) return []
    return calculateMatchLabels(match, currentPlayer)
  }, [match, currentPlayer])

  return (
    <div className="flex flex-col">
      {/* Match Labels/Badges */}
      {labels.length > 0 && (
        <div className="px-4 py-3 border-b border-abyss-700 bg-abyss-800/50">
          <div className="flex flex-wrap gap-2">
            {labels.map(label => (
              <SimpleTooltip key={label.id} content={label.description}>
                <LabelBadge
                  label={label.label}
                  isBad={label.type === 'bad'}
                  isMvp={label.type === 'mvp'}
                  count={label.type === 'multikill' ? label.count : undefined}
                />
              </SimpleTooltip>
            ))}
          </div>
        </div>
      )}

      {/* Stats Content */}
      <div className="p-4">
        <div className="flex flex-col gap-6">
          {/* Row 1: Spider Chart & Stats List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left: Spider Chart */}
            <div className="flex justify-center py-2">
              <SpiderChart data={spiderMetrics} size={220} />
            </div>

            {/* Right: Stats List */}
            <div className="flex flex-col justify-center h-full">
              <div className="space-y-3">
                {[
                  {
                    label: 'Damage/min',
                    value: pigScoreBreakdown.playerStats.damageToChampionsPerMin,
                    avg: pigScoreBreakdown.championAvgStats.damageToChampionsPerMin,
                    metric: 'Damage to Champions'
                  },
                  {
                    label: 'Total Dmg/min',
                    value: pigScoreBreakdown.playerStats.totalDamagePerMin,
                    avg: pigScoreBreakdown.championAvgStats.totalDamagePerMin,
                    metric: 'Total Damage'
                  },
                  ...(pigScoreBreakdown.playerStats.healingShieldingPerMin > 500 ? [{
                    label: 'Healing/min',
                    value: pigScoreBreakdown.playerStats.healingShieldingPerMin,
                    avg: pigScoreBreakdown.championAvgStats.healingShieldingPerMin,
                    metric: 'Healing/Shielding'
                  }] : []),
                  ...(pigScoreBreakdown.playerStats.ccTimePerMin >= 1 ? [{
                    label: 'CC Time/min',
                    value: pigScoreBreakdown.playerStats.ccTimePerMin,
                    avg: pigScoreBreakdown.championAvgStats.ccTimePerMin,
                    metric: 'CC Time',
                    suffix: 's'
                  }] : []),
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
                  let isGood = score >= 85
                  let isBad = score < 50
                  
                  let statusText = isGood ? 'Excellent' : isBad ? 'Below Avg' : 'Average'
                  
                  // Ddeaths has custom logic - override generic scoring
                  if (stat.metric === 'Deaths') {
                    if (stat.value < 0.5) {
                      statusText = 'Resets too little'
                      isGood = false
                      isBad = false // neutral/warning
                    } else if (stat.value > 0.7) {
                      statusText = 'Too many deaths'
                      isGood = false
                      isBad = true
                    } else {
                      statusText = 'Optimal'
                      isGood = true
                      isBad = false
                    }
                  }

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
                          {statusText}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* row 2: death bar */}
          <div className="px-4">
            <div className="flex justify-between text-[10px] text-text-muted uppercase mb-1">
              <span>Deaths/Min</span>
              <span>{pigScoreBreakdown.playerStats.deathsPerMin.toFixed(2)}</span>
            </div>
            <div className="relative h-2 bg-abyss-800 rounded-full overflow-hidden">
              {/* optimal Area (0.5 - 0.7) */}
              <div 
                className="absolute top-0 bottom-0 bg-accent-light/20" 
                style={{ 
                  left: `${(0.5 / 1.5) * 100}%`,
                  width: `${((0.7 - 0.5) / 1.5) * 100}%` 
                }} 
              />
              {/* Player Marker */}
              <div 
                className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
                style={{ left: `${Math.min(100, (pigScoreBreakdown.playerStats.deathsPerMin / 1.5) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>0</span>
              <span>1.5+</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Kill/Death Timeline */}
      {(() => {
        const details = participantDetails.get(currentPuuid)
        const timeline = details?.kill_death_timeline
        const gameDurationSec = match.info.gameDuration

        if (!timeline || (timeline.takedowns.length === 0 && timeline.deaths.length === 0)) {
          return null
        }

        // combine all events into a sorted timeline (including towers)
        const events: TimelineEvent[] = [
          ...timeline.takedowns.map(k => ({ type: 'takedown' as const, ...k })),
          ...timeline.deaths.map(d => ({ 
            type: 'death' as const, 
            ...d,
            isBad: d.value !== undefined && d.value <= 40 // bad death threshold
          })),
          ...(timeline.towers || []).map(t => ({ type: 'tower' as const, ...t })),
        ].sort((a, b) => a.t - b.t)

        return (
          <TimelineSection
            events={events}
            gameDurationSec={gameDurationSec}
            ddragonVersion={ddragonVersion}
            currentPlayer={currentPlayer}
            takedownCount={timeline.takedowns.length}
            deathCount={timeline.deaths.length}
          />
        )
      })()}
    </div>
  )
}
