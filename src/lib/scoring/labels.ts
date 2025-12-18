import { MatchData, ParticipantData } from '@/types/match'

export interface MatchLabel {
  id: string
  label: string
  description: string
  type: 'playstyle' | 'good' | 'bad' | 'social' | 'neutral'
  priority: number
}

export const LABELS: Record<string, MatchLabel> = {
  KING_PIG: { id: 'KING_PIG', label: 'King Pig', description: 'PIG Score 90+', type: 'good', priority: 100 },
  MALIGNANT_GROWTH: { id: 'MALIGNANT_GROWTH', label: 'Malignant Growth', description: 'Built Malignance on a loss', type: 'bad', priority: 30 },
  HEARTSTUCK: { id: 'HEARTSTUCK', label: 'Heartstuck', description: 'Built Heartsteel on a loss', type: 'bad', priority: 20 },
  QUICKSHOT: { id: 'QUICKSHOT', label: 'Quickshot', description: 'Game under 12 minutes', type: 'good', priority: 60 },
  STUNNING: { id: 'STUNNING', label: 'Stunning', description: 'High CC Score', type: 'good', priority: 80 },
  DPS_THREAT: { id: 'DPS_THREAT', label: 'DPS Threat', description: 'High Damage Per Minute', type: 'good', priority: 75 },
  WILL_DIE_ALONE: { id: 'WILL_DIE_ALONE', label: 'Will Die Alone', description: 'Many deaths, few assists', type: 'bad', priority: 50 },
  LOOK_WHOS_BACK: { id: 'LOOK_WHOS_BACK', label: "Look Who's Back", description: 'High KDA', type: 'good', priority: 70 },
  ROUGH_GAME: { id: 'ROUGH_GAME', label: 'Rough Game', description: 'Low KDA', type: 'bad', priority: 40 },
  ARAM_ACADEMIC: { id: 'ARAM_ACADEMIC', label: 'ARAM Academic', description: 'High Build Score', type: 'good', priority: 85 },
  VALUE_VIRTUOSO: { id: 'VALUE_VIRTUOSO', label: 'Value Virtuoso', description: 'High Performance Score', type: 'good', priority: 90 },
}

export function calculateMatchLabels(match: MatchData, participant: ParticipantData): MatchLabel[] {
  const labels: MatchLabel[] = []
  const items = [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5]
  const durationMin = match.info.gameDuration / 60
  const dpm = participant.totalDamageDealtToChampions / durationMin
  const kda = participant.deaths === 0 ? 100 : (participant.kills + participant.assists) / participant.deaths

  // King Pig
  if (participant.pigScore && participant.pigScore >= 90) {
    labels.push(LABELS.KING_PIG)
  }

  // Malignant Growth (3118)
  if (items.includes(3118) && !participant.win) {
    labels.push(LABELS.MALIGNANT_GROWTH)
  }

  // Heartstuck (3084)
  if (items.includes(3084) && !participant.win) {
    labels.push(LABELS.HEARTSTUCK)
  }

  // Quickshot
  if (durationMin < 12) {
    labels.push(LABELS.QUICKSHOT)
  }

  // Stunning (CC Score > 40)
  if (participant.timeCCingOthers && participant.timeCCingOthers > 40) {
    labels.push(LABELS.STUNNING)
  }

  // DPS Threat
  if (dpm > 2500) {
    labels.push(LABELS.DPS_THREAT)
  }

  // Will Die Alone
  if (participant.deaths > 10 && participant.assists < 5) {
    labels.push(LABELS.WILL_DIE_ALONE)
  }

  // Look Who's Back
  if (kda > 10) {
    labels.push(LABELS.LOOK_WHOS_BACK)
  } else if (kda < 1) {
    labels.push(LABELS.ROUGH_GAME)
  }

  // ARAM Academic & Value Virtuoso
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
