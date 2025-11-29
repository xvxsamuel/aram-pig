// PIG Score calculator - stat penalties
import { createAdminClient } from '../db/supabase'

// calculate penalty for a single stat based on performance vs average
export function calculateStatPenalty(playerValue: number, avgValue: number, maxPenalty: number): number {
  if (avgValue <= 0) return 0
  
  const performanceRatio = playerValue / avgValue
  
  if (performanceRatio >= 1.0) return 0
  if (performanceRatio >= 0.9) return maxPenalty * 0.15
  if (performanceRatio >= 0.8) return maxPenalty * 0.30
  if (performanceRatio >= 0.7) return maxPenalty * 0.50
  if (performanceRatio >= 0.6) return maxPenalty * 0.75
  return maxPenalty
}

// calculate deaths per minute penalty
export function calculateDeathsPerMinutePenalty(deaths: number, gameDurationMinutes: number): number {
  if (gameDurationMinutes <= 0) return 0
  
  const deathsPerMin = deaths / gameDurationMinutes
  
  if (deathsPerMin >= 0.5 && deathsPerMin <= 0.7) return 0
  
  if (deathsPerMin < 0.5) {
    const deficit = 0.5 - deathsPerMin
    return Math.min(15, deficit * 30)
  }
  
  if (deathsPerMin > 0.7) {
    const excess = deathsPerMin - 0.7
    return Math.min(10, excess * 20)
  }
  
  return 0
}

interface ParticipantForPenalty {
  patch: string | null
  item0: number
  item1: number
  item2: number
  perk0: number
  spell1?: number
  spell2?: number
  skillOrder?: string
  buildOrder?: string
}

// calculate item build penalty
export async function calculateItemPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch) return 0
  
  const supabase = createAdminClient()
  let totalPenalty = 0
  const items = [participant.item0, participant.item1, participant.item2]
  
  const { data: itemStats } = await supabase
    .from('item_stats_by_patch')
    .select('item_id, slot, games, wins, winrate')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
  
  if (!itemStats || itemStats.length === 0) return 0
  
  const { data: championData } = await supabase
    .from('champion_stats_incremental')
    .select('games')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  const totalGames = championData?.games || 1
  
  for (let slot = 0; slot < 3; slot++) {
    const playerItemId = items[slot]
    if (!playerItemId || playerItemId === 0) continue
    
    const bootsIds = [3006, 3009, 3020, 3047, 3111, 3117, 3158]
    if (bootsIds.includes(playerItemId)) continue
    
    const slotItems = itemStats.filter(i => i.slot === slot)
    if (slotItems.length === 0) continue
    
    const itemsWithPriority = slotItems
      .map(item => {
        const pickrate = (item.games / totalGames) * 100
        const priority = item.winrate
        return { ...item, pickrate, priority }
      })
      .filter(item => item.games >= 30)
      .sort((a, b) => b.priority - a.priority)
    
    if (itemsWithPriority.length === 0) continue
    
    const top5 = itemsWithPriority.slice(0, 5)
    const playerItem = itemsWithPriority.find(i => i.item_id === playerItemId)
    
    if (!playerItem) {
      totalPenalty += 1
      continue
    }
    
    const isInTop5 = top5.some(i => i.item_id === playerItemId)
    if (isInTop5) continue
    
    const topPriority = top5[0].priority
    const priorityDiff = topPriority - playerItem.priority
    const penaltyAmount = Math.min(3, priorityDiff / 50)
    totalPenalty += penaltyAmount
  }
  
  return Math.min(10, totalPenalty)
}

// calculate keystone penalty
export async function calculateKeystonePenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.perk0) return 0
  
  const supabase = createAdminClient()
  
  const { data: runeStats } = await supabase
    .from('rune_stats_by_patch')
    .select('rune_id, games, wins, winrate')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .eq('slot', 0)
  
  if (!runeStats || runeStats.length === 0) return 0
  
  const totalGames = runeStats.reduce((sum, r) => sum + r.games, 0)
  const runesWithPriority = runeStats
    .map(rune => {
      const pickrate = (rune.games / totalGames) * 100
      const priority = rune.winrate
      return { ...rune, pickrate, priority }
    })
    .filter(rune => rune.games >= 50)
    .sort((a, b) => b.priority - a.priority)
  
  if (runesWithPriority.length === 0) return 0
  
  const top5 = runesWithPriority.slice(0, 5)
  const playerRune = runesWithPriority.find(r => r.rune_id === participant.perk0)
  
  if (!playerRune) return 5
  
  const isInTop5 = top5.some(r => r.rune_id === participant.perk0)
  if (isInTop5) return 0
  
  const topPriority = top5[0].priority
  const priorityDiff = topPriority - playerRune.priority
  return Math.min(10, priorityDiff / 20)
}

// calculate summoner spells penalty
export async function calculateSpellsPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.spell1 || !participant.spell2) return 0
  
  const supabase = createAdminClient()
  
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.spells) return 0
  
  const spellsObj = championStats.data.spells as Record<string, { games: number; wins: number }>
  const spellsEntries = Object.entries(spellsObj)
  if (spellsEntries.length === 0) return 0
  
  const playerSpells = [participant.spell1, participant.spell2].sort((a, b) => a - b)
  const playerKey = `${playerSpells[0]}_${playerSpells[1]}`
  
  const spellsWithWinrate = spellsEntries
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0
    }))
    .filter(s => s.games >= 30)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (spellsWithWinrate.length === 0) return 0
  
  const top3 = spellsWithWinrate.slice(0, 3)
  const playerSpellCombo = spellsWithWinrate.find(s => s.key === playerKey)
  
  if (!playerSpellCombo) return 2
  
  const isInTop3 = top3.some(s => s.key === playerKey)
  if (isInTop3) return 0
  
  const topWinrate = top3[0].winrate
  const winrateDiff = topWinrate - playerSpellCombo.winrate
  return Math.min(5, winrateDiff / 10)
}

// calculate skill max order penalty
export async function calculateSkillOrderPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.skillOrder) return 0
  
  const supabase = createAdminClient()
  
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.skills) return 0
  
  const skillsObj = championStats.data.skills as Record<string, { games: number; wins: number }>
  const skillsEntries = Object.entries(skillsObj)
  if (skillsEntries.length === 0) return 0
  
  const skillsWithWinrate = skillsEntries
    .map(([key, value]) => ({
      key,
      games: value.games,
      wins: value.wins,
      winrate: value.games > 0 ? (value.wins / value.games) * 100 : 0
    }))
    .filter(s => s.games >= 20)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (skillsWithWinrate.length === 0) return 0
  
  const top2 = skillsWithWinrate.slice(0, 2)
  const playerSkillOrder = skillsWithWinrate.find(s => s.key === participant.skillOrder)
  
  if (!playerSkillOrder) return 5
  
  const isInTop2 = top2.some(s => s.key === participant.skillOrder)
  if (isInTop2) return 0
  
  const topWinrate = top2[0].winrate
  const winrateDiff = topWinrate - playerSkillOrder.winrate
  return Math.min(8, winrateDiff / 5)
}

// calculate build order penalty
export async function calculateBuildOrderPenalty(participant: ParticipantForPenalty, championName: string): Promise<number> {
  if (!participant.patch || !participant.buildOrder) return 0
  
  const supabase = createAdminClient()
  
  const { data: championStats } = await supabase
    .from('champion_stats')
    .select('data')
    .eq('champion_name', championName)
    .eq('patch', participant.patch)
    .maybeSingle()
  
  if (!championStats?.data?.core) return 0
  
  const coreData = championStats.data.core as Record<string, { games: number; wins: number }>
  if (Object.keys(coreData).length === 0) return 0
  
  const playerItems = participant.buildOrder.split(',').map(id => parseInt(id, 10)).slice(0, 3)
  if (playerItems.length < 3) return 0
  
  const BOOT_IDS = [1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158]
  const normalizeItem = (id: number) => BOOT_IDS.includes(id) ? 10010 : id
  
  const normalizedPlayerItems = playerItems.map(normalizeItem).sort((a, b) => a - b)
  const playerKey = normalizedPlayerItems.join('_')
  
  const combosWithWinrate = Object.entries(coreData)
    .map(([key, data]) => ({
      key,
      games: data.games,
      wins: data.wins,
      winrate: data.games > 0 ? (data.wins / data.games) * 100 : 0
    }))
    .filter(c => c.games >= 20)
    .sort((a, b) => b.winrate - a.winrate)
  
  if (combosWithWinrate.length === 0) return 0
  
  const top5 = combosWithWinrate.slice(0, 5)
  const playerCombo = combosWithWinrate.find(c => c.key === playerKey)
  
  if (!playerCombo) return 5
  
  const isInTop5 = top5.some(c => c.key === playerKey)
  if (isInTop5) return 0
  
  const topWinrate = top5[0].winrate
  const winrateDiff = topWinrate - playerCombo.winrate
  return Math.min(8, winrateDiff / 5)
}
