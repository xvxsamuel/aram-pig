// Kill/death timeline extraction for PIG score analysis
// Scoring system:
// - Death quality based on POSITION (zone-based) and TRADES
// - Gold at death = gold spent on items after death (ARAM only allows buying on death)
// - Takedown quality (kills + assists treated the same) = inverse of enemy death quality
import type { MatchTimeline, ParticipantFrame } from '@/types/match'
import itemsData from '@/data/items.json'

const items = itemsData as Record<string, { totalCost?: number }>

/**
 * Get the gold cost of an item
 */
function getItemCost(itemId: number): number {
  const item = items[String(itemId)]
  return item?.totalCost || 0
}

/**
 * Extract all item purchase events for a participant with their timestamps
 */
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
 * In ARAM, you can only buy when dead, so purchases after death = gold held at death
 */
function calculateGoldSpentAfterDeath(
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
  nearbyAllyDeaths: number // ally deaths within window (same team as victim)
  nearbyEnemyDeaths: number // enemy deaths within window (same team as killer = trades)
  isTeamfight: boolean
}

export interface DeathAnalysis {
  timestamp: number
  gold: number
  level: number
  wasTeamfight: boolean
  wasTrade: boolean // did our team get kills around same time?
  tradeKills: number // how many enemy kills near this death
  killedBy: number
  assists: number[]
  position: { x: number; y: number }
  zone: 'passive' | 'neutral' | 'aggressive'
  zoneScore: number // 0 = bad (passive), 50 = unknown (neutral), 100 = good (aggressive)
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
// Blue team towers (from base outward): nexus towers, inhibitor, inner, outer
// Red team towers (from base outward): nexus towers, inhibitor, inner, outer
const TOWER_POSITIONS = {
  // Blue team towers (lane position from blue base perspective)
  blue: {
    nexus1: 0.05,  // first nexus tower
    nexus2: 0.08,  // second nexus tower  
    inhibitor: 0.15,
    inner: 0.28,
    outer: 0.42,
  },
  // Red team towers (lane position from blue base perspective)
  red: {
    outer: 0.58,
    inner: 0.72,
    inhibitor: 0.85,
    nexus1: 0.92,
    nexus2: 0.95,
  }
}

interface TowerState {
  blueOuterDown: boolean
  blueInnerDown: boolean
  blueInhibitorDown: boolean
  redOuterDown: boolean
  redInnerDown: boolean
  redInhibitorDown: boolean
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
    blueInhibitorDown: false,
    redOuterDown: false,
    redInnerDown: false,
    redInhibitorDown: false,
  }
  
  for (const destruction of towerDestructions) {
    if (destruction.timestamp > timestamp) break
    
    // teamId = team that lost the tower
    if (destruction.teamId === 100) { // Blue team lost tower
      if (destruction.towerType === 'OUTER_TURRET') state.blueOuterDown = true
      else if (destruction.towerType === 'INNER_TURRET') state.blueInnerDown = true
      else if (destruction.towerType === 'BASE_TURRET') state.blueInhibitorDown = true
    } else if (destruction.teamId === 200) { // Red team lost tower
      if (destruction.towerType === 'OUTER_TURRET') state.redOuterDown = true
      else if (destruction.towerType === 'INNER_TURRET') state.redInnerDown = true
      else if (destruction.towerType === 'BASE_TURRET') state.redInhibitorDown = true
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
  let blueFrontline = TOWER_POSITIONS.blue.outer
  if (towerState.blueOuterDown) {
    blueFrontline = TOWER_POSITIONS.blue.inner
    if (towerState.blueInnerDown) {
      blueFrontline = TOWER_POSITIONS.blue.inhibitor
      if (towerState.blueInhibitorDown) {
        blueFrontline = TOWER_POSITIONS.blue.nexus2
      }
    }
  }
  
  // Red team's frontline = their furthest forward standing tower
  let redFrontline = TOWER_POSITIONS.red.outer
  if (towerState.redOuterDown) {
    redFrontline = TOWER_POSITIONS.red.inner
    if (towerState.redInnerDown) {
      redFrontline = TOWER_POSITIONS.red.inhibitor
      if (towerState.redInhibitorDown) {
        redFrontline = TOWER_POSITIONS.red.nexus1
      }
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
 * - Neutral: Between frontlines (contested territory - OK)
 * - Aggressive: Past enemy's current frontline tower (GOOD - making plays)
 * 
 * This means:
 * - Early game with all towers: middle of map is neutral
 * - If you lose outer tower: your "safe" zone shrinks, dying at old outer = passive (bad)
 * - If enemy loses towers: their "safe" zone shrinks, pushing into their base = aggressive (good)
 */
function getDeathZoneDynamic(
  position: { x: number; y: number },
  teamId: number,
  towerState: TowerState
): { zone: 'passive' | 'neutral' | 'aggressive'; score: number } {
  const lanePos = getLanePosition(position)
  const { blueFrontline, redFrontline } = getFrontlines(towerState)
  
  if (teamId === 100) {
    // Blue team player
    // Passive = behind blue frontline (closer to blue base)
    // Aggressive = past red frontline (closer to red base)
    if (lanePos < blueFrontline) {
      return { zone: 'passive', score: 0 }
    } else if (lanePos > redFrontline) {
      return { zone: 'aggressive', score: 100 }
    } else {
      return { zone: 'neutral', score: 50 }
    }
  } else {
    // Red team player (teamId === 200)
    // Passive = behind red frontline (closer to red base)
    // Aggressive = past blue frontline (closer to blue base)
    if (lanePos > redFrontline) {
      return { zone: 'passive', score: 0 }
    } else if (lanePos < blueFrontline) {
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
        isTeamfight: false,
      })
    }
  }

  // Second pass: calculate nearby deaths for teamfight/trade detection
  for (const kill of killEvents) {
    // Count ally deaths (same team as victim) - indicates teamfight
    kill.nearbyAllyDeaths = allKills.filter(
      k =>
        k.victimId !== kill.victimId &&
        k.victimTeamId === kill.victimTeamId &&
        Math.abs(k.timestamp - kill.timestamp) <= TEAMFIGHT_TIME_WINDOW &&
        distance(k.position, kill.position) <= TEAMFIGHT_DISTANCE
    ).length

    // Count enemy deaths (killer's team dying = trades for victim's team)
    kill.nearbyEnemyDeaths = allKills.filter(
      k => k.victimTeamId === kill.killerTeamId && Math.abs(k.timestamp - kill.timestamp) <= TRADE_TIME_WINDOW
    ).length

    // Teamfight = multiple deaths on either side within window
    kill.isTeamfight = kill.nearbyAllyDeaths >= 1 || kill.nearbyEnemyDeaths >= 1
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

      // Check if it was a trade (our team got kills around same time)
      const wasTrade = kill.nearbyEnemyDeaths > 0
      const tradeKills = kill.nearbyEnemyDeaths

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
        killedBy: kill.killerId,
        assists: kill.assistingParticipantIds,
        position: kill.position,
        zone,
        zoneScore,
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
      })
    }
  }

  // Calculate aggregate death quality score
  let deathQualityScore = 100 // Perfect if no deaths
  if (deaths.length > 0) {
    let totalDeathScore = 0
    for (const death of deaths) {
      let deathValue: number

      if (death.zone === 'aggressive') {
        // Aggressive deaths are always good - you were making plays
        deathValue = 100
      } else if (death.wasTrade || death.wasTeamfight) {
        // Trade deaths (team got kills) are good regardless of position
        deathValue = 100
      } else {
        // Passive/Neutral solo deaths - value depends on gold (reset value)
        // High gold = needed reset = good
        // Low gold = died for nothing = bad
        const gold = death.gold
        if (gold >= 800) {
          // Had gold to spend - valid reset
          deathValue = 75
        } else {
          // Low gold - died for nothing
          deathValue = 0
        }
      }

      totalDeathScore += deathValue
    }
    deathQualityScore = Math.round(totalDeathScore / deaths.length)
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
    pos: number // 0-100 lane position (0 = blue base, 100 = red base)
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
    zone: string // zone name
    pos: number // 0-100 lane position
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
  takedownScore: number // average takedown quality
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
      pos: Math.round(getLanePosition(t.position) * 100),
      value: t.quality,
      x: t.position.x,
      y: t.position.y,
    })),
    deaths: analysis.deaths.map(d => {
      // Calculate final death value with trade bonus
      let value = d.zoneScore
      if (d.wasTrade) {
        value = Math.min(95, value + d.tradeKills * 25)
      } else if (d.wasTeamfight) {
        value = Math.min(95, value + 15)
      }

      return {
        t: Math.floor(d.timestamp / 1000),
        gold: d.gold,
        tf: d.wasTeamfight,
        trade: d.wasTrade,
        tradeKills: d.tradeKills,
        zone: d.zone,
        pos: Math.round(getLanePosition(d.position) * 100),
        value: Math.round(value),
        x: d.position.x,
        y: d.position.y,
      }
    }),
    towers,
    deathScore: analysis.deathQualityScore,
    takedownScore: analysis.takedownQualityScore,
  }
}
