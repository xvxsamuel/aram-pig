"use client"
import { clsx } from "clsx"

type Props = {
  value?: string
  className?: string
  onClick?: () => void
  title?: string
  isOpen?: boolean
}

export default function RegionSelector({
  value = "EUW",
  className = "",
  onClick,
  isOpen = false,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Region: ${value}. Change region`}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      className={clsx("flex items-center justify-center h-[65%] aspect-[15/7] rounded-xl bg-gradient-to-t from-accent-r-dark to-accent-r-light text-white cursor-pointer tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-white/30", className)}
    >
      <span style={{ fontFamily: 'Amiamie, sans-serif', display: 'block', transform: 'translateY(12.5%)', lineHeight: 1 }}>
        {value.toUpperCase()}
      </span>
    </button>
  )
}