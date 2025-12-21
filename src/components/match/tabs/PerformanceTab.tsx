'use client'

import clsx from 'clsx'
import { getChampionImageUrl } from '@/lib/ddragon'
import { getPigScoreColor } from '@/lib/ui'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import {
  TabProps,
  coordToPercent,
  formatTimeSec,
} from './shared'

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

  return (
    <div className="p-4 space-y-4">
      {/* PIG Score Summary */}
      <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">PIG Score Breakdown</h3>
          <div className="flex items-center gap-2">
            <span
              className="text-2xl font-bold tabular-nums"
              style={{ color: getPigScoreColor(pigScoreBreakdown.finalScore) }}
            >
              {pigScoreBreakdown.finalScore}
            </span>
            <span className="text-xs text-text-muted">/ 100</span>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Based on {pigScoreBreakdown.totalGames.toLocaleString()} games on patch {pigScoreBreakdown.patch}
          {pigScoreBreakdown.usedFallbackPatch && pigScoreBreakdown.matchPatch && (
            <span
              className="text-gold-light ml-1"
              title={`Match played on patch ${pigScoreBreakdown.matchPatch}, but no data available for that patch. Using closest available patch data.`}
            >
              (match: {pigScoreBreakdown.matchPatch} ⚠)
            </span>
          )}
        </p>

        {/* Component Scores Summary - Performance only */}
        <div className="mb-4">
          {/* Performance Component - includes Stats, Timeline, KDA */}
          <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-text-muted uppercase tracking-wide">Performance</div>
            </div>
            {(() => {
              const combinedPerformance = Math.round(
                pigScoreBreakdown.componentScores.performance * 0.6 +
                pigScoreBreakdown.componentScores.timeline * 0.25 +
                pigScoreBreakdown.componentScores.kda * 0.15
              )
              return (
                <div
                  className={clsx(
                    'text-xl font-bold text-center mb-2',
                    combinedPerformance >= 85
                      ? 'text-accent-light'
                      : combinedPerformance >= 70
                        ? 'text-gold-light'
                        : 'text-negative'
                  )}
                >
                  {combinedPerformance}
                </div>
              )
            })()}
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-[8px] text-text-muted">Stats</div>
                <div className={clsx(
                  'text-xs font-medium',
                  pigScoreBreakdown.componentScores.performance >= 70 ? 'text-text-primary' : 'text-negative'
                )}>
                  {pigScoreBreakdown.componentScores.performance}
                </div>
                <div className="text-[7px] text-text-muted">60%</div>
              </div>
              <div>
                <div className="text-[8px] text-text-muted">Timeline</div>
                <div className={clsx(
                  'text-xs font-medium',
                  pigScoreBreakdown.componentScores.timeline >= 70 ? 'text-text-primary' : 'text-negative'
                )}>
                  {pigScoreBreakdown.componentScores.timeline}
                </div>
                <div className="text-[7px] text-text-muted">25%</div>
              </div>
              <div>
                <div className="text-[8px] text-text-muted">KDA</div>
                <div className={clsx(
                  'text-xs font-medium',
                  pigScoreBreakdown.componentScores.kda >= 70 ? 'text-text-primary' : 'text-negative'
                )}>
                  {pigScoreBreakdown.componentScores.kda}
                </div>
                <div className="text-[7px] text-text-muted">15%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid - Performance metrics only */}
        <div className="space-y-2.5">
          {pigScoreBreakdown.metrics
            .filter(m => !['Starter', 'Skills', 'Keystone', 'Spells', 'Core Build', 'Items'].includes(m.name))
            .map((m, idx) => {
            const isGood = m.score >= 85
            const isBad = m.score < 50
            const isModerate = !isGood && !isBad

            return (
              <div key={idx} className="flex items-center gap-3">
                {/* Status indicator */}
                <div
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    isGood && 'bg-accent-light',
                    isModerate && 'bg-gold-light',
                    isBad && 'bg-negative'
                  )}
                />

                {/* Stat name */}
                <span className="text-xs text-white w-36 flex-shrink-0">{m.name}</span>

                {/* Progress bar */}
                <div className="flex-1 h-1.5 bg-abyss-800 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      isGood && 'bg-gradient-to-r from-accent-light/80 to-accent-light',
                      isModerate && 'bg-gradient-to-r from-gold-dark to-gold-light',
                      isBad && 'bg-gradient-to-r from-negative/80 to-negative'
                    )}
                    style={{ width: `${Math.max(5, m.score)}%` }}
                  />
                </div>

                {/* Score value */}
                <span
                  className={clsx(
                    'text-xs font-mono w-12 text-right tabular-nums',
                    isGood && 'text-accent-light',
                    isModerate && 'text-gold-light',
                    isBad && 'text-negative'
                  )}
                >
                  {m.score.toFixed(0)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Kill/Death Timeline */}
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
          <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Kill/Death Timeline</h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-accent-light"></span>
                  <span className="text-text-muted">{timeline.takedowns.length} takedowns</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-negative"></span>
                  <span className="text-text-muted">{timeline.deaths.length} deaths</span>
                </span>
                {timeline.towers && timeline.towers.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rotate-45 bg-gold-light"></span>
                    <span className="text-text-muted">{timeline.towers.length} towers</span>
                  </span>
                )}
              </div>
            </div>

            {/* Death Quality Score */}
            <div className="mb-4">
              <div className="bg-abyss-800/50 rounded p-2 max-w-[140px]">
                <div className="text-[10px] text-text-muted mb-1">Death Quality</div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={clsx(
                      'text-lg font-bold tabular-nums',
                      timeline.deathScore >= 70
                        ? 'text-accent-light'
                        : timeline.deathScore >= 50
                          ? 'text-gold-light'
                          : 'text-negative'
                    )}
                  >
                    {timeline.deathScore}
                  </span>
                  <span className="text-[10px] text-text-muted">/100</span>
                </div>
              </div>
            </div>

            {/* Visual Timeline Bar */}
            <div className="relative h-8 bg-abyss-800 rounded-lg mb-3 overflow-visible">
              {/* Minute markers - major (labeled) and minor (unlabeled) */}
              {(() => {
                const gameMins = Math.ceil(gameDurationSec / 60)
                const markers: React.ReactNode[] = []

                // generate markers every minute
                for (let min = 0; min <= gameMins; min++) {
                  const pct = ((min * 60) / gameDurationSec) * 100
                  if (pct > 100) continue

                  const isMajor = min % 5 === 0 // 0, 5, 10, 15, 20...

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
                const isDeath = event.type === 'death'
                const isKill = isTakedown && event.wasKill
                const eventLabel = isTower
                  ? event.team === 'enemy'
                    ? 'Tower Destroyed'
                    : 'Tower Lost'
                  : isTakedown
                    ? isKill
                      ? 'Kill'
                      : 'Assist'
                    : 'Death'

                // Map position if coordinates available
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
                          {/* Map visualization */}
                          {hasPosition && (
                            <div className="relative w-[120px] h-[120px] mb-2 rounded overflow-hidden border border-abyss-600">
                              {/* ARAM Map background */}
                              <img
                                src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/map/map12.png`}
                                alt="ARAM Map"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              {/* Event marker on map */}
                              {mapPos && (
                                <div
                                  className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2"
                                  style={{
                                    left: `${mapPos.x}%`,
                                    // Flip Y axis since map image has origin at top-left but game coords have origin at bottom-left
                                    top: `${100 - mapPos.y}%`,
                                  }}
                                >
                                  {isTower ? (
                                    // Tower icon - diamond shape
                                    <div
                                      className={clsx(
                                        'w-3 h-3 rotate-45 border',
                                        event.team === 'enemy'
                                          ? 'bg-accent-light/90 border-white'
                                          : 'bg-negative/90 border-white'
                                      )}
                                    />
                                  ) : (
                                    // Champion icon for kills/deaths
                                    <div
                                      className={clsx(
                                        'w-5 h-5 rounded-full border-[1.5px] overflow-hidden',
                                        isTakedown ? 'border-accent-light' : 'border-negative',
                                        event.wasTrade && 'ring-1 ring-accent-light'
                                      )}
                                    >
                                      <img
                                        src={getChampionImageUrl(
                                          currentPlayer?.championName || '',
                                          ddragonVersion
                                        )}
                                        alt={currentPlayer?.championName}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Event info */}
                          <div className="min-w-[120px]">
                            <div
                              className={clsx(
                                'font-semibold mb-1.5',
                                isTower
                                  ? event.team === 'enemy'
                                    ? 'text-accent-light'
                                    : 'text-negative'
                                  : isTakedown
                                    ? 'text-accent-light'
                                    : 'text-negative'
                              )}
                            >
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
                                    <span
                                      className={clsx(
                                        event.pos >= 60
                                          ? 'text-accent-light'
                                          : event.pos <= 40
                                            ? 'text-negative'
                                            : 'text-text-muted'
                                      )}
                                    >
                                      {event.pos >= 60 ? 'Aggressive' : event.pos <= 40 ? 'Passive' : 'Neutral'}
                                    </span>
                                  </div>
                                )}
                                {isDeath && event.wasTrade && (
                                  <div className="text-accent-light">
                                    Good Trade ({event.tradeKills} kills)
                                  </div>
                                )}
                                {isDeath && !event.wasTrade && event.pos !== undefined && event.pos >= 60 && (
                                  <div className="text-gold-light">
                                    Good Death (Aggressive)
                                  </div>
                                )}
                                {isDeath && event.gold !== undefined && event.gold > 2000 && (
                                  <div className="text-negative text-[10px]">Held too much gold!</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      }
                    >
                      {isTower ? (
                        // Tower marker - diamond shape
                        <div
                          className={clsx(
                            'w-2 h-2 rotate-45 cursor-pointer transition-transform hover:scale-150',
                            event.team === 'enemy'
                              ? 'bg-accent-light border border-accent-light/50'
                              : 'bg-negative border border-negative/50'
                          )}
                        />
                      ) : (
                        // Kill/death marker - circle
                        <div
                          className={clsx(
                            'w-2 h-2 rounded-full cursor-pointer transition-transform hover:scale-150',
                            isTakedown ? 'bg-accent-light' : 'bg-negative',
                            event.wasTrade && 'ring-1 ring-accent-light/50'
                          )}
                        />
                      )}
                    </SimpleTooltip>
                  </div>
                )
              })}
            </div>

            {/* Event List */}
            <div className="space-y-1.5 mt-6 max-h-32 overflow-y-auto">
              {events.map((event, idx) => {
                const isTower = event.type === 'tower'
                const isTakedown = event.type === 'takedown'
                const isKill = isTakedown && event.wasKill
                const pos = event.pos
                const eventLabel = isTower
                  ? event.team === 'enemy'
                    ? 'Tower ✓'
                    : 'Tower ✗'
                  : isTakedown
                    ? isKill
                      ? 'Kill'
                      : 'Assist'
                    : 'Death'
                return (
                  <div key={`list-${event.type}-${idx}`} className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted w-10 text-right tabular-nums">
                      {formatTimeSec(event.t)}
                    </span>
                    {isTower ? (
                      // Tower marker - diamond
                      <span
                        className={clsx(
                          'w-1.5 h-1.5 rotate-45',
                          event.team === 'enemy' ? 'bg-accent-light' : 'bg-negative'
                        )}
                      />
                    ) : (
                      // Kill/death marker - circle
                      <span
                        className={clsx(
                          'w-1.5 h-1.5 rounded-full',
                          isTakedown ? 'bg-accent-light' : 'bg-negative'
                        )}
                      />
                    )}
                    <span
                      className={clsx(
                        'font-medium w-12',
                        isTower
                          ? event.team === 'enemy'
                            ? 'text-accent-light'
                            : 'text-negative'
                          : isTakedown
                            ? 'text-accent-light'
                            : 'text-negative'
                      )}
                    >
                      {eventLabel}
                    </span>
                    {!isTower && event.gold !== undefined && event.gold > 0 && (
                      <span className="text-text-muted">
                        <span className="text-gold-light">{event.gold.toLocaleString()}g</span>
                      </span>
                    )}
                    {!isTower && pos !== undefined && (
                      <span
                        className={clsx(
                          'px-1.5 py-0.5 text-[10px] rounded',
                          pos >= 60
                            ? 'bg-accent-light/20 text-accent-light'
                            : pos <= 40
                              ? 'bg-negative/20 text-negative'
                              : 'bg-abyss-600/50 text-text-muted'
                        )}
                      >
                        {pos >= 60 ? 'AGG' : pos <= 40 ? 'PAS' : 'NEU'}
                      </span>
                    )}
                    {!isTower && event.wasTrade && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-accent-light/20 text-accent-light rounded">
                        Trade
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Detailed Stats Comparison */}
      <div className="bg-abyss-700/50 rounded-lg border border-gold-dark/20 p-4">
        <h3 className="text-sm font-semibold text-white mb-4">Stats vs Champion Average</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Damage to Champions */}
          <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
            <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
              Damage to Champions /min
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white tabular-nums">
                {pigScoreBreakdown.playerStats.damageToChampionsPerMin.toFixed(0)}
              </span>
              <span className="text-xs text-text-muted">
                vs {pigScoreBreakdown.championAvgStats.damageToChampionsPerMin.toFixed(0)} avg
              </span>
            </div>
            {(() => {
              const m = pigScoreBreakdown.metrics.find(m => m.name === 'Damage to Champions')
              if (!m?.percentOfAvg) return null
              return (
                <div
                  className={clsx(
                    'text-xs mt-1 font-medium',
                    m.percentOfAvg >= 100
                      ? 'text-accent-light'
                      : m.percentOfAvg >= 80
                        ? 'text-gold-light'
                        : 'text-negative'
                  )}
                >
                  {m.percentOfAvg.toFixed(0)}% of average
                </div>
              )
            })()}
          </div>

          {/* Total Damage */}
          <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
            <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
              Total Damage /min
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white tabular-nums">
                {pigScoreBreakdown.playerStats.totalDamagePerMin.toFixed(0)}
              </span>
              <span className="text-xs text-text-muted">
                vs {pigScoreBreakdown.championAvgStats.totalDamagePerMin.toFixed(0)} avg
              </span>
            </div>
            {(() => {
              const m = pigScoreBreakdown.metrics.find(m => m.name === 'Total Damage')
              if (!m?.percentOfAvg) return null
              return (
                <div
                  className={clsx(
                    'text-xs mt-1 font-medium',
                    m.percentOfAvg >= 100
                      ? 'text-accent-light'
                      : m.percentOfAvg >= 80
                        ? 'text-gold-light'
                        : 'text-negative'
                  )}
                >
                  {m.percentOfAvg.toFixed(0)}% of average
                </div>
              )
            })()}
          </div>

          {/* Healing/Shielding */}
          <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
            <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
              Healing + Shielding /min
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white tabular-nums">
                {pigScoreBreakdown.playerStats.healingShieldingPerMin.toFixed(0)}
              </span>
              <span className="text-xs text-text-muted">
                vs {pigScoreBreakdown.championAvgStats.healingShieldingPerMin.toFixed(0)} avg
              </span>
            </div>
            {(() => {
              const m = pigScoreBreakdown.metrics.find(m => m.name === 'Healing/Shielding')
              if (!m?.percentOfAvg) return null
              return (
                <div
                  className={clsx(
                    'text-xs mt-1 font-medium',
                    m.percentOfAvg >= 100
                      ? 'text-accent-light'
                      : m.percentOfAvg >= 80
                        ? 'text-gold-light'
                        : 'text-negative'
                  )}
                >
                  {m.percentOfAvg.toFixed(0)}% of average
                </div>
              )
            })()}
          </div>

          {/* CC Time */}
          <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3">
            <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">CC Time /min</div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white tabular-nums">
                {pigScoreBreakdown.playerStats.ccTimePerMin.toFixed(1)}s
              </span>
              <span className="text-xs text-text-muted">
                vs {pigScoreBreakdown.championAvgStats.ccTimePerMin.toFixed(1)}s avg
              </span>
            </div>
            {(() => {
              const m = pigScoreBreakdown.metrics.find(m => m.name === 'CC Time')
              if (!m?.percentOfAvg) return null
              return (
                <div
                  className={clsx(
                    'text-xs mt-1 font-medium',
                    m.percentOfAvg >= 100
                      ? 'text-accent-light'
                      : m.percentOfAvg >= 80
                        ? 'text-gold-light'
                        : 'text-negative'
                  )}
                >
                  {m.percentOfAvg.toFixed(0)}% of average
                </div>
              )
            })()}
          </div>

          {/* Deaths per Min */}
          <div className="bg-abyss-800/50 rounded-lg border border-gold-dark/10 p-3 col-span-2">
            <div className="text-[11px] text-text-muted mb-1.5 uppercase tracking-wide">
              Deaths per Minute
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white tabular-nums">
                {pigScoreBreakdown.playerStats.deathsPerMin.toFixed(2)}
              </span>
              <span className="text-xs text-text-muted">(optimal: 0.5-0.7)</span>
            </div>
            {(() => {
              const dpm = pigScoreBreakdown.playerStats.deathsPerMin
              const isOptimal = dpm >= 0.5 && dpm <= 0.7
              const isTooFew = dpm < 0.5
              return (
                <div
                  className={clsx(
                    'text-xs mt-1 font-medium',
                    isOptimal ? 'text-accent-light' : isTooFew ? 'text-gold-light' : 'text-negative'
                  )}
                >
                  {isOptimal ? 'Optimal engagement' : isTooFew ? 'Could engage more' : 'Too many deaths'}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
