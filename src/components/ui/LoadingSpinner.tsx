'use client'

interface Props {
  /** size in pixels or preset */
  size?: number | 'sm' | 'md' | 'lg'
  /** background color class for the inner circle (defaults to bg-abyss-600) */
  bgColor?: string
  className?: string
}

export default function LoadingSpinner({ size = 'md', bgColor = 'bg-abyss-600', className = '' }: Props) {
  // convert preset sizes to pixels
  const sizeMap = { sm: 20, md: 40, lg: 80 }
  const pixels = typeof size === 'number' ? size : sizeMap[size]

  // border scales with size
  const borderWidth = pixels <= 20 ? 2 : pixels <= 40 ? 3 : 4

  return (
    <div
      className={`animate-spin rounded-full ${className}`}
      style={{
        width: pixels,
        height: pixels,
        background: `conic-gradient(from 0deg, transparent 0deg, var(--color-accent-dark) 10deg, var(--color-accent-light) 120deg, transparent 180deg)`,
        padding: borderWidth,
      }}
    >
      <div className={`w-full h-full rounded-full ${bgColor}`} />
    </div>
  )
}
