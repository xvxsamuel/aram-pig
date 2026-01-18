import { MatchData, ParticipantData } from '@/types/match'
import badgeData from '@/data/badges.json'

export interface MatchLabel {
  id: string
  label: string
  description: string
  type: 'playstyle' | 'good' | 'bad' | 'social' | 'neutral'
  priority: number
}

export const LABELS: Record<string, MatchLabel> = {
  KING_PIG: { id: 'KING_PIG', label: 'King Pig', description: 'Achieved a PIG Score of 90 or higher', type: 'good', priority: 100 },
  MALIGNANT_GROWTH: { id: 'MALIGNANT_GROWTH', label: 'Malignant Growth', description: 'Built Malignance on a champion with poor synergy', type: 'bad', priority: 30 },
  HEARTSTUCK: { id: 'HEARTSTUCK', label: 'Heartstuck', description: 'Built Heartsteel on a bad champion', type: 'bad', priority: 20 },
  QUICKSHOT: { id: 'QUICKSHOT', label: 'Quickshot', description: 'Game finished in under 12 minutes', type: 'good', priority: 60 },
  STUNNING: { id: 'STUNNING', label: 'Stunning', description: 'High Crowd Control Score (>40s)', type: 'good', priority: 80 },
  DPS_THREAT: { id: 'DPS_THREAT', label: 'DPS Threat', description: 'High Damage Per Minute (>2500)', type: 'good', priority: 75 },
  WILL_DIE_ALONE: { id: 'WILL_DIE_ALONE', label: 'Will Die Alone', description: 'Many deaths (>10) with few assists (<5)', type: 'bad', priority: 50 },
  LOOK_WHOS_BACK: { id: 'LOOK_WHOS_BACK', label: "Look Who's Back", description: 'High KDA (>10)', type: 'good', priority: 70 },
  ROUGH_GAME: { id: 'ROUGH_GAME', label: 'Rough Game', description: 'Low KDA (<1)', type: 'bad', priority: 40 },
  ARAM_ACADEMIC: { id: 'ARAM_ACADEMIC', label: 'ARAM Academic', description: 'High Build Score (90+)', type: 'good', priority: 85 },
  VALUE_VIRTUOSO: { id: 'VALUE_VIRTUOSO', label: 'Value Virtuoso', description: 'High Performance Score (90+)', type: 'good', priority: 90 },
}

export function calculateMatchLabels(
  match: MatchData, 
  participant: ParticipantData
): MatchLabel[] {
  const labels: MatchLabel[] = []
  const items = [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5]
  const durationMin = match.info.gameDuration / 60
  const dpm = participant.totalDamageDealtToChampions / durationMin
  const kda = participant.deaths === 0 ? 100 : (participant.kills + participant.assists) / participant.deaths

  // king pig
  if (participant.pigScore && participant.pigScore >= 90) {
    labels.push(LABELS.KING_PIG)
  }

  // malignant growth (3118)
  if (items.includes(3118)) {
    let isBadUser = false
    const synergies = badgeData as Record<string, { heartsteel: boolean; malignance: boolean }>
    
    if (synergies[participant.championName]) {
      isBadUser = !synergies[participant.championName].malignance
    }

    if (isBadUser) {
      labels.push(LABELS.MALIGNANT_GROWTH)
    }
  }

  // heartstuck (3084)
  if (items.includes(3084)) {
    let isBadUser = false
    const synergies = badgeData as Record<string, { heartsteel: boolean; malignance: boolean }>

    if (synergies[participant.championName]) {
      isBadUser = !synergies[participant.championName].heartsteel
    }

    if (isBadUser) {
      labels.push(LABELS.HEARTSTUCK)
    }
  }

  // quickshot
  if (durationMin < 12) {
    labels.push(LABELS.QUICKSHOT)
  }

  // stunning (cc score > 40)
  if (participant.timeCCingOthers && participant.timeCCingOthers > 40) {
    labels.push(LABELS.STUNNING)
  }

  // dps threat
  if (dpm > 2500) {
    labels.push(LABELS.DPS_THREAT)
  }

  // will die alone
  if (participant.deaths > 10 && participant.assists < 5) {
    labels.push(LABELS.WILL_DIE_ALONE)
  }

  // look who's back
  if (kda > 10) {
    labels.push(LABELS.LOOK_WHOS_BACK)
  } else if (kda < 1) {
    labels.push(LABELS.ROUGH_GAME)
  }

  // aram academic & value virtuoso
  if (participant.pigScoreBreakdown) {
    const breakdown = participant.pigScoreBreakdown as any
    if (breakdown.componentScores?.build >= 90) {
      labels.push(LABELS.ARAM_ACADEMIC)
    }
    if (breakdown.componentScores?.performance >= 90) {
      labels.push(LABELS.VALUE_VIRTUOSO)
    }
  }

  return labels.sort((a, b) => b.priority - a.priority)
}

// calculate profile-wide badges based on frequency in recent matches
export interface ProfileBadge extends MatchLabel {
  count: number
}

export function calculateProfileBadges(
  matches: { match: MatchData; participant: ParticipantData }[],
  minOccurrences: number = 3,
  maxMatches: number = 20
): ProfileBadge[] {
  const recentMatches = matches.slice(0, maxMatches)
  const badgeCounts = new Map<string, { label: MatchLabel; count: number }>()

  for (const { match, participant } of recentMatches) {
    const labels = calculateMatchLabels(match, participant)
    for (const label of labels) {
      const existing = badgeCounts.get(label.id)
      if (existing) {
        existing.count++
      } else {
        badgeCounts.set(label.id, { label, count: 1 })
      }
    }
  }

  // filter to badges that appear at least minOccurrences times
  const frequentBadges: ProfileBadge[] = []
  for (const { label, count } of badgeCounts.values()) {
    if (count >= minOccurrences) {
      frequentBadges.push({ ...label, count })
    }
  }

  // sort by priority (highest first), then by count
  return frequentBadges.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.count - a.count
  })
}
