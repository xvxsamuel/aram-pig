'use client'

type Props = {
  value?: string          // Display text, e.g. "EUW"
  className?: string
  onClick?: () => void    // Open menu or cycle regions
  title?: string
}

export default function RegionSelector({
  value = 'EUW',
  className = '',
  onClick,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Region: ${value}. Change region`}
      aria-haspopup="menu"
      className={`inline-flex items-center justify-center h-9 px-4 rounded-xl
                  bg-gradient-to-t from-accent-r-dark to-accent-r-light
                  text-white cursor-pointer font-bold tracking-wide 
                  outline-none focus-visible:ring-2 focus-visible:ring-white/30
                  ${className}`}
    >
      {value.toUpperCase()}
    </button>
  )
}