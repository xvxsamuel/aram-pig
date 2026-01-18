'use client'

import { useMemo, useId } from 'react'
import { getKdaColor, getPigScoreColor, getPigScoreGradientColors } from '@/lib/ui'
import { calculateProfileBadges, type ProfileBadge } from '@/lib/scoring/labels'
import type { MatchData } from '@/types/match'
import Card from '@/components/ui/Card'
import SimpleTooltip from '@/components/ui/SimpleTooltip'

interface AggregateStats {
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  averagePigScore: number | null
}

interface Props {
  championStatsLoading: boolean
  aggregateStats: AggregateStats | null
  summaryKda: string
  onTabChange: (tab: 'overview' | 'champions' | 'performance') => void
  matches: MatchData[]
  puuid: string
}

// arc progress component for PIG score with bottom cutout
function PigScoreArc({ score, loading }: { score: number | null | undefined; loading: boolean }) {
  const gradientId = useId()
  const size = 72
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2

  // arc spans 270 degrees (3/4 of circle), with 90 degree gap at bottom
  const arcLength = (3 / 4) * 2 * Math.PI * radius

  // calculate progress (0-100 score maps to 0-100% of the arc)
  const progress = score !== null && score !== undefined ? Math.min(100, Math.max(0, score)) / 100 : 0
  const progressOffset = arcLength * (1 - progress)

  // start angle: 135 degrees (bottom-left), end angle: 45 degrees (bottom-right)
  const startAngle = 135
  const endAngle = 45

  // convert to radians for path calculation
  const startRad = (startAngle * Math.PI) / 180
  const endRad = ((360 + endAngle) * Math.PI) / 180

  const cx = size / 2
  const cy = size / 2

  // calculate arc path points
  const x1 = cx + radius * Math.cos(startRad)
  const y1 = cy + radius * Math.sin(startRad)
  const x2 = cx + radius * Math.cos(endRad)
  const y2 = cy + radius * Math.sin(endRad)

  // arc path: large arc flag = 1 for > 180 degrees
  const arcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`

  // get dynamic gradient colors based on score
  const gradientColors =
    score !== null && score !== undefined
      ? getPigScoreGradientColors(score)
      : { dark: 'oklch(0.4 0 0)', light: 'oklch(0.7 0 0)' }

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={gradientColors.dark} />
            <stop offset="100%" stopColor={gradientColors.light} />
          </linearGradient>
        </defs>
        {/* background arc */}
        <path d={arcPath} fill="none" stroke="var(--color-abyss-800)" strokeWidth={strokeWidth} strokeLinecap="round" />
        {/* progress arc */}
        {!loading && (
          <path
            d={arcPath}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={progressOffset}
            className="transition-all duration-500"
          />
        )}
      </svg>
      {/* center number */}
      {score !== null && score !== undefined && !loading ? (
        <span
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold leading-none tabular-nums"
          style={{ color: getPigScoreColor(score) }}
        >
          {score.toFixed(0)}
        </span>
      ) : (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold text-text-muted leading-none">
          --
        </span>
      )}
      {/* PIG label at bottom gap - only show when score is available */}
      {score !== null && score !== undefined && !loading && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[12px] text-text-muted leading-none">
          PIG
        </span>
      )}
    </div>
  )
}

export default function SummonerSummaryCard({ championStatsLoading, aggregateStats, summaryKda, onTabChange, matches, puuid }: Props) {
  const formatStat = (num: number, decimals: number = 1): string => {
    if (!isFinite(num) || isNaN(num)) return '0'
    const rounded = Number(num.toFixed(decimals))
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(decimals)
  }

  // calculate profile badges (badges that appear 3+ times in last 20 matches)
  const profileBadges = useMemo(() => {
    if (matches.length === 0) return []
    
    const matchesWithParticipants = matches
      .map(match => {
        const participant = match.info.participants.find(p => p.puuid === puuid)
        if (!participant) return null
        return { match, participant }
      })
      .filter((m): m is { match: MatchData; participant: MatchData['info']['participants'][0] } => m !== null)
    
    return calculateProfileBadges(matchesWithParticipants, 3, 20)
  }, [matches, puuid])

  // check if we have actual data (games > 0)
  const hasData = aggregateStats && aggregateStats.games > 0
  const isLoading = championStatsLoading
  const showEmptyState = !isLoading && !hasData

  return (
    <Card title="Performance" onTitleClick={() => onTabChange('performance')} contentClassName="pb-2">
      <div className="grid grid-cols-3 gap-2">
        {/* PIG score arc */}
        <div className="flex items-center justify-start">
          <PigScoreArc score={hasData ? aggregateStats?.averagePigScore : null} loading={isLoading} />
        </div>

        {/* KDA */}
        <div className="flex flex-col items-center justify-center">
          {isLoading ? (
            <>
              <div className="h-5 w-12 bg-abyss-500 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-16 bg-abyss-500 rounded animate-pulse"></div>
            </>
          ) : showEmptyState ? (
            <>
              <div className="h-5 w-12 bg-abyss-600 rounded mb-1"></div>
              <div className="h-3 w-16 bg-abyss-600 rounded"></div>
            </>
          ) : hasData ? (
            <>
              <span className="text-sm font-bold" style={{ color: getKdaColor(parseFloat(summaryKda)) }}>
                {summaryKda} KDA
              </span>
              <span className="text-xs text-text-muted">
                {formatStat(aggregateStats.kills / aggregateStats.games)} /{' '}
                {formatStat(aggregateStats.deaths / aggregateStats.games)} /{' '}
                {formatStat(aggregateStats.assists / aggregateStats.games)}
              </span>
            </>
          ) : null}
        </div>

        {/* Win Rate */}
        <div className="flex flex-col items-end justify-center">
          {isLoading ? (
            <>
              <div className="h-5 w-10 bg-abyss-500 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-14 bg-abyss-500 rounded animate-pulse"></div>
            </>
          ) : showEmptyState ? (
            <>
              <div className="h-5 w-10 bg-abyss-600 rounded mb-1"></div>
              <div className="h-3 w-14 bg-abyss-600 rounded"></div>
            </>
          ) : hasData ? (
            <>
              <span className="text-sm text-white">
                {aggregateStats.wins}W / {aggregateStats.losses}L
              </span>
              <span className="text-xs text-text-muted">
                {((aggregateStats.wins / aggregateStats.games) * 100).toFixed(0)}% winrate
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Profile badges - badges that appear frequently in recent matches */}
      {profileBadges.length > 0 && (
        <div className="mt-2 pt-2 border-t border-abyss-700">
          <div className="flex flex-wrap gap-2 items-center justify-center">
            {profileBadges.map(badge => {
              const isBad = badge.type === 'bad'
              return (
                <SimpleTooltip 
                  key={badge.id} 
                  content={`${badge.description} (${badge.count}x in last 20 games)`}
                >
                  <div className="flex items-center gap-1">
                    <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full">
                      <div
                        className={`rounded-full px-3 py-1.5 text-[10px] font-normal leading-none flex items-center whitespace-nowrap ${
                          isBad ? 'bg-worst-dark' : 'bg-abyss-700'
                        }`}
                      >
                        <span className="text-white">{badge.label}</span>
                      </div>
                    </div>
                    <span className="text-text-muted text-[10px]">×{badge.count}</span>
                  </div>
                </SimpleTooltip>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
