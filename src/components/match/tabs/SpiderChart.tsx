'use client'

import { useMemo } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'

interface SpiderChartProps {
  data: { label: string; value: number; baseline?: number }[]
  size?: number
  className?: string
}

export function SpiderChart({ data, size = 200, className }: SpiderChartProps) {
  const padding = 40
  const radius = (size - padding * 2) / 2
  const center = size / 2
  const angleStep = (Math.PI * 2) / data.length

  // Helper to get coordinates
  const getCoordinates = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2 // Start from top
    const r = (value / 100) * radius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // Generate points for polygons
  const playerPoints = useMemo(() => {
    return data
      .map((d, i) => {
        const { x, y } = getCoordinates(d.value, i)
        return `${x},${y}`
      })
      .join(' ')
  }, [data, radius, center])

  const averagePoints = useMemo(() => {
    return data
      .map((d, i) => {
        // Use baseline if provided, otherwise default to 50
        const val = d.baseline !== undefined ? d.baseline : 50
        const { x, y } = getCoordinates(val, i)
        return `${x},${y}`
      })
      .join(' ')
  }, [data, radius, center])

  const gridLevels = [25, 50, 75, 100]

  return (
    <div className={clsx("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        {/* Grid Levels */}
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={data
              .map((_, i) => {
                const { x, y } = getCoordinates(level, i)
                return `${x},${y}`
              })
              .join(' ')}
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1"
            strokeOpacity="0.3"
          />
        ))}

        {/* Axes */}
        {data.map((_, i) => {
          const { x, y } = getCoordinates(100, i)
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="var(--color-text-muted)"
              strokeWidth="1"
              strokeOpacity="0.3"
            />
          )
        })}

        {/* Average Polygon (Gold) */}
        <polygon
          points={averagePoints}
          fill="var(--color-gold-light)"
          fillOpacity="0.1"
          stroke="var(--color-gold-light)"
          strokeWidth="2"
        />

        {/* Player Polygon */}
        <motion.polygon
          initial={{ opacity: 0, scale: 0.8, originX: "50%", originY: "50%" }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          points={playerPoints}
          fill="var(--color-accent-light)"
          fillOpacity="0.2"
          stroke="var(--color-accent-light)"
          strokeWidth="2"
        />
        
        {/* Data Points */}
        {data.map((d, i) => {
          const { x, y } = getCoordinates(d.value, i)
          return (
            <motion.circle
              key={i}
              initial={{ r: 0 }}
              animate={{ r: 3 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              cx={x}
              cy={y}
              fill="var(--color-accent-light)"
            />
          )
        })}

        {/* Labels */}
        {data.map((d, i) => {
          const { x, y } = getCoordinates(115, i) // Push labels out a bit
          // Adjust text anchor based on position
          const angle = i * angleStep - Math.PI / 2
          let textAnchor: 'start' | 'middle' | 'end' = 'middle'
          let dominantBaseline: 'auto' | 'middle' | 'hanging' = 'middle'
          
          if (Math.abs(Math.cos(angle)) < 0.1) {
            textAnchor = 'middle'
          } else if (Math.cos(angle) > 0) {
            textAnchor = 'start'
          } else {
            textAnchor = 'end'
          }

          if (Math.abs(Math.sin(angle)) < 0.1) {
            dominantBaseline = 'middle'
          } else if (Math.sin(angle) > 0) {
            dominantBaseline = 'hanging'
          } else {
            dominantBaseline = 'auto' // baseline
          }

          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={textAnchor}
              dominantBaseline={dominantBaseline}
              fill="var(--color-text-muted)"
              fontSize="10"
              className="font-medium uppercase tracking-wider"
            >
              {d.label}
            </text>
          )
        })}
      </svg>
      
      {/* Legend/Tooltip could go here */}
    </div>
  )
}
