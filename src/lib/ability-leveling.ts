// Helper functions for extracting ability leveling order from match timeline data
// Timeline contains SKILL_LEVEL_UP events that tell us which ability was leveled at each level

interface TimelineEvent {
  type: string
  timestamp: number
  participantId?: number
  skillSlot?: number
  levelUpType?: string
}

interface TimelineFrame {
  timestamp: number
  participantFrames?: Record<string, any>
  events?: TimelineEvent[]
}

interface MatchTimeline {
  metadata: {
    matchId: string
    participants: string[]
  }
  info: {
    frameInterval: number
    frames: TimelineFrame[]
  }
}

/**
 * Extract ability leveling order from timeline data for a specific participant
 * @param timeline - Match timeline data from Riot API
 * @param participantId - Participant ID (1-10)
 * @returns Formatted string like "Q W E Q Q R Q W Q W R W W E E R E E" or null if unavailable
 */
export function extractAbilityOrder(
  timeline: MatchTimeline | null | undefined,
  participantId: number
): string | null {
  if (!timeline?.info?.frames) {
    return null
  }

  const skillLevelUps: Array<{ timestamp: number; skillSlot: number }> = []

  // iterate through all frames and collect SKILL_LEVEL_UP events for this participant
  for (const frame of timeline.info.frames) {
    if (!frame.events) continue

    for (const event of frame.events) {
      if (
        event.type === 'SKILL_LEVEL_UP' &&
        event.participantId === participantId &&
        event.skillSlot !== undefined &&
        event.levelUpType === 'NORMAL' // exclude EVOLVE events (e.g., Kha'Zix, Kayn)
      ) {
        skillLevelUps.push({
          timestamp: event.timestamp,
          skillSlot: event.skillSlot
        })
      }
    }
  }

  // sort by timestamp to ensure correct order
  skillLevelUps.sort((a, b) => a.timestamp - b.timestamp)

  // we just need to see which abilities were leveled and in what order
  // no minimum level requirement - any data is useful
  if (skillLevelUps.length === 0) {
    return null
  }

  // map to Q/W/E/R format
  const abilityMap: Record<number, string> = {
    1: 'Q',
    2: 'W',
    3: 'E',
    4: 'R'
  }

  return skillLevelUps.map(levelUp => abilityMap[levelUp.skillSlot] || '?').join(' ')
}

/**
 * Format ability order as human-readable string (for display purposes)
 * @param abilityOrder - String like "Q W E Q Q R Q W Q W R W W E E R E E"
 * @returns Same string (for consistency with old API)
 */
export function formatAbilityOrder(abilityOrder: string | null): string | null {
  return abilityOrder
}
