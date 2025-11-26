"use client"

import { getWinrateColor, getKdaColor, getPigScoreColor, getPigScoreGradientColors } from "../lib/winrate-colors"

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
}

// arc progress component for PIG score with bottom cutout
function PigScoreArc({ score, loading }: { score: number | null | undefined; loading: boolean }) {
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
  const gradientColors = score !== null && score !== undefined 
    ? getPigScoreGradientColors(score) 
    : { dark: 'oklch(0.4 0 0)', light: 'oklch(0.7 0 0)' }
  
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="pigScoreGradientDynamic" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={gradientColors.dark} />
            <stop offset="100%" stopColor={gradientColors.light} />
          </linearGradient>
        </defs>
        {/* background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="var(--color-abyss-800)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* progress arc */}
        {!loading && (
          <path
            d={arcPath}
            fill="none"
            stroke="url(#pigScoreGradientDynamic)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={progressOffset}
            className="transition-all duration-500"
          />
        )}
      </svg>
      {/* center number */}
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent-light rounded-full animate-spin border-t-transparent"></div>
        </div>
      ) : score !== null && score !== undefined ? (
        <span 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold leading-none tabular-nums" 
          style={{ color: getPigScoreColor(score) }}
        >
          {score.toFixed(0)}
        </span>
      ) : (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold text-gray-500 leading-none">--</span>
      )}
      {/* PIG label at bottom gap */}
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[12px] text-text-muted leading-none">PIG</span>
    </div>
  )
}

export default function SummonerSummaryCard({ 
  championStatsLoading, 
  aggregateStats, 
  summaryKda,
  onTabChange
}: Props) {
  const formatStat = (num: number, decimals: number = 1): string => {
    const rounded = Number(num.toFixed(decimals))
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(decimals)
  }

  return (
    <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
      <div className="px-4 py-1.5">
        <button 
          onClick={() => onTabChange('performance')}
          className="text-xl font-bold text-left mb-1.5 transition-colors cursor-pointer"
        >
          <h2>Performance</h2>
        </button>
        <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-4 -mx-6" />
        
        <div className="grid grid-cols-3 gap-2 pb-2">
          {/* PIG score arc */}
          <div className="flex items-center justify-start">
            <PigScoreArc 
              score={aggregateStats?.averagePigScore} 
              loading={championStatsLoading} 
            />
          </div>
          
          {/* KDA */}
          <div className="flex flex-col items-center justify-center">
            {championStatsLoading ? (
              <>
                <div className="h-5 w-12 bg-abyss-500 rounded animate-pulse mb-1"></div>
                <div className="h-3 w-16 bg-abyss-500 rounded animate-pulse"></div>
              </>
            ) : aggregateStats ? (
              <>
                <span className="text-sm font-bold" style={{ color: getKdaColor(parseFloat(summaryKda)) }}>
                  {summaryKda} KDA
                </span>
                <span className="text-xs text-text-muted">
                  {formatStat(aggregateStats.kills / aggregateStats.games)} / {formatStat(aggregateStats.deaths / aggregateStats.games)} / {formatStat(aggregateStats.assists / aggregateStats.games)}
                </span>
              </>
            ) : null}
          </div>
          
          {/* Win Rate */}
          <div className="flex flex-col items-end justify-center">
            {championStatsLoading ? (
              <>
                <div className="h-5 w-10 bg-abyss-500 rounded animate-pulse mb-1"></div>
                <div className="h-3 w-14 bg-abyss-500 rounded animate-pulse"></div>
              </>
            ) : aggregateStats ? (
              <>
                <span className="text-sm text-text-muted">
                  {aggregateStats.wins}W / {aggregateStats.losses}L
                </span>
                <span className="text-xs text-text-muted">
                  {((aggregateStats.wins / aggregateStats.games) * 100).toFixed(0)}% winrate
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
