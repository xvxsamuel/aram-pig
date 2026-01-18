'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { getChampionImageUrl } from '@/lib/ddragon'
import { getPigScoreColor } from '@/lib/ui'
import { calculateMatchLabels } from '@/lib/scoring/labels'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { SpiderChart } from './SpiderChart'
import DataWarning from '@/components/ui/DataWarning'
import {
  TabProps,
  coordToPercent,
  formatTimeSec,
} from './shared'

// ARAM base positions for lane position calculation
const ARAM_BLUE_BASE = { x: 400, y: 400 }
const ARAM_RED_BASE = { x: 12400, y: 12400 }

// Calculate lane position (0-1) from game coordinates using distance from bases
function getLanePosition(x: number, y: number): number {
  const distToBlue = Math.sqrt(Math.pow(x - ARAM_BLUE_BASE.x, 2) + Math.pow(y - ARAM_BLUE_BASE.y, 2))
  const distToRed = Math.sqrt(Math.pow(x - ARAM_RED_BASE.x, 2) + Math.pow(y - ARAM_RED_BASE.y, 2))
  return distToBlue / (distToBlue + distToRed)
}

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

// Timeline event type
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
  isBad?: boolean // for deaths only - explicitly bad death
}

// Separate component for timeline section with state
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
        className="p-4"
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
        {/* Map Display - Stylized ARAM lane SVG */}
        <div className="relative w-full aspect-[5/1] rounded-lg mb-4 overflow-hidden bg-gradient-to-r from-abyss-800 via-abyss-900 to-abyss-800 border border-abyss-600 p-2">
          <svg 
            viewBox="0 0 500 100" 
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              {/* Radial gradients for bases */}
              <radialGradient id="blueBaseGlow" cx="50%" cy="50%">
                <stop offset="0%" stopColor="oklch(0.6537 0.118 223.64)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="oklch(0.6537 0.118 223.64)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="redBaseGlow" cx="50%" cy="50%">
                <stop offset="0%" stopColor="oklch(62.451% 0.20324 17.952)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="oklch(62.451% 0.20324 17.952)" stopOpacity="0" />
              </radialGradient>
              
              {/* Lane gradient */}
              <linearGradient id="laneGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="oklch(0.32 0.04 245)" />
                <stop offset="50%" stopColor="oklch(0.25 0 0)" />
                <stop offset="100%" stopColor="oklch(0.32 0.04 17)" />
              </linearGradient>
              
              {/* Lane border */}
              <linearGradient id="laneBorder" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="oklch(0.6537 0.118 223.64)" stopOpacity="0.4" />
                <stop offset="50%" stopColor="oklch(0.4 0 0)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="oklch(62.451% 0.20324 17.952)" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            
            {/* Blue base glow */}
            <circle cx="20" cy="50" r="60" fill="url(#blueBaseGlow)" />
            
            {/* Red base glow */}
            <circle cx="480" cy="50" r="60" fill="url(#redBaseGlow)" />
            
            {/* Blue base platform */}
            <g filter="drop-shadow(0 0 3px oklch(0.6537 0.118 223.64 / 0.3))">
              <path d="M 0,35 L 40,42 L 40,58 L 0,65 Z" fill="oklch(0.28 0.07 245)" stroke="oklch(0.6537 0.118 223.64)" strokeWidth="1" opacity="0.8" />
            </g>
            
            {/* Red base platform */}
            <g filter="drop-shadow(0 0 3px oklch(62.451% 0.20324 17.952 / 0.3))">
              <path d="M 500,35 L 460,42 L 460,58 L 500,65 Z" fill="oklch(0.28 0.07 17)" stroke="oklch(62.451% 0.20324 17.952)" strokeWidth="1" opacity="0.8" />
            </g>
            
            {/* Main lane */}
            <rect x="38" y="43" width="424" height="14" fill="url(#laneGradient)" rx="1" />
            
            {/* Lane borders */}
            <line x1="38" y1="43" x2="462" y2="43" stroke="url(#laneBorder)" strokeWidth="1" />
            <line x1="38" y1="57" x2="462" y2="57" stroke="url(#laneBorder)" strokeWidth="1" />
            
            {/* Blue nexus */}
            <g filter="drop-shadow(0 0 4px oklch(0.6537 0.118 223.64 / 0.5))">
              <circle cx="18" cy="50" r="7" fill="oklch(0.22 0.07 245)" stroke="oklch(0.6537 0.118 223.64)" strokeWidth="1.5" />
              <circle cx="18" cy="50" r="3.5" fill="oklch(0.6537 0.118 223.64)" opacity="0.7" />
            </g>
            
            {/* Blue towers - diamond shapes matching visual ARAM map */}
            {/* Nexus tower at 0.08 - close to base */}
            <g filter="drop-shadow(0 0 2px oklch(0.6537 0.118 223.64 / 0.4))">
              <rect x={38 + 0.08 * 424 - 2} y="48" width="4" height="4" fill="oklch(0.4 0.1 223.64)" stroke="oklch(0.6537 0.118 223.64)" strokeWidth="0.5" transform={`rotate(45 ${38 + 0.08 * 424} 50)`} />
            </g>
            {/* Inner tower at 0.28 - middle */}
            <g filter="drop-shadow(0 0 2px oklch(0.6537 0.118 223.64 / 0.4))">
              <rect x={38 + 0.28 * 424 - 2} y="48" width="4" height="4" fill="oklch(0.4 0.1 223.64)" stroke="oklch(0.6537 0.118 223.64)" strokeWidth="0.5" transform={`rotate(45 ${38 + 0.28 * 424} 50)`} />
            </g>
            {/* Outer tower at 0.42 - toward center */}
            <g filter="drop-shadow(0 0 2px oklch(0.6537 0.118 223.64 / 0.4))">
              <rect x={38 + 0.42 * 424 - 2} y="48" width="4" height="4" fill="oklch(0.4 0.1 223.64)" stroke="oklch(0.6537 0.118 223.64)" strokeWidth="0.5" transform={`rotate(45 ${38 + 0.42 * 424} 50)`} />
            </g>
            
            {/* Red nexus */}
            <g filter="drop-shadow(0 0 4px oklch(62.451% 0.20324 17.952 / 0.5))">
              <circle cx="482" cy="50" r="7" fill="oklch(0.22 0.07 17)" stroke="oklch(62.451% 0.20324 17.952)" strokeWidth="1.5" />
              <circle cx="482" cy="50" r="3.5" fill="oklch(62.451% 0.20324 17.952)" opacity="0.7" />
            </g>
            
            {/* Red towers - diamond shapes matching visual ARAM map */}
            {/* Outer tower at 0.58 - toward center */}
            <g filter="drop-shadow(0 0 2px oklch(62.451% 0.20324 17.952 / 0.4))">
              <rect x={38 + 0.58 * 424 - 2} y="48" width="4" height="4" fill="oklch(0.4 0.12 17.952)" stroke="oklch(62.451% 0.20324 17.952)" strokeWidth="0.5" transform={`rotate(45 ${38 + 0.58 * 424} 50)`} />
            </g>
            {/* Inner tower at 0.72 - middle */}
            <g filter="drop-shadow(0 0 2px oklch(62.451% 0.20324 17.952 / 0.4))">
              <rect x={38 + 0.72 * 424 - 2} y="48" width="4" height="4" fill="oklch(0.4 0.12 17.952)" stroke="oklch(62.451% 0.20324 17.952)" strokeWidth="0.5" transform={`rotate(45 ${38 + 0.72 * 424} 50)`} />
            </g>
            {/* Nexus tower at 0.92 - close to base */}
            <g filter="drop-shadow(0 0 2px oklch(62.451% 0.20324 17.952 / 0.4))">
              <rect x={38 + 0.92 * 424 - 2} y="48" width="4" height="4" fill="oklch(0.4 0.12 17.952)" stroke="oklch(62.451% 0.20324 17.952)" strokeWidth="0.5" transform={`rotate(45 ${38 + 0.92 * 424} 50)`} />
            </g>
            
            {/* Health relics */}
            <g filter="drop-shadow(0 0 2px oklch(0.897 0.123 164.65 / 0.5))">
              <circle cx="160" cy="50" r="2" fill="oklch(0.897 0.123 164.65)" opacity="0.8" />
            </g>
            <g filter="drop-shadow(0 0 2px oklch(0.897 0.123 164.65 / 0.5))">
              <circle cx="340" cy="50" r="2" fill="oklch(0.897 0.123 164.65)" opacity="0.8" />
            </g>
          </svg>
          
          {/* Selected event marker */}
          {selectedEvent && selectedEvent.x !== undefined && selectedEvent.y !== undefined && (() => {
            // Use the same lane position calculation as the towers
            const lanePos = getLanePosition(selectedEvent.x, selectedEvent.y)
            // Convert lane position (0-1) to SVG percentage (0-100)
            // The lane occupies positions 38-462 in the 500-wide SVG, so:
            const laneStart = 38 / 500 * 100  // ~7.6%
            const laneWidth = 424 / 500 * 100  // ~84.8%
            const horizontalPos = laneStart + (lanePos * laneWidth)
            
            const isTower = selectedEvent.type === 'tower'
            const isTakedown = selectedEvent.type === 'takedown'
            
            return (
              <div
                className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200"
                style={{
                  left: `${horizontalPos}%`,
                  top: '50%',
                }}
              >
                {isTower ? (
                  <div className={clsx(
                    'w-6 h-6 rotate-45 border-2 shadow-lg',
                    selectedEvent.team === 'enemy' 
                      ? 'bg-accent-light border-white shadow-accent-light/50' 
                      : 'bg-negative border-white shadow-negative/50'
                  )} />
                ) : (
                  <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-b from-gold-light to-gold-dark">
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

          {/* No selection placeholder */}
          {!selectedEvent && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-text-muted text-sm">Click an event below to see location</span>
            </div>
          )}
        </div>

        {/* Event Info */}
        {selectedEvent && (
          <div className={clsx(
            "mb-4 p-3 rounded-lg border",
            selectedEvent.type === 'death' && selectedEvent.isBad 
              ? "bg-negative-dark/30 border-negative"
              : "bg-abyss-800/70 border-abyss-600"
          )}>
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
        )}

        {/* Visual Timeline Bar */}
        <div className="relative h-12 bg-abyss-800 rounded-lg overflow-visible mb-6">
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
                    <span className="absolute -bottom-5 left-0 -translate-x-1/2 text-[10px] text-text-muted tabular-nums">
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
                {isTower ? (
                  <div className={clsx(
                    'w-2.5 h-2.5 rotate-45',
                    event.team === 'enemy' ? 'bg-accent-light' : 'bg-negative',
                    isSelected && 'ring-2 ring-white'
                  )} />
                ) : (
                  <div className={clsx(
                    'rounded-full',
                    isBadDeath ? 'w-3 h-3 bg-negative ring-2 ring-negative/50' : 'w-2.5 h-2.5',
                    isTakedown && !isBadDeath && 'bg-accent-light',
                    isDeath && !isBadDeath && 'bg-negative',
                    event.wasTrade && !isBadDeath && 'ring-1 ring-accent-light/50',
                    isSelected && 'ring-2 ring-white'
                  )} />
                )}
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
      label: 'Total Dmg',
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
            {labels.map(label => {
              const isBad = label.type === 'bad'
              return (
                <SimpleTooltip key={label.id} content={label.description}>
                  <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full">
                    <div
                      className={clsx(
                        'rounded-full px-3 py-1.5 text-xs font-medium leading-none flex items-center whitespace-nowrap',
                        isBad ? 'bg-worst-dark' : 'bg-abyss-700'
                      )}
                    >
                      <span className="text-white">{label.label}</span>
                    </div>
                  </div>
                </SimpleTooltip>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Row: Analysis & Stats */}
      <PerformanceSection 
        title="Performance Analysis"
        className="p-4"
        rightContent={
          <div className="flex items-center gap-2 text-xs text-text-muted font-normal normal-case tracking-normal">
            <span>Based on {pigScoreBreakdown.totalGames.toLocaleString()} games</span>
            <DataWarning 
              usedFallbackPatch={pigScoreBreakdown.usedFallbackPatch}
              usedCoreStats={pigScoreBreakdown.usedCoreStats}
              usedFallbackCore={pigScoreBreakdown.usedFallbackCore}
            />
          </div>
        }
      >
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
                  
                  // Deaths has custom logic - override generic scoring
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

          {/* Row 2: Death Bar */}
          <div className="px-4">
            <div className="flex justify-between text-[10px] text-text-muted uppercase mb-1">
              <span>Deaths/Min</span>
              <span>{pigScoreBreakdown.playerStats.deathsPerMin.toFixed(2)}</span>
            </div>
            <div className="relative h-2 bg-abyss-800 rounded-full overflow-hidden">
              {/* Optimal Area (0.5 - 0.7) */}
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

          {/* Row 3: Scores */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 bg-abyss-800/50 rounded border border-gold-dark/10">
              <div className="text-[10px] text-text-muted uppercase">Stats</div>
              <div className={clsx(
                'text-lg font-bold',
                pigScoreBreakdown.componentScores.stats >= 70 ? 'text-accent-light' : 'text-text-primary'
              )}>
                {pigScoreBreakdown.componentScores.stats}
              </div>
              <div className="text-[9px] text-text-muted">Damage, CC, Healing</div>
            </div>
            <div className="text-center p-2 bg-abyss-800/50 rounded border border-gold-dark/10">
              <div className="text-[10px] text-text-muted uppercase">Death Quality</div>
              <div className={clsx(
                'text-lg font-bold',
                pigScoreBreakdown.componentScores.timeline >= 70 ? 'text-accent-light' : 'text-text-primary'
              )}>
                {pigScoreBreakdown.componentScores.timeline}
              </div>
              <div className="text-[9px] text-text-muted">Trade Value, Spacing</div>
            </div>
            <div className="text-center p-2 bg-abyss-800/50 rounded border border-gold-dark/10">
              <div className="text-[10px] text-text-muted uppercase">Kill Participation</div>
              <div className={clsx(
                'text-lg font-bold',
                pigScoreBreakdown.componentScores.kda >= 70 ? 'text-accent-light' : 'text-text-primary'
              )}>
                {pigScoreBreakdown.componentScores.kda}
              </div>
              <div className="text-[9px] text-text-muted">KP%, Deaths/Min</div>
            </div>
            <div className="text-center p-2 bg-abyss-700/70 rounded border border-gold-dark/20">
              <div className="text-[10px] text-text-muted uppercase">Performance</div>
              <div className={clsx(
                'text-lg font-bold',
                pigScoreBreakdown.componentScores.performance >= 70 ? 'text-accent-light' : 'text-text-primary'
              )}>
                {pigScoreBreakdown.componentScores.performance}
              </div>
              <div className="text-[9px] text-text-muted">Combined Score</div>
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
