// ability leveling extraction from match timeline
import type { MatchTimeline } from '@/types/match'

// extract ability leveling order from timeline data for a specific participant
// @param timeline - match timeline data from riot api
// @param participantid - participant id (1-10)
// @returns formatted string like "q w e q q r q w q w r w w e e r e e" or null if unavailable
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

// format ability order as human-readable string
export function formatAbilityOrder(abilityOrder: string | null): string | null {
  return abilityOrder
}
