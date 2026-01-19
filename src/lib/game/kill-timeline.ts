// kill/death timeline extraction for pig score analysis
// scoring system:
// - death quality based on position (zone-based) and trades
// - gold at death = gold spent on items after death (aram only allows buying on death)
// - takedown quality (kills + assists treated the same) = inverse of enemy death quality
import type { MatchTimeline, ParticipantFrame } from '@/types/match'
import itemsData from '@/data/items.json'

const items = itemsData as Record<string, { totalCost?: number }>

// get the gold cost of an item
function getItemCost(itemId: number): number {
  const item = items[String(itemId)]
  return item?.totalCost || 0
}

// extract all item purchase events for a participant with their timestamps
function extractItemPurchaseTimestamps(
  timeline: MatchTimeline,
  participantId: number
): Array<{ timestamp: number; itemId: number; gold: number }> {
  if (!timeline?.info?.frames) return []

  const purchases: Array<{ timestamp: number; itemId: number; gold: number }> = []

  for (const frame of timeline.info.frames) {
    for (const event of frame.events || []) {
      if (event.type === 'ITEM_PURCHASED' && event.participantId === participantId && event.itemId) {
        purchases.push({
          timestamp: event.timestamp,
          itemId: event.itemId,
          gold: getItemCost(event.itemId),
        })
      }
    }
  }

  return purchases.sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Calculate gold spent after a death (until next death or end of game)
 */
export function calculateGoldSpentAfterDeath(
  deathTimestamp: number,
  nextDeathTimestamp: number | null,
  purchases: Array<{ timestamp: number; gold: number }>
): number {
  // Find purchases between this death and next death (or end of game)
  // Give a small window after death for the purchase to register (2 seconds)
  const windowStart = deathTimestamp
  const windowEnd = nextDeathTimestamp || Infinity

  let goldSpent = 0
  for (const purchase of purchases) {
    if (purchase.timestamp >= windowStart && purchase.timestamp < windowEnd) {
      goldSpent += purchase.gold
    }
  }

  return goldSpent
}

export interface KillEvent {
  timestamp: number
  killerId: number
  victimId: number
  killerTeamId: number
  victimTeamId: number
  assistingParticipantIds: number[]
  position: { x: number; y: number }
  bounty: number
  shutdownBounty: number
  victimGold: number
  victimLevel: number
  killerGold: number
  killerLevel: number
  nearbyAllyDeaths: number // ally deaths within time+distance window (same team as victim)
  nearbyEnemyDeaths: number // enemy deaths within time+distance window (for teamfight detection)
  tradeKills: number // enemy deaths within time window ANYWHERE (for trade value, no distance check)
  isTeamfight: boolean // true if total nearby deaths >= 2
}

export interface DeathAnalysis {
  timestamp: number
  gold: number
  level: number
  wasTeamfight: boolean
  wasTrade: boolean // did our team get kills around same time (anywhere)?
  tradeKills: number // how many enemy kills anywhere near this time (trade value)
  allyDeaths: number // how many allies died nearby (teamfight size)
  nearbyEnemyDeaths: number // how many enemies died nearby (teamfight outcome)
  towerLostAfter: boolean // did we lose a tower within 30s of this death?
  killedBy: number
  assists: number[]
  position: { x: number; y: number }
  zone: 'passive' | 'neutral' | 'aggressive'
  zoneScore: number // 0 = bad (passive), 50 = unknown (neutral), 100 = good (aggressive)
  qualityScore: number // 0-100 final calculated death quality (includes zone, trade, spacing)
}

export interface TakedownAnalysis {
  timestamp: number
  victimId: number
  victimGold: number
  victimLevel: number
  wasTeamfight: boolean
  wasKill: boolean // true if kill, false if assist (for display only, scored the same)
  bounty: number
  position: { x: number; y: number }
  quality: number // 0-100, based on enemy death quality (inverse)
  zoneScore: number // 0-100 from player's perspective (100 = aggressive, 0 = passive)
}

export interface PlayerKillDeathTimeline {
  participantId: number
  takedowns: TakedownAnalysis[] // kills and assists combined
  deaths: DeathAnalysis[]
  deathQualityScore: number // 0-100, 100 = all good deaths, 0 = all bad deaths
  takedownQualityScore: number // 0-100, based on enemy death quality
}

// Timing constants
const TRADE_TIME_WINDOW = 6000 // 6 seconds - if ally gets a kill within this, it's a trade
const TEAMFIGHT_TIME_WINDOW = 5000 // 5 seconds
const TEAMFIGHT_DISTANCE = 2500 // units

// ARAM map coordinates (Howling Abyss - diagonal lane)
// Map bounds: min {x: -28, y: -19}, max {x: 12849, y: 12858}
// Blue nexus is at bottom-left, Red nexus is at top-right
const ARAM_BLUE_BASE = { x: 400, y: 400 }
const ARAM_RED_BASE = { x: 12400, y: 12400 }

// ARAM tower positions (approximate lane positions as 0-1 values)
// Blue team towers (from base outward): nexus (close to base), inner (middle), outer (toward center)
// Red team towers (from center inward): outer (toward center), inner (middle), nexus (close to base)
// Positions based on visual ARAM map layout
const TOWER_POSITIONS = {
  // Blue team towers (lane position from blue base perspective)
  blue: {
    nexus: 0.08,   // nexus tower - very close to base
    inner: 0.28,   // inner tower - middle of blue side
    outer: 0.42,   // outer tower - toward center
  },
  // Red team towers (lane position from blue base perspective)
  red: {
    outer: 0.58,   // outer tower - toward center
    inner: 0.72,   // inner tower - middle of red side
    nexus: 0.92,   // nexus tower - very close to base
  }
}

interface TowerState {
  blueOuterDown: boolean
  blueInnerDown: boolean
  redOuterDown: boolean
  redInnerDown: boolean
}

/**
 * Extract tower destruction events from timeline
 */
function extractTowerDestructions(timeline: MatchTimeline): Array<{ timestamp: number; teamId: number; towerType: string }> {
  if (!timeline?.info?.frames) return []
  
  const destructions: Array<{ timestamp: number; teamId: number; towerType: string }> = []
  
  for (const frame of timeline.info.frames) {
    for (const event of frame.events || []) {
      if (event.type === 'BUILDING_KILL' && event.buildingType === 'TOWER_BUILDING') {
        destructions.push({
          timestamp: event.timestamp,
          teamId: event.teamId || 0, // team that OWNED the tower (lost it)
          towerType: event.towerType || 'UNKNOWN',
        })
      }
    }
  }
  
  return destructions.sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Get tower state at a specific timestamp
 */
function getTowerStateAtTime(
  towerDestructions: Array<{ timestamp: number; teamId: number; towerType: string }>,
  timestamp: number
): TowerState {
  const state: TowerState = {
    blueOuterDown: false,
    blueInnerDown: false,
    redOuterDown: false,
    redInnerDown: false,
  }
  
  for (const destruction of towerDestructions) {
    if (destruction.timestamp > timestamp) break
    
    // teamId = team that lost the tower
    if (destruction.teamId === 100) { // Blue team lost tower
      if (destruction.towerType === 'OUTER_TURRET') state.blueOuterDown = true
      else if (destruction.towerType === 'INNER_TURRET') state.blueInnerDown = true
    } else if (destruction.teamId === 200) { // Red team lost tower
      if (destruction.towerType === 'OUTER_TURRET') state.redOuterDown = true
      else if (destruction.towerType === 'INNER_TURRET') state.redInnerDown = true
    }
  }
  
  return state
}

/**
 * Get the current frontline positions based on tower state
 * Returns the "safe" zone boundary for each team (where their furthest standing tower is)
 */
function getFrontlines(towerState: TowerState): { blueFrontline: number; redFrontline: number } {
  // Blue team's frontline = their furthest forward standing tower
  // ARAM has: outer → inner → nexus (no inhibitor)
  let blueFrontline = TOWER_POSITIONS.blue.outer
  if (towerState.blueOuterDown) {
    blueFrontline = TOWER_POSITIONS.blue.inner
    if (towerState.blueInnerDown) {
      blueFrontline = TOWER_POSITIONS.blue.nexus
    }
  }
  
  // Red team's frontline = their furthest forward standing tower
  let redFrontline = TOWER_POSITIONS.red.outer
  if (towerState.redOuterDown) {
    redFrontline = TOWER_POSITIONS.red.inner
    if (towerState.redInnerDown) {
      redFrontline = TOWER_POSITIONS.red.nexus
    }
  }
  
  return { blueFrontline, redFrontline }
}

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
}

/**
 * Get position along the ARAM lane (0 = blue base, 1 = red base)
 */
function getLanePosition(position: { x: number; y: number }): number {
  const distToBlue = distance(position, ARAM_BLUE_BASE)
  const distToRed = distance(position, ARAM_RED_BASE)
  return distToBlue / (distToBlue + distToRed)
}

/**
 * Determine the zone where death occurred relative to player's team AND current tower state
 * 
 * Dynamic zone system based on current frontlines:
 * - Passive: Behind your team's current frontline tower (BAD - playing too safe)
 * - Neutral: Between your frontline and the midpoint (OK - contested but not pushing)
 * - Aggressive: Past the midpoint towards enemy base (GOOD - making plays/pushing)
 * 
 * The midpoint shifts dynamically as towers fall:
 * - Early game with all towers: midpoint is ~0.5 (center of map)
 * - If you lose outer tower: your frontline moves back, but midpoint also shifts
 * - If enemy loses towers: midpoint shifts towards them, more area becomes "aggressive"
 */
function getDeathZoneDynamic(
  position: { x: number; y: number },
  teamId: number,
  towerState: TowerState
): { zone: 'passive' | 'neutral' | 'aggressive'; score: number } {
  const lanePos = getLanePosition(position)
  const { blueFrontline, redFrontline } = getFrontlines(towerState)
  
  // Calculate the midpoint between the two frontlines
  const midpoint = (blueFrontline + redFrontline) / 2
  
  if (teamId === 100) {
    // Blue team player (base at low lane position)
    // Passive = behind blue frontline (closer to blue base)
    // Neutral = between blue frontline and midpoint
    // Aggressive = past the midpoint towards red base
    if (lanePos < blueFrontline) {
      return { zone: 'passive', score: 0 }
    } else if (lanePos >= midpoint) {
      return { zone: 'aggressive', score: 100 }
    } else {
      return { zone: 'neutral', score: 50 }
    }
  } else {
    // Red team player (teamId === 200) (base at high lane position)
    // Passive = behind red frontline (closer to red base)
    // Neutral = between red frontline and midpoint
    // Aggressive = past the midpoint towards blue base
    if (lanePos > redFrontline) {
      return { zone: 'passive', score: 0 }
    } else if (lanePos <= midpoint) {
      return { zone: 'aggressive', score: 100 }
    } else {
      return { zone: 'neutral', score: 50 }
    }
  }
}

/**
 * Extract all kill events with contextual data
 */
export function extractKillEvents(timeline: MatchTimeline, participantTeams: Map<number, number>): KillEvent[] {
  if (!timeline?.info?.frames) return []

  const killEvents: KillEvent[] = []
  const allKills: Array<{
    timestamp: number
    position: { x: number; y: number }
    victimId: number
    killerId: number
    victimTeamId: number
    killerTeamId: number
  }> = []

  // First pass: collect all kill events
  for (const frame of timeline.info.frames) {
    const participantFrames = frame.participantFrames || {}

    for (const event of frame.events || []) {
      if (event.type !== 'CHAMPION_KILL') continue
      if (!event.killerId || !event.victimId) continue

      const victimFrame = participantFrames[String(event.victimId)] as ParticipantFrame | undefined
      const killerFrame = participantFrames[String(event.killerId)] as ParticipantFrame | undefined

      const victimTeamId = participantTeams.get(event.victimId) || 100
      const killerTeamId = participantTeams.get(event.killerId) || 200

      allKills.push({
        timestamp: event.timestamp,
        position: event.position || { x: 0, y: 0 },
        victimId: event.victimId,
        killerId: event.killerId,
        victimTeamId,
        killerTeamId,
      })

      killEvents.push({
        timestamp: event.timestamp,
        killerId: event.killerId,
        victimId: event.victimId,
        killerTeamId,
        victimTeamId,
        assistingParticipantIds: event.assistingParticipantIds || [],
        position: event.position || { x: 0, y: 0 },
        bounty: event.bounty || 300,
        shutdownBounty: event.shutdownBounty || 0,
        victimGold: victimFrame?.currentGold || 0,
        victimLevel: victimFrame?.level || 1,
        killerGold: killerFrame?.currentGold || 0,
        killerLevel: killerFrame?.level || 1,
        nearbyAllyDeaths: 0,
        nearbyEnemyDeaths: 0,
        tradeKills: 0,
        isTeamfight: false,
      })
    }
  }

  // Second pass: calculate nearby deaths for teamfight/trade detection
  for (const kill of killEvents) {
    // Count ally deaths (same team as victim) within time AND distance - indicates teamfight
    kill.nearbyAllyDeaths = allKills.filter(
      k =>
        k.victimId !== kill.victimId &&
        k.victimTeamId === kill.victimTeamId &&
        Math.abs(k.timestamp - kill.timestamp) <= TEAMFIGHT_TIME_WINDOW &&
        distance(k.position, kill.position) <= TEAMFIGHT_DISTANCE
    ).length

    // Count enemy deaths within time AND distance - for teamfight detection
    kill.nearbyEnemyDeaths = allKills.filter(
      k =>
        k.victimTeamId === kill.killerTeamId &&
        Math.abs(k.timestamp - kill.timestamp) <= TEAMFIGHT_TIME_WINDOW &&
        distance(k.position, kill.position) <= TEAMFIGHT_DISTANCE
    ).length

    // Count enemy deaths within time window ANYWHERE - for trade value (team got something)
    kill.tradeKills = allKills.filter(
      k => k.victimTeamId === kill.killerTeamId && Math.abs(k.timestamp - kill.timestamp) <= TRADE_TIME_WINDOW
    ).length

    // Teamfight = 2+ total nearby deaths (including yourself)
    // This means at least one other person died near you
    const totalNearbyDeaths = kill.nearbyAllyDeaths + kill.nearbyEnemyDeaths
    kill.isTeamfight = totalNearbyDeaths >= 1
  }

  return killEvents
}

/**
 * Get kill/death timeline analysis for a specific player
 * Treats kills and assists the same as "takedowns" - no KDA hunting incentive
 * Uses dynamic zone boundaries based on current tower state
 */
export function getPlayerKillDeathTimeline(
  timeline: MatchTimeline,
  participantId: number,
  teamId: number,
  participantTeams: Map<number, number>
): PlayerKillDeathTimeline {
  const killEvents = extractKillEvents(timeline, participantTeams)
  
  // Extract tower destructions for dynamic zone calculation
  const towerDestructions = extractTowerDestructions(timeline)

  // Extract item purchases for gold calculation
  const purchases = extractItemPurchaseTimestamps(timeline, participantId)

  // First pass: collect all death timestamps for this player
  const playerDeathTimestamps: number[] = []
  for (const kill of killEvents) {
    if (kill.victimId === participantId) {
      playerDeathTimestamps.push(kill.timestamp)
    }
  }
  playerDeathTimestamps.sort((a, b) => a - b)

  const deaths: DeathAnalysis[] = []
  const takedowns: TakedownAnalysis[] = []
  const processedKillTimestamps = new Set<number>() // avoid double-counting kill+assist on same event

  for (const kill of killEvents) {
    // Get tower state at the time of this event
    const towerState = getTowerStateAtTime(towerDestructions, kill.timestamp)
    
    // Player died
    if (kill.victimId === participantId) {
      const { zone, score: zoneScore } = getDeathZoneDynamic(kill.position, teamId, towerState)

      // Trade kills = enemy deaths anywhere within time window (team got value)
      const tradeKills = kill.tradeKills
      const wasTrade = tradeKills > 0
      
      // Ally deaths = allies who died nearby (for teamfight detection)
      const allyDeaths = kill.nearbyAllyDeaths
      
      // Nearby enemy deaths = enemies who died in the same fight (for teamfight outcome)
      const nearbyEnemyDeaths = kill.nearbyEnemyDeaths

      // Check if ally tower was lost within 30 seconds after this death
      const TOWER_LOSS_WINDOW = 30000 // 30 seconds
      const towerLostAfter = towerDestructions.some(
        t => t.teamId === teamId && // our team's tower
            t.timestamp > kill.timestamp && // after the death
            t.timestamp <= kill.timestamp + TOWER_LOSS_WINDOW
      )

      // Find gold spent after this death (= gold held at death in ARAM)
      const deathIndex = playerDeathTimestamps.indexOf(kill.timestamp)
      const nextDeathTimestamp = deathIndex < playerDeathTimestamps.length - 1 
        ? playerDeathTimestamps[deathIndex + 1] 
        : null
      const goldSpent = calculateGoldSpentAfterDeath(kill.timestamp, nextDeathTimestamp, purchases)

      deaths.push({
        timestamp: kill.timestamp,
        gold: goldSpent, // Gold spent after death = gold held at death
        level: kill.victimLevel,
        wasTeamfight: kill.isTeamfight,
        wasTrade,
        tradeKills,
        allyDeaths,
        nearbyEnemyDeaths,
        towerLostAfter,
        killedBy: kill.killerId,
        assists: kill.assistingParticipantIds,
        position: kill.position,
        zone,
        zoneScore,
        qualityScore: 0, // Will be calculated in second pass
      })
    }

    // Player got a takedown (kill OR assist - treated the same)
    const isKill = kill.killerId === participantId
    const isAssist = kill.assistingParticipantIds.includes(participantId)

    if ((isKill || isAssist) && !processedKillTimestamps.has(kill.timestamp)) {
      processedKillTimestamps.add(kill.timestamp)

      // Takedown quality = inverse of where the enemy died from their perspective
      // Use dynamic zones based on tower state at time of kill
      const enemyDeathZone = getDeathZoneDynamic(kill.position, kill.victimTeamId, towerState)
      // If enemy died in a bad spot for them (low score), it's a good takedown for us
      const quality = 100 - enemyDeathZone.score
      
      // Get zone from player's perspective (for position display)
      const playerZone = getDeathZoneDynamic(kill.position, teamId, towerState)

      takedowns.push({
        timestamp: kill.timestamp,
        victimId: kill.victimId,
        victimGold: kill.victimGold,
        victimLevel: kill.victimLevel,
        wasTeamfight: kill.isTeamfight,
        wasKill: isKill, // for display only
        bounty: kill.bounty + kill.shutdownBounty,
        position: kill.position,
        quality,
        zoneScore: playerZone.score,
      })
    }
  }

  // Calculate death quality scores for each death
  // PHILOSOPHY: Only flag EXPLICITLY BAD deaths
  // - Aggressive zone deaths = always good (100) - we want to reward pushing
  // - Neutral/passive deaths = bad only if clearly terrible (isolated + no value)
  // - Tower loss deaths = extra penalty modifier
  // - Death spacing = indicates feeding pattern (rapid sequential bad deaths)
  
  // Sort deaths by timestamp for spacing calculation
  deaths.sort((a, b) => a.timestamp - b.timestamp)
  
  let deathQualityScore = 100 // Perfect if no deaths
  if (deaths.length > 0) {
    let previousDeathTimestamp: number | null = null

    for (let i = 0; i < deaths.length; i++) {
      const death = deaths[i]
      
      // Teamfight detection: you died AND at least one other person died nearby
      // Total team deaths (including you) vs enemy deaths determines outcome
      const teamDeaths = death.allyDeaths + 1 // +1 for yourself
      const enemyDeaths = death.nearbyEnemyDeaths
      const isTeamfight = death.wasTeamfight && (teamDeaths >= 2 || enemyDeaths >= 1)
      
      // Teamfight outcome: positive = won, negative = lost, 0 = even
      const teamfightDiff = enemyDeaths - teamDeaths
      
      let isBadDeath = false
      
      // Aggressive zone deaths are NEVER bad - we want to encourage pushing
      if (death.zone === 'aggressive') {
        isBadDeath = false // Always good
      } else if (isTeamfight) {
        // TEAMFIGHT DEATHS in neutral/passive zones
        // Only bad if we clearly lost the fight
        if (teamfightDiff >= -1) {
          // Won, tied, or only slightly lost - acceptable
          isBadDeath = false
        } else {
          // Badly lost teamfight (diff <= -2)
          if (death.zone === 'passive') {
            // Got dove and wiped - definitely bad
            isBadDeath = true
          } else {
            // Lost neutral teamfight badly - borderline, call it acceptable
            isBadDeath = false
          }
        }
      } else {
        // ISOLATED DEATH in neutral/passive zones
        if (death.tradeKills >= 1) {
          // Got value for the death - acceptable even if caught out
          isBadDeath = false
        } else {
          // Truly isolated death with no trade value in safe zones - bad
          isBadDeath = true
        }
      }
      
      // Check for tower loss - makes bad deaths even worse
      let towerLostFromDeath = false
      if (death.towerLostAfter) {
        const isIsolated = !isTeamfight && death.tradeKills === 0
        if (isIsolated) {
          // Isolated death that directly cost tower = definitely bad
          isBadDeath = true
          towerLostFromDeath = true
        }
      }
      
      // Death spacing check - dying rapidly indicates feeding
      let isRapidDeath = false
      if (previousDeathTimestamp !== null) {
        const timeSinceLastDeath = (death.timestamp - previousDeathTimestamp) / 1000 // in seconds
        if (timeSinceLastDeath < 45) {
          isRapidDeath = true
        }
      }
      
      // Calculate final score:
      // - Good death = 100
      // - Bad death = 40 (or 0 if tower lost)
      // - Rapid bad death = 20 (or 0 if tower lost)
      let deathValue: number
      if (!isBadDeath) {
        deathValue = 100 // Good death
      } else {
        if (towerLostFromDeath) {
          deathValue = 0 // Terrible - cost us a tower
        } else if (isRapidDeath && isBadDeath) {
          deathValue = 20 // Bad death + feeding pattern
        } else {
          deathValue = 40 // Just a bad death
        }
      }
      
      // Store the calculated quality score in the death object
      death.qualityScore = deathValue

      previousDeathTimestamp = death.timestamp
    }
    
    // Calculate overall death quality score
    // Simple average - good deaths (100) pull up score, bad deaths (0-40) pull down
    const totalScore = deaths.reduce((sum, d) => sum + (d.qualityScore ?? 0), 0)
    deathQualityScore = Math.round(totalScore / deaths.length)
  }

  // Calculate takedown quality score (inverse of enemy death quality)
  let takedownQualityScore = 50 // Neutral if no takedowns
  if (takedowns.length > 0) {
    const totalTakedownQuality = takedowns.reduce((sum, t) => sum + t.quality, 0)
    takedownQualityScore = Math.round(totalTakedownQuality / takedowns.length)
  }

  return {
    participantId,
    takedowns,
    deaths,
    deathQualityScore,
    takedownQualityScore,
  }
}

/**
 * Get simplified kill/death summary for storage
 */
export interface KillDeathSummary {
  takedowns: Array<{
    t: number // timestamp in seconds
    gold: number // victim gold
    tf: boolean // teamfight
    wasKill: boolean // true if kill, false if assist (display only)
    pos: number // 0-100 zone score (0 = passive, 50 = neutral, 100 = aggressive) - accounts for team side and tower state
    value: number // 0-100 takedown quality
    x: number // raw x coordinate for map display
    y: number // raw y coordinate for map display
  }>
  deaths: Array<{
    t: number
    gold: number // player gold at death
    tf: boolean // teamfight
    trade: boolean // was it a trade
    tradeKills: number // how many enemies died
    zone: string // zone name ('passive' | 'neutral' | 'aggressive')
    pos: number // 0-100 zone score (0 = passive, 50 = neutral, 100 = aggressive) - accounts for team side and tower state
    value: number // 0-100 death quality (100 = good death, 0 = bad death)
    x: number // raw x coordinate for map display
    y: number // raw y coordinate for map display
  }>
  towers: Array<{
    t: number // timestamp in seconds
    x: number // raw x coordinate
    y: number // raw y coordinate
    team: 'ally' | 'enemy' // which team's tower was destroyed
  }>
  deathScore: number // average death quality
}

export function getKillDeathSummary(
  timeline: MatchTimeline,
  participantId: number,
  teamId: number,
  participantTeams?: Map<number, number>
): KillDeathSummary {
  // Build participant teams map if not provided
  const teams = participantTeams || new Map<number, number>()
  if (!participantTeams) {
    // In ARAM, participants 1-5 are team 100, 6-10 are team 200
    for (let i = 1; i <= 5; i++) teams.set(i, 100)
    for (let i = 6; i <= 10; i++) teams.set(i, 200)
  }

  const analysis = getPlayerKillDeathTimeline(timeline, participantId, teamId, teams)

  // Extract tower kill events
  const towers: KillDeathSummary['towers'] = []
  if (timeline?.info?.frames) {
    for (const frame of timeline.info.frames) {
      for (const event of frame.events || []) {
        if (event.type === 'BUILDING_KILL' && event.buildingType === 'TOWER_BUILDING') {
          // In ARAM, team 100 towers are blue side, team 200 are red side
          const towerTeamId = event.teamId // This is the team that LOST the tower
          const isAllyTower = towerTeamId === teamId

          towers.push({
            t: Math.floor(event.timestamp / 1000),
            x: event.position?.x || 0,
            y: event.position?.y || 0,
            team: isAllyTower ? 'ally' : 'enemy',
          })
        }
      }
    }
  }

  return {
    takedowns: analysis.takedowns.map(t => ({
      t: Math.floor(t.timestamp / 1000),
      gold: t.victimGold,
      tf: t.wasTeamfight,
      wasKill: t.wasKill,
      pos: t.zoneScore, // Use zone score (0=passive, 50=neutral, 100=aggressive)
      value: t.quality,
      x: t.position.x,
      y: t.position.y,
    })),
    deaths: analysis.deaths.map(d => {
      return {
        t: Math.floor(d.timestamp / 1000),
        gold: d.gold,
        tf: d.wasTeamfight,
        trade: d.wasTrade,
        tradeKills: d.tradeKills,
        zone: d.zone,
        pos: d.zoneScore, // Use zone score (0=passive, 50=neutral, 100=aggressive)
        value: d.qualityScore, // Use pre-calculated quality score
        x: d.position.x,
        y: d.position.y,
      }
    }),
    towers,
    deathScore: analysis.deathQualityScore,
  }
}
