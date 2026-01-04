// Rune tree structure - organized by tree, keystone, and tier
// This is the canonical source of truth for rune organization

interface RuneTreeData {
  id: number
  name: string
  color: string
  keystones: number[]
  tier1: number[]
  tier2: number[]
  tier3: number[]
}

export const RUNE_TREES: Record<string, RuneTreeData> = {
  precision: {
    id: 8000,
    name: 'Precision',
    color: '#C8AA6E',
    keystones: [8005, 8008, 8021, 8010], // Press the Attack, Lethal Tempo, Fleet Footwork, Conqueror
    tier1: [9101, 8009, 9111], // Absorb Life, Presence of Mind, Triumph
    tier2: [9104, 9103, 9105], // Legend: Alacrity, Legend: Bloodline, Legend: Haste
    tier3: [8014, 8017, 8299], // Coup de Grace, Cut Down, Last Stand
  },
  domination: {
    id: 8100,
    name: 'Domination',
    color: '#D44242',
    keystones: [8112, 8128, 9923], // Electrocute, Dark Harvest, Hail of Blades
    tier1: [8126, 8139, 8143], // Cheap Shot, Taste of Blood, Sudden Impact
    tier2: [8137, 8140, 8141], // Sixth Sense, Grisly Mementos, Deep Ward
    tier3: [8135, 8105, 8106], // Treasure Hunter, Relentless Hunter, Ultimate Hunter
  },
  sorcery: {
    id: 8200,
    name: 'Sorcery',
    color: '#9FAAFC',
    keystones: [8214, 8229, 8230], // Summon Aery, Arcane Comet, Phase Rush
    tier1: [8224, 8226, 8275], // Nullifying Orb, Manaflow Band, Nimbus Cloak
    tier2: [8210, 8234, 8233], // Transcendence, Celerity, Absolute Focus
    tier3: [8237, 8232, 8236], // Scorch, Waterwalking, Gathering Storm
  },
  resolve: {
    id: 8400,
    name: 'Resolve',
    color: '#A1D586',
    keystones: [8437, 8439, 8465], // Grasp of the Undying, Aftershock, Guardian
    tier1: [8446, 8463, 8401], // Demolish, Font of Life, Shield Bash
    tier2: [8429, 8444, 8473], // Conditioning, Second Wind, Bone Plating
    tier3: [8451, 8453, 8242], // Overgrowth, Revitalize, Unflinching
  },
  inspiration: {
    id: 8300,
    name: 'Inspiration',
    color: '#49AAF5',
    keystones: [8351, 8360, 8369], // Glacial Augment, Unsealed Spellbook, First Strike
    tier1: [8306, 8304, 8313], // Hextech Flashtraption, Magical Footwear, Triple Tonic
    tier2: [8321, 8345, 8347], // Cash Back, Biscuit Delivery, Cosmic Insight
    tier3: [8410, 8352, 8316], // Approach Velocity, Time Warp Tonic, Jack Of All Trades
  },
}

export type RuneTreeName = keyof typeof RUNE_TREES
export type RuneTree = RuneTreeData
export type RuneTier = 'keystone' | 'tier1' | 'tier2' | 'tier3'

// Stat perk shards (tertiary runes)
export const STAT_PERKS = {
  offense: [
    { id: 5008, name: 'Adaptive Force', icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png' },
    { id: 5005, name: 'Attack Speed', icon: 'perk-images/StatMods/StatModsAttackSpeedIcon.png' },
    { id: 5007, name: 'Ability Haste', icon: 'perk-images/StatMods/StatModsCDRScalingIcon.png' },
  ],
  flex: [
    { id: 5008, name: 'Adaptive Force', icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png' },
    { id: 5010, name: 'Move Speed', icon: 'perk-images/StatMods/StatModsMovementSpeedIcon.png' },
    { id: 5001, name: 'Health Scaling', icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png' },
  ],
  defense: [
    { id: 5011, name: 'Health', icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png' },
    { id: 5013, name: 'Tenacity', icon: 'perk-images/StatMods/StatModsTenacityIcon.png' },
    { id: 5001, name: 'Health Scaling', icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png' },
  ],
} as const

// Get rune tree info by rune ID
export function getRuneTree(
  runeId: number
): { tree: RuneTree; tier: RuneTier } | null {
  for (const tree of Object.values(RUNE_TREES)) {
    if (tree.keystones.includes(runeId)) return { tree, tier: 'keystone' }
    if (tree.tier1.includes(runeId)) return { tree, tier: 'tier1' }
    if (tree.tier2.includes(runeId)) return { tree, tier: 'tier2' }
    if (tree.tier3.includes(runeId)) return { tree, tier: 'tier3' }
  }
  return null
}

// Get tree by name
export function getRuneTreeByName(name: string): RuneTree | null {
  const normalized = name.toLowerCase() as RuneTreeName
  return RUNE_TREES[normalized] || null
}

// Get tree by ID
export function getRuneTreeById(id: number): RuneTree | null {
  for (const tree of Object.values(RUNE_TREES)) {
    if (tree.id === id) return tree
  }
  return null
}
