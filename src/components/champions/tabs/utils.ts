// shared utilities for Champion Detail Tabs
import { calculateWilsonScore as calculateWilsonScoreFromWinrate } from '@/lib/scoring/build-scoring'

/**
 * converts ability order string to display format
 * returns array of abilities in max order
 */
export function getAbilityMaxOrder(abilityOrder: string): string[] {
  if (!abilityOrder || abilityOrder.trim() === '') return ['Q', 'W', 'E']

  // if it's already a short format like "qew", "qwe", etc., just format it
  const cleaned = abilityOrder.toLowerCase().replace(/[^qwe]/g, '')

  if (cleaned.length <= 3) {
    // short format: "qew" -> ["Q", "E", "W"]
    const abilities = cleaned.split('').map(c => c.toUpperCase())

    // ensure we have all 3 abilities
    if (abilities.length < 3) {
      const missing = ['Q', 'W', 'E'].filter(a => !abilities.includes(a))
      abilities.push(...missing)
    }

    return abilities.slice(0, 3)
  }

  // if it's a long format like "Q W E Q W R Q W Q W R W W E E R E E", parse it
  const parts = abilityOrder.split(/[\s.]+/)
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []

  for (const ability of parts) {
    const upper = ability.toUpperCase()
    if (upper in counts) {
      counts[upper as keyof typeof counts]++
      if (upper !== 'R' && counts[upper as keyof typeof counts] === 5) {
        maxOrder.push(upper)
      }
    }
  }

  // normalize incomplete orders
  if (maxOrder.length === 0) {
    const sorted = (['Q', 'W', 'E'] as ('Q' | 'W' | 'E')[]).sort((a, b) => counts[b] - counts[a])
    return sorted
  }
  if (maxOrder.length === 1) {
    const remaining = ['Q', 'W', 'E'].filter(a => !maxOrder.includes(a))
    remaining.sort((a, b) => counts[b as keyof typeof counts] - counts[a as keyof typeof counts])
    return [maxOrder[0], remaining[0], remaining[1]]
  }
  if (maxOrder.length === 2) {
    const remaining = ['Q', 'W', 'E'].find(a => !maxOrder.includes(a))
    if (remaining) maxOrder.push(remaining)
  }

  return maxOrder.slice(0, 3)
}

/**
 * wilson score lower bound (95% confidence)
 * wrapper for the shared Wilson score calculation that takes (games, wins) instead of (winrate, games)
 */
export function calculateWilsonScore(games: number, wins: number): number {
  if (games === 0) return 0
  const winrate = (wins / games) * 100
  return calculateWilsonScoreFromWinrate(winrate, games)
}
