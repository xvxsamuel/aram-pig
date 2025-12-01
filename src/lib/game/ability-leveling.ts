// Ability leveling extraction from match timeline
import type { MatchTimeline } from '@/types/match'

/**
 * Extract ability leveling order from timeline data for a specific participant
 * @param timeline - Match timeline data from Riot API
 * @param participantId - Participant ID (1-10)
 * @returns Formatted string like "Q W E Q Q R Q W Q W R W W E E R E E" or null if unavailable
 */
export function extractAbilityOrder(timeline: MatchTimeline | null | undefined, participantId: number): string | null {
  if (!timeline?.info?.frames) {
    return null
  }

  const skillLevelUps: Array<{ timestamp: number; skillSlot: number }> = []

  for (const frame of timeline.info.frames) {
    if (!frame.events) continue

    for (const event of frame.events) {
      const evt = event as {
        type: string
        participantId?: number
        skillSlot?: number
        levelUpType?: string
        timestamp: number
      }
      if (
        evt.type === 'SKILL_LEVEL_UP' &&
        evt.participantId === participantId &&
        evt.skillSlot !== undefined &&
        evt.levelUpType === 'NORMAL'
      ) {
        skillLevelUps.push({
          timestamp: evt.timestamp,
          skillSlot: evt.skillSlot,
        })
      }
    }
  }

  skillLevelUps.sort((a, b) => a.timestamp - b.timestamp)

  if (skillLevelUps.length === 0) {
    return null
  }

  const abilityMap: Record<number, string> = {
    1: 'Q',
    2: 'W',
    3: 'E',
    4: 'R',
  }

  return skillLevelUps.map(levelUp => abilityMap[levelUp.skillSlot] || '?').join(' ')
}

/**
 * Format ability order as human-readable string
 */
export function formatAbilityOrder(abilityOrder: string | null): string | null {
  return abilityOrder
}
