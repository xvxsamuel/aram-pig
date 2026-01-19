import { MatchData, ParticipantData } from '@/types/match'
import badgeData from '@/data/badges.json'

export interface MatchLabel {
  id: string
  label: string
  description: string
  type: 'playstyle' | 'good' | 'bad' | 'social' | 'neutral' | 'mvp' | 'multikill'
  priority: number
  count?: number // for multi-kill badges
}

// special MVP badges (priority 200+, shown first with unique styling)
export const MVP_LABELS: Record<string, MatchLabel> = {
  MOG: { id: 'MOG', label: 'MOG', description: 'Most Optimized Gamer - Highest PIG Score in the match', type: 'mvp', priority: 210 },
  LTN: { id: 'LTN', label: 'LTN', description: "Losing Team's No. 1 - Highest PIG Score on losing team", type: 'mvp', priority: 200 },
}

// multi-kill badges (high priority to show before other badges)
export const MULTIKILL_LABELS: Record<string, MatchLabel> = {
  DOUBLE_KILL: { id: 'DOUBLE_KILL', label: 'Double Kill', description: 'Achieved double kills', type: 'multikill', priority: 105 },
  TRIPLE_KILL: { id: 'TRIPLE_KILL', label: 'Triple Kill', description: 'Achieved triple kills', type: 'multikill', priority: 106 },
  QUADRA_KILL: { id: 'QUADRA_KILL', label: 'Quadra Kill', description: 'Achieved quadra kills', type: 'multikill', priority: 107 },
  PENTA_KILL: { id: 'PENTA_KILL', label: 'Penta Kill', description: 'Achieved penta kills', type: 'multikill', priority: 108 },
}

export const LABELS: Record<string, MatchLabel> = {
  KING_PIG: { id: 'KING_PIG', label: 'King Pig', description: 'Achieved a perfect PIG Score of 100', type: 'good', priority: 100 },
  MALIGNANT_GROWTH: { id: 'MALIGNANT_GROWTH', label: 'Malignant Growth', description: 'Built Malignance on a champion with poor synergy', type: 'bad', priority: 30 },
  HEARTSTUCK: { id: 'HEARTSTUCK', label: 'Heartstuck', description: 'Built Heartsteel on a bad champion', type: 'bad', priority: 20 },
  QUICKSHOT: { id: 'QUICKSHOT', label: 'Quickshot', description: 'Game finished in under 12 minutes', type: 'good', priority: 60 },
  STUNNING: { id: 'STUNNING', label: 'Stunning', description: 'High Crowd Control Score (>40s)', type: 'good', priority: 80 },
  DPS_THREAT: { id: 'DPS_THREAT', label: 'DPS Threat', description: 'High Damage Per Minute (>2500)', type: 'good', priority: 75 },
  WILL_DIE_ALONE: { id: 'WILL_DIE_ALONE', label: 'Will Die Alone', description: 'Many deaths (>10) with few assists (<5)', type: 'bad', priority: 50 },
  LOOK_WHOS_BACK: { id: 'LOOK_WHOS_BACK', label: "Look Who's Back", description: 'Dealt over 40% of team damage', type: 'good', priority: 70 },
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

  // king pig - requires perfect score (implies both ARAM_ACADEMIC and VALUE_VIRTUOSO)
  if (participant.pigScore && participant.pigScore >= 100) {
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

  // look who's back - dealt over 40% of team damage
  const teamParticipants = match.info.participants.filter(p => p.teamId === participant.teamId)
  const teamDamage = teamParticipants.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0)
  const damageShare = teamDamage > 0 ? participant.totalDamageDealtToChampions / teamDamage : 0
  if (damageShare > 0.4) {
    labels.push(LABELS.LOOK_WHOS_BACK)
  }
  
  // rough game - low KDA
  if (kda < 1) {
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

  // NOTE: MOG/LTN badges are NOT calculated here - they require all participants' pig scores
  // which are only available in OverviewTab where they're fetched separately.
  // See OverviewTab.tsx for MOG/LTN display logic.

  // multi-kill badges with counts
  if (participant.pentaKills && participant.pentaKills > 0) {
    labels.push({ ...MULTIKILL_LABELS.PENTA_KILL, count: participant.pentaKills })
  }
  if (participant.quadraKills && participant.quadraKills > 0) {
    labels.push({ ...MULTIKILL_LABELS.QUADRA_KILL, count: participant.quadraKills })
  }
  if (participant.tripleKills && participant.tripleKills > 0) {
    labels.push({ ...MULTIKILL_LABELS.TRIPLE_KILL, count: participant.tripleKills })
  }
  if (participant.doubleKills && participant.doubleKills > 0) {
    labels.push({ ...MULTIKILL_LABELS.DOUBLE_KILL, count: participant.doubleKills })
  }

  return labels.sort((a, b) => b.priority - a.priority)
}

/**
 * Calculate MOG/LTN badges based on enriched pig scores from MatchDetails
 * @param match - The match data
 * @param participant - The participant to check for MOG/LTN
 * @param pigScores - Map of puuid -> pig score (from MatchDetails enrichment)
 * @returns Array of MOG/LTN labels (0-1 items)
 */
export function calculateMvpLabels(
  match: MatchData,
  participant: ParticipantData,
  pigScores: Map<string, number | null>
): MatchLabel[] {
  const labels: MatchLabel[] = []
  
  // check if all participants have pig scores
  const allHaveScores = match.info.participants.every(p => {
    const score = pigScores.get(p.puuid)
    return score !== null && score !== undefined
  })
  
  if (!allHaveScores) return labels
  
  const participantScore = pigScores.get(participant.puuid)
  if (participantScore === null || participantScore === undefined) return labels
  
  const participantTeamWon = participant.win
  
  // find winning and losing teams
  const winningTeam = match.info.participants.filter(p => p.win)
  const losingTeam = match.info.participants.filter(p => !p.win)
  
  // find highest score in each team
  const getHighestScore = (team: ParticipantData[]): number => {
    let highest = -1
    for (const p of team) {
      const score = pigScores.get(p.puuid)
      if (score !== null && score !== undefined && score > highest) {
        highest = score
      }
    }
    return highest
  }
  
  const highestWinning = getHighestScore(winningTeam)
  const highestLosing = getHighestScore(losingTeam)
  
  // MOG = highest on winning team (which is also highest in match)
  if (participantTeamWon && participantScore === highestWinning) {
    labels.push(MVP_LABELS.MOG)
  }
  // LTN = highest on losing team (but not the overall highest)
  else if (!participantTeamWon && participantScore === highestLosing) {
    labels.push(MVP_LABELS.LTN)
  }
  
  return labels
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
      // skip MOG/LTN for profile badges (they don't aggregate well across matches)
      if (label.type === 'mvp') continue
      // skip double/triple/quadra kills for profile, only show pentas
      if (label.id === 'DOUBLE_KILL' || label.id === 'TRIPLE_KILL' || label.id === 'QUADRA_KILL') continue
      
      const existing = badgeCounts.get(label.id)
      if (existing) {
        // for penta kills, sum the actual count (how many pentas total)
        if (label.id === 'PENTA_KILL' && label.count) {
          existing.count += label.count
        } else {
          existing.count++
        }
      } else {
        // for penta kills, use the actual count from the first game
        const initialCount = label.id === 'PENTA_KILL' && label.count ? label.count : 1
        badgeCounts.set(label.id, { label, count: initialCount })
      }
    }
  }

  // filter to badges that appear at least minOccurrences times
  // exceptions: King Pig and Penta Kill always show (even with 1 occurrence)
  const frequentBadges: ProfileBadge[] = []
  for (const { label, count } of badgeCounts.values()) {
    if (count >= minOccurrences || label.id === 'KING_PIG' || label.id === 'PENTA_KILL') {
      frequentBadges.push({ ...label, count })
    }
  }

  // sort by priority (highest first), then by count
  return frequentBadges.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.count - a.count
  })
}
