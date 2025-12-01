// Kill/death timeline extraction for PIG score analysis
import type { MatchTimeline, ParticipantFrame } from '@/types/match'

export interface KillEvent {
  timestamp: number
  killerId: number
  victimId: number
  assistingParticipantIds: number[]
  position: { x: number; y: number }
  bounty: number
  shutdownBounty: number
  // contextual data
  victimGold: number // gold victim had at time of death (more gold = longer alive = worse death)
  victimLevel: number
  killerGold: number
  killerLevel: number
  // proximity analysis
  nearbyDeaths: number // deaths within 3 seconds and 1500 units (teamfight indicator)
  isTeamfightDeath: boolean
}

export interface DeathAnalysis {
  timestamp: number
  gold: number // how much gold player had (long map time indicator)
  level: number
  wasTeamfight: boolean
  nearbyTeamDeaths: number
  killedBy: number
  assists: number[]
  position: { x: number; y: number }
  // grading factors
  goldPenalty: number // 0-1, higher gold = higher penalty (died with full pockets)
  teamfightBonus: number // 0-1, teamfight deaths are less punishing
  positionScore: number // 0-1, dying in enemy territory = good (diving), own territory = bad
}

export interface KillAnalysis {
  timestamp: number
  victimId: number
  victimGold: number
  victimLevel: number
  wasTeamfightKill: boolean
  assists: number[]
  bounty: number
  position: { x: number; y: number }
  // grading factors
  goldValue: number // 0-1, killing high-gold target = more valuable
  positionScore: number // 0-1, killing in own territory = good (defending), enemy territory = meh
}

export interface PlayerKillDeathTimeline {
  participantId: number
  kills: KillAnalysis[]
  deaths: DeathAnalysis[]
  assists: Array<{ timestamp: number; killerId: number; victimId: number }>
  // aggregate scores
  deathQualityScore: number // 0-100, how "good" were the deaths (teamfights, low gold)
  killQualityScore: number // 0-100, how valuable were the kills
}

const TEAMFIGHT_TIME_WINDOW = 5000 // 5 seconds
const TEAMFIGHT_DISTANCE = 2000 // units
const HIGH_GOLD_THRESHOLD = 2500 // gold threshold for "full pockets"

// ARAM map coordinates (Howling Abyss runs diagonally)
// Blue base (team 100): ~(2500, 2500) - bottom left
// Red base (team 200): ~(12500, 12500) - top right
// Map center: ~(7500, 7500)
const ARAM_BLUE_BASE = { x: 2500, y: 2500 }
const ARAM_RED_BASE = { x: 12500, y: 12500 }
// const ARAM_MAP_LENGTH = 14142 // diagonal distance between bases (unused for now)

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
}

/**
 * Calculate position score for death/kill
 * Returns 0-1 where higher = more aggressive play (in enemy territory)
 * - For deaths: 1 = died in enemy territory (diving = good), 0 = died at own base (bad)
 * - For kills: 1 = killed in enemy territory (pushing/diving = good), 0 = killed at own base (getting pushed = bad)
 */
function getPositionScore(position: { x: number; y: number }, teamId: number): number {
  const distToBlue = distance(position, ARAM_BLUE_BASE)
  const distToRed = distance(position, ARAM_RED_BASE)

  // normalize to 0-1 (0 = at blue base, 1 = at red base)
  const positionRatio = distToBlue / (distToBlue + distToRed)

  if (teamId === 100) {
    // blue team: being near red base (high ratio) = aggressive/good
    return positionRatio
  } else {
    // red team: being near blue base (low ratio) = aggressive/good
    return 1 - positionRatio
  }
}

/**
 * Extract all kill events with contextual data
 */
export function extractKillEvents(timeline: MatchTimeline): KillEvent[] {
  if (!timeline?.info?.frames) return []

  const killEvents: KillEvent[] = []
  const allKillTimestamps: Array<{ timestamp: number; position: { x: number; y: number }; victimId: number }> = []

  // first pass: collect all kill events
  for (const frame of timeline.info.frames) {
    const participantFrames = frame.participantFrames || {}

    for (const event of frame.events || []) {
      if (event.type !== 'CHAMPION_KILL') continue
      if (!event.killerId || !event.victimId) continue

      const victimFrame = participantFrames[String(event.victimId)] as ParticipantFrame | undefined
      const killerFrame = participantFrames[String(event.killerId)] as ParticipantFrame | undefined

      allKillTimestamps.push({
        timestamp: event.timestamp,
        position: event.position || { x: 0, y: 0 },
        victimId: event.victimId,
      })

      killEvents.push({
        timestamp: event.timestamp,
        killerId: event.killerId,
        victimId: event.victimId,
        assistingParticipantIds: event.assistingParticipantIds || [],
        position: event.position || { x: 0, y: 0 },
        bounty: event.bounty || 300,
        shutdownBounty: event.shutdownBounty || 0,
        victimGold: victimFrame?.currentGold || 0,
        victimLevel: victimFrame?.level || 1,
        killerGold: killerFrame?.currentGold || 0,
        killerLevel: killerFrame?.level || 1,
        nearbyDeaths: 0,
        isTeamfightDeath: false,
      })
    }
  }

  // second pass: calculate nearby deaths for teamfight detection
  for (const kill of killEvents) {
    kill.nearbyDeaths = allKillTimestamps.filter(
      k =>
        k.victimId !== kill.victimId &&
        Math.abs(k.timestamp - kill.timestamp) <= TEAMFIGHT_TIME_WINDOW &&
        distance(k.position, kill.position) <= TEAMFIGHT_DISTANCE
    ).length

    kill.isTeamfightDeath = kill.nearbyDeaths >= 2 // 3+ deaths nearby = teamfight
  }

  return killEvents
}

/**
 * Get kill/death timeline analysis for a specific player
 */
export function getPlayerKillDeathTimeline(
  timeline: MatchTimeline,
  participantId: number,
  teamId: number // 100 or 200
): PlayerKillDeathTimeline {
  const killEvents = extractKillEvents(timeline)

  const deaths: DeathAnalysis[] = []
  const kills: KillAnalysis[] = []
  const assists: Array<{ timestamp: number; killerId: number; victimId: number }> = []

  // find max gold in game for normalization
  let maxGoldSeen = HIGH_GOLD_THRESHOLD
  for (const frame of timeline.info?.frames || []) {
    for (const [, pf] of Object.entries(frame.participantFrames || {})) {
      const pFrame = pf as ParticipantFrame
      if (pFrame.currentGold > maxGoldSeen) {
        maxGoldSeen = pFrame.currentGold
      }
    }
  }

  for (const kill of killEvents) {
    // player died
    if (kill.victimId === participantId) {
      // gold penalty: dying with lots of gold is bad (0 = no gold, 1 = lots of gold)
      const goldPenalty = Math.min(kill.victimGold / maxGoldSeen, 1)

      // teamfight bonus: dying in teamfight is less punishing (0 = solo death, 1 = big teamfight)
      const teamfightBonus = kill.isTeamfightDeath ? Math.min(kill.nearbyDeaths / 4, 1) : 0

      // position score: dying in enemy territory = aggressive play (good), own territory = bad
      const positionScore = getPositionScore(kill.position, teamId)

      deaths.push({
        timestamp: kill.timestamp,
        gold: kill.victimGold,
        level: kill.victimLevel,
        wasTeamfight: kill.isTeamfightDeath,
        nearbyTeamDeaths: kill.nearbyDeaths,
        killedBy: kill.killerId,
        assists: kill.assistingParticipantIds,
        position: kill.position,
        goldPenalty,
        teamfightBonus,
        positionScore,
      })
    }

    // player got a kill
    if (kill.killerId === participantId) {
      // gold value: killing someone with lots of gold is more valuable
      const goldValue = Math.min(kill.victimGold / maxGoldSeen, 1)

      // position score: killing in enemy territory = pushing/diving (good), own territory = getting pushed
      const positionScore = getPositionScore(kill.position, teamId)

      kills.push({
        timestamp: kill.timestamp,
        victimId: kill.victimId,
        victimGold: kill.victimGold,
        victimLevel: kill.victimLevel,
        wasTeamfightKill: kill.isTeamfightDeath,
        assists: kill.assistingParticipantIds,
        bounty: kill.bounty + kill.shutdownBounty,
        position: kill.position,
        goldValue,
        positionScore,
      })
    }

    // player assisted
    if (kill.assistingParticipantIds.includes(participantId)) {
      assists.push({
        timestamp: kill.timestamp,
        killerId: kill.killerId,
        victimId: kill.victimId,
      })
    }
  }

  // calculate aggregate scores
  let deathQualityScore = 100 // start at 100, subtract for bad deaths
  if (deaths.length > 0) {
    let totalDeathPenalty = 0
    for (const death of deaths) {
      // base penalty for dying
      let penalty = 8

      // additional penalty for dying with gold (up to +8)
      penalty += death.goldPenalty * 8

      // reduce penalty for teamfight deaths (up to -6)
      penalty -= death.teamfightBonus * 6

      // reduce penalty for aggressive position deaths (diving) (up to -5)
      penalty -= death.positionScore * 5

      totalDeathPenalty += Math.max(penalty, 2) // minimum 2 points per death
    }
    deathQualityScore = Math.max(0, 100 - totalDeathPenalty)
  }

  let killQualityScore = 50 // neutral starting point
  if (kills.length > 0) {
    let totalKillValue = 0
    for (const kill of kills) {
      // base value for kill
      let value = 4

      // bonus for high-gold kills (+4 max) - denying enemy resources
      value += kill.goldValue * 4

      // bonus for defensive kills (+2 max) - protecting your side
      value += kill.positionScore * 2

      totalKillValue += value
    }
    killQualityScore = Math.min(100, 50 + totalKillValue)
  }

  return {
    participantId,
    kills,
    deaths,
    assists,
    deathQualityScore,
    killQualityScore,
  }
}

/**
 * Get simplified kill/death summary for storage
 */
export interface KillDeathSummary {
  kills: Array<{
    t: number // timestamp in seconds
    gold: number // victim gold
    tf: boolean // teamfight
    pos: number // 0-100 position score (higher = killed in enemy territory/pushing)
    value: number // 0-100 quality value based on victim gold
  }>
  deaths: Array<{
    t: number
    gold: number // player gold at death
    tf: boolean
    pos: number // 0-100 position score (higher = died in enemy territory/pushing)
    value: number // 0-100 quality value (lower = worse death)
  }>
  deathScore: number
  killScore: number
}

export function getKillDeathSummary(timeline: MatchTimeline, participantId: number, teamId: number): KillDeathSummary {
  const analysis = getPlayerKillDeathTimeline(timeline, participantId, teamId)

  return {
    kills: analysis.kills.map(k => {
      // kills in ARAM are mostly teamfight cleanup - base value is neutral (50)
      // slight bonus for catching high-gold enemies (they made a mistake)
      // bonus for defensive kills (protecting your side)
      let value = 50
      if (!k.wasTeamfightKill) {
        value += k.goldValue * 10 // bonus for high-gold pick
      }
      value += k.positionScore * 5 // bonus for defending own side

      return {
        t: Math.floor(k.timestamp / 1000),
        gold: k.victimGold,
        tf: k.wasTeamfightKill,
        pos: Math.round(k.positionScore * 100),
        value: Math.round(Math.min(70, value)), // cap at 70 - kills aren't super differentiated
      }
    }),
    deaths: analysis.deaths.map(d => {
      // base death value: 50 (neutral)
      // teamfight deaths: +10 bonus (acceptable)
      // high gold penalty: -20 (bad to die with full pockets)
      // position bonus: +15 for diving (aggressive death is ok), -15 for dying at base
      let value = 50
      if (d.wasTeamfight) {
        value += 10 // teamfight deaths are fine
      } else {
        value -= d.goldPenalty * 20 // non-teamfight deaths with gold are bad
      }
      // position modifier: dying in enemy territory = good (diving), own territory = bad
      value += (d.positionScore - 0.5) * 30 // -15 to +15 based on position

      return {
        t: Math.floor(d.timestamp / 1000),
        gold: d.gold,
        tf: d.wasTeamfight,
        pos: Math.round(d.positionScore * 100),
        value: Math.round(Math.max(20, Math.min(75, value))), // clamp 20-75
      }
    }),
    deathScore: Math.round(analysis.deathQualityScore),
    killScore: Math.round(analysis.killQualityScore),
  }
}
