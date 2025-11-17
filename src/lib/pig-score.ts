// pig score calculation - 0-100 scale where 50 is average, 100 is perfect
// 
// aggregate scoring system - each mistake directly impacts total score
// bad itemization or runes can tank your score by 30+ points
// focuses on: items (top 5 only), runes, death timing, champion winrate
// requires timeline data - returns null if unavailable
//
import type { ParticipantData, MatchData } from './riot-api'
import { createAdminClient } from './supabase'

interface PigScoreComponents {
  itemPenalty: number          // per-item penalties (up to -40 total, only top 5 items)
  keystonePenalty: number      // keystone penalty (up to -20)
  deathTimingPenalty: number   // death timing penalty (up to -20)
  championWinratePenalty: number // champion winrate penalty (up to -30, harsh exponential)
  total: number                // starts at 100, penalties subtract
}

// keystone id to name mapping (most common ones)
const KEYSTONE_IDS: Record<number, string> = {
  8005: 'Press the Attack',
  8008: 'Lethal Tempo',
  8021: 'Fleet Footwork',
  8010: 'Conqueror',
  8112: 'Electrocute',
  8124: 'Predator',
  8128: 'Dark Harvest',
  8143: 'Hail of Blades',
  8214: 'Summon Aery',
  8229: 'Arcane Comet',
  8230: 'Phase Rush',
  8437: 'Grasp of the Undying',
  8439: 'Aftershock',
  8465: 'Guardian',
  8351: 'Glacial Augment',
  8360: 'Unsealed Spellbook',
  8369: 'First Strike',
}

// calculate item penalty - heavily penalize suboptimal items (up to -40 points total)
// only scores items that are in the top 5 meta choices
// reads from aram_stats.items_by_slot JSONB
async function calculateItemPenalty(
  participant: ParticipantData,
  championName: string,
  firstItem: number,
  secondItem: number,
  thirdItem: number
): Promise<number> {
  const supabase = createAdminClient()
  let totalPenalty = 0

  // get champion data with items
  const { data: championData } = await supabase
    .from('aram_stats')
    .select('items_by_slot')
    .eq('champion_name', championName.toLowerCase())
    .single()

  if (!championData?.items_by_slot) return 0

  // score each of first 3 items - HARSH penalties per item
  const items = [
    { slot: 1, itemId: firstItem, weight: 1.2 }, // first item most important
    { slot: 2, itemId: secondItem, weight: 1.0 },
    { slot: 3, itemId: thirdItem, weight: 0.8 },
  ]

  for (const { slot, itemId, weight } of items) {
    if (!itemId) continue

    // get top 5 items for this slot
    const itemStats = championData.items_by_slot[String(slot)]?.slice(0, 5) || []
    if (itemStats.length === 0) continue

    const topItem = itemStats[0]
    const playerItemMatch = itemStats.find((i: any) => i.item_id === itemId)

    if (playerItemMatch) {
      // player bought item in top 5 - penalize exponentially based on winrate difference
      const wrDiff = topItem.winrate - playerItemMatch.winrate
      
      // only penalize if worse than best (wrDiff > 0)
      if (wrDiff > 0) {
        // exponential scaling: penalty = wrDiff^1.3 * 1.2 * weight (softer)
        // examples:
        // - 1% diff = ~1.2 points
        // - 5% diff = ~8 points
        // - 10% diff = ~24 points
        // - 15% diff = ~50 points
        const itemPenalty = Math.pow(wrDiff, 1.3) * 1.2 * weight
        totalPenalty += itemPenalty
      }
    }
    // if item not in top 5, ignore it (could be situational/good)
  }

  return totalPenalty
}

// calculate keystone penalty - harsh penalty for wrong rune (up to -20 points)
// reads from aram_stats.keystones JSONB
async function calculateKeystonePenalty(
  participant: ParticipantData,
  championName: string
): Promise<number> {
  const keystoneId = participant.perks?.styles?.[0]?.selections?.[0]?.perk
  if (!keystoneId) return 10 // penalty for unknown

  const keystoneName = KEYSTONE_IDS[keystoneId]
  if (!keystoneName) return 10

  const supabase = createAdminClient()
  
  // get champion data with keystones
  const { data: championData } = await supabase
    .from('aram_stats')
    .select('keystones')
    .eq('champion_name', championName.toLowerCase())
    .single()

  if (!championData?.keystones) return 0

  // get top 5 keystones
  const keystoneStats = championData.keystones.slice(0, 5)
  if (keystoneStats.length === 0) return 0

  const topKeystone = keystoneStats[0]
  const playerKeystone = keystoneStats.find((k: any) => k.keystone_id === keystoneId)

  if (playerKeystone) {
    // -1.5 points per 1% winrate difference (softer)
    const wrDiff = topKeystone.winrate - playerKeystone.winrate
    // only penalize if worse than best
    if (wrDiff > 0) {
      return wrDiff * 1.5
    }
    return 0
  }

  // player used non-meta keystone - moderate penalty
  return 12
}

// calculate damage penalty - penalize low damage output (up to -20 points)
// REMOVED: will be re-added with per-champion benchmarks in the future
function calculateDamagePenalty(
  participant: ParticipantData,
  match: MatchData
): number {
  return 0 // placeholder - no damage penalty for now
}

// calculate death timing penalty (up to -15 points, softer)
function calculateDeathTimingPenalty(
  participant: ParticipantData,
  match: MatchData
): number {
  const gameDurationMinutes = match.info.gameDuration / 60
  
  // sweet spot is 1 death per 2-3 minutes
  const minutesPerDeath = participant.deaths > 0 ? gameDurationMinutes / participant.deaths : 999
  
  if (minutesPerDeath >= 2 && minutesPerDeath <= 3) {
    return 0 // no penalty - perfect timing
  } else if (minutesPerDeath < 2) {
    // dying too often - exponential penalty (softer)
    const excessDeaths = 2 - minutesPerDeath
    return Math.min(15, Math.pow(excessDeaths * 2.5, 1.3))
  } else {
    // not dying enough - exponential penalty (softer)
    const notDyingEnough = Math.min(10, minutesPerDeath - 2.5)
    return Math.min(15, Math.pow(notDyingEnough * 2, 1.2))
  }
}

// calculate summoner spell penalty (up to -10 points)
// REMOVED: summoner spells not relevant for pig score
function calculateSpellPenalty(participant: ParticipantData): number {
  return 0 // no penalty for spells
}

// calculate champion winrate penalty - exponential penalty for weak champions (up to -30 points)
// special case: malphite - check first item to determine if ap (full penalty) or tank (no penalty)
async function calculateChampionWinratePenalty(
  championName: string,
  firstItem: number | null = null
): Promise<number> {
  const supabase = createAdminClient()
  
  const { data: championData } = await supabase
    .from('aram_stats')
    .select('overall_winrate')
    .eq('champion_name', championName.toLowerCase())
    .single()
  
  if (!championData?.overall_winrate) return 0 // no penalty if no data
  
  const winrate = championData.overall_winrate
  
  // special malphite handling
  if (championName.toLowerCase() === 'malphite' && firstItem) {
    const apItems = [
      3089, // rabadon's deathcap
      3135, // void staff
      3003, // archangel's staff
      3040, // seraph's embrace
      4633, // riftmaker
      6653, // liandry's torment
      3152, // hextech rocketbelt
      4645, // shadowflame
      4646, // stormsurge
      3165, // morellonomicon
      3137, // cryptbloom
      3118, // malignance
      3157, // zhonya's hourglass
      3100, // lich bane
      6657, // rod of ages
      4628, // horizon focus
    ]
    
    if (apItems.includes(firstItem)) {
      return 30 // reduced penalty for ap malphite
    } else {
      return 0
    }
  }
  
  // no penalty for champions at or above 50%
  if (winrate >= 50) return 0
  
  // calculate how far below 50% the champion is
  const wrDiff = 50 - winrate
  
  // softer exponential penalty
  // 49.5% = ~0.2pts, 45% = ~4pts, 40% = ~12pts, 38% = ~15pts (capped at 20)
  const penalty = Math.pow(wrDiff * 0.5, 2.5)
  
  return Math.min(20, penalty) // cap at -20 points (reduced from 30)
}

// main pig score calculation - starts at 100, penalties subtract
// requires timeline data with first 3 items
export async function calculatePigScore(
  participant: ParticipantData,
  match: MatchData,
  firstItem?: number,
  secondItem?: number,
  thirdItem?: number,
  isFirstMatch?: boolean
): Promise<number | null> {
  // must have timeline data to calculate pig score
  // check for undefined/null, but allow 0 (could happen in edge cases)
  if (firstItem === undefined || firstItem === null || 
      secondItem === undefined || secondItem === null || 
      thirdItem === undefined || thirdItem === null) {
    if (isFirstMatch) {
      console.log(`pig score null: missing items. first=${firstItem}, second=${secondItem}, third=${thirdItem}`)
    }
    return null
  }

  const championName = participant.championName
  if (isFirstMatch) {
    console.log(`calculating pig score for ${championName}. items: ${firstItem}, ${secondItem}, ${thirdItem}`)
  }

  // start at perfect score, subtract penalties
  let score = 100

  const itemPenalty = await calculateItemPenalty(participant, championName, firstItem, secondItem, thirdItem)
  const keystonePenalty = await calculateKeystonePenalty(participant, championName)
  const deathTimingPenalty = calculateDeathTimingPenalty(participant, match)
  const championWinratePenalty = await calculateChampionWinratePenalty(championName, firstItem)

  if (isFirstMatch) {
    console.log(`penalties - item: ${itemPenalty}, keystone: ${keystonePenalty}, death: ${deathTimingPenalty}, champ: ${championWinratePenalty}`)
  }

  score -= itemPenalty
  score -= keystonePenalty
  score -= deathTimingPenalty
  score -= championWinratePenalty

  if (isFirstMatch) {
    console.log(`final pig score: ${score}`)
  }

  // clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)))
}

export type { PigScoreComponents }
