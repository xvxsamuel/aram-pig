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
async function calculateItemPenalty(
  participant: ParticipantData,
  championName: string,
  firstItem: number,
  secondItem: number,
  thirdItem: number
): Promise<number> {
  const supabase = createAdminClient()
  let totalPenalty = 0

  // get champion's optimal items
  const { data: championData } = await supabase
    .from('aram_stats')
    .select('slot_1_items, slot_2_items, slot_3_items')
    .eq('champion_name', championName.toLowerCase())
    .single()

  if (!championData) return 0 // no penalty if no data

  // score each of first 3 items - HARSH penalties per item
  const items = [
    { slot: 1, itemId: firstItem, slotData: championData.slot_1_items, weight: 1.2 }, // first item most important
    { slot: 2, itemId: secondItem, slotData: championData.slot_2_items, weight: 1.0 },
    { slot: 3, itemId: thirdItem, slotData: championData.slot_3_items, weight: 0.8 },
  ]

  for (const { itemId, slotData, weight } of items) {
    if (!itemId || !slotData || !Array.isArray(slotData)) continue

    const optimalItems = slotData.slice(0, 5) // top 5 items for this slot
    if (optimalItems.length === 0) continue

    const topItem = optimalItems[0]
    const playerItemMatch = optimalItems.find((i: any) => i.id === itemId)

    if (playerItemMatch) {
      // player bought item in top 5 - penalize based on winrate difference
      // -3 points per 1% winrate difference (harsh!)
      const wrDiff = topItem.wr - playerItemMatch.wr
      const itemPenalty = wrDiff * 3 * weight
      totalPenalty += itemPenalty
      
      // example: 56% vs 44% item = 12% diff = -36 points for first item alone!
    }
    // if item not in top 5, ignore it (could be situational/good)
  }

  return totalPenalty
}

// calculate keystone penalty - harsh penalty for wrong rune (up to -20 points)
async function calculateKeystonePenalty(
  participant: ParticipantData,
  championName: string
): Promise<number> {
  const keystoneId = participant.perks?.styles?.[0]?.selections?.[0]?.perk
  if (!keystoneId) return 10 // penalty for unknown

  const keystoneName = KEYSTONE_IDS[keystoneId]
  if (!keystoneName) return 10

  const supabase = createAdminClient()
  const { data: championData } = await supabase
    .from('aram_stats')
    .select('keystones')
    .eq('champion_name', championName.toLowerCase())
    .single()

  if (!championData?.keystones || !Array.isArray(championData.keystones)) return 0

  const keystones = championData.keystones.filter((k: any) => k.name && k.wr)
  if (keystones.length === 0) return 0

  const topKeystone = keystones[0]
  
  // match by id or name
  const playerKeystone = keystones.find((k: any) => 
    k.id === keystoneId || k.name === keystoneName
  )

  if (playerKeystone) {
    // -3 points per 1% winrate difference (harsh like items)
    const wrDiff = topKeystone.wr - playerKeystone.wr
    return wrDiff * 3
  }

  // player used non-meta keystone - huge penalty
  return 20
}

// calculate damage penalty - penalize low damage output (up to -20 points)
// REMOVED: will be re-added with per-champion benchmarks in the future
function calculateDamagePenalty(
  participant: ParticipantData,
  match: MatchData
): number {
  return 0 // placeholder - no damage penalty for now
}

// calculate death timing penalty (up to -20 points)
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
    // dying too often - exponential penalty
    const excessDeaths = 2 - minutesPerDeath
    return Math.min(20, Math.pow(excessDeaths * 3, 1.5))
  } else {
    // not dying enough - HARSH exponential penalty (hoarding gold)
    const notDyingEnough = Math.min(10, minutesPerDeath - 2.5)
    return Math.min(20, Math.pow(notDyingEnough * 2.5, 1.4))
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
      return 50 // max penalty
    } else {
      return 0
    }
  }
  
  // no penalty for champions at or above 50%
  if (winrate >= 50) return 0
  
  // calculate how far below 50% the champion is
  const wrDiff = 50 - winrate
  
  // harsh exponential penalty with exponent 3.0 for really bad champions
  // 49.5% = ~0.4pts, 45% = ~9pts, 40% = ~25pts, 38% = ~32pts (capped)
  const penalty = Math.pow(wrDiff * 0.7, 3.0)
  
  return Math.min(30, penalty) // cap at -30 points
}

// main pig score calculation - starts at 100, penalties subtract
// requires timeline data with first 3 items
export async function calculatePigScore(
  participant: ParticipantData,
  match: MatchData,
  firstItem?: number,
  secondItem?: number,
  thirdItem?: number
): Promise<number | null> {
  // must have timeline data to calculate pig score
  if (!firstItem || !secondItem || !thirdItem) {
    return null
  }

  const championName = participant.championName

  // start at perfect score, subtract penalties
  let score = 100

  const itemPenalty = await calculateItemPenalty(participant, championName, firstItem, secondItem, thirdItem)
  const keystonePenalty = await calculateKeystonePenalty(participant, championName)
  const deathTimingPenalty = calculateDeathTimingPenalty(participant, match)
  const championWinratePenalty = await calculateChampionWinratePenalty(championName, firstItem)

  score -= itemPenalty
  score -= keystonePenalty
  score -= deathTimingPenalty
  score -= championWinratePenalty

  // clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)))
}

export type { PigScoreComponents }
