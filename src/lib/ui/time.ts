// time-related utilities

/** one year in milliseconds */
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

/**
 * formats a timestamp into a human-readable "time ago" string
 * @param timestamp - Date, timestamp string, or number (ms)
 * @returns formatted string like "2h ago", "3d ago", or "just now"
 */
export function getTimeAgo(timestamp: Date | string | number | null): string {
  if (!timestamp) return ''

  const now = Date.now()
  const time = timestamp instanceof Date
    ? timestamp.getTime()
    : typeof timestamp === 'number'
      ? timestamp
      : new Date(timestamp).getTime()

  const diffMs = now - time
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

/**
 * formats a timestamp with longer time unit names (e.g., "2 hours ago")
 * @param timestamp - Date, timestamp string, or number (ms)
 * @returns formatted string like "2 hours ago", "3 days ago"
 */
export function getTimeAgoLong(timestamp: Date | string | number | null): string {
  if (!timestamp) return 'Unknown'

  const now = Date.now()
  const time = timestamp instanceof Date
    ? timestamp.getTime()
    : typeof timestamp === 'number'
      ? timestamp
      : new Date(timestamp).getTime()

  const diffMs = now - time
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  return 'just now'
}

/**
 * formats game duration in seconds to "Xm Ys" format
 * @param durationSeconds - game duration in seconds
 * @returns formatted string like "18m 32s"
 */
export function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60)
  const seconds = Math.floor(durationSeconds % 60)
  return `${minutes}m ${seconds}s`
}

/**
 * formats game duration in seconds to just minutes (whole number)
 * @param durationSeconds - game duration in seconds
 * @returns formatted string like "18m"
 */
export function formatDurationMinutes(durationSeconds: number): string {
  return `${Math.floor(durationSeconds / 60)}m`
}

/**
 * calculates per-minute rate for a stat
 * @param value - the stat value
 * @param durationSeconds - game duration in seconds
 * @returns value per minute
 */
export function perMinute(value: number, durationSeconds: number): number {
  return value / (durationSeconds / 60)
}
