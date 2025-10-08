// client helpers

// normalize champion names for ddragon urls
function normalizeChampionName(championName: string): string {
  // special cases where api name differs from ddragon id
  const nameMap: Record<string, string> = {
    'FiddleSticks': 'Fiddlesticks',
    'MonkeyKing': 'MonkeyKing', // wukong uses monkeyking
    'Renata': 'Renata', // renata glasc
  }
  
  return nameMap[championName] || championName
}

export function getChampionImageUrl(championName: string, version: string): string {
  const normalizedName = normalizeChampionName(championName)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${normalizedName}.png`
}

export function getChampionCenteredUrl(championName: string, skinNum: number = 0): string {
  const normalizedName = normalizeChampionName(championName)
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${normalizedName}_${skinNum}.jpg`
}

export function getProfileIconUrl(iconId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`
}

export function getSummonerSpellUrl(spellId: number, version: string): string {
  const spellName = getSpellName(spellId)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/Summoner${spellName}.png`
}

export function getItemImageUrl(itemId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`
}

// spells - maps riot api spell ids to ddragon file names
function getSpellName(spellId: number): string {
  const spellMap: Record<number, string> = {
    1: 'Boost',      // cleanse
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste',      // ghost
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Mana',      // clarity
    14: 'Dot',       // ignite
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Snowball',  // mark
    39: 'Snowball',  // mark recast
  }
  return spellMap[spellId] || 'Flash'
}

export function getRuneImageUrl(perkId: number): string {
  // primary keystone runes need to map to their specific paths
  // format: perk-images/Styles/[TreeName]/[RuneName]/[PerkId].png
  const runePathMap: Record<number, string> = {
    // precision
    8005: 'Precision/PressTheAttack/PressTheAttack',
    8008: 'Precision/LethalTempo/LethalTempoTemp',
    8021: 'Precision/FleetFootwork/FleetFootwork',
    8010: 'Precision/Conqueror/Conqueror',
    // domination
    8112: 'Domination/Electrocute/Electrocute',
    8124: 'Domination/Predator/Predator',
    8128: 'Domination/DarkHarvest/DarkHarvest',
    9923: 'Domination/HailOfBlades/HailOfBlades',
    // sorcery
    8214: 'Sorcery/SummonAery/SummonAery',
    8229: 'Sorcery/ArcaneComet/ArcaneComet',
    8230: 'Sorcery/PhaseRush/PhaseRush',
    // resolve
    8437: 'Resolve/GraspOfTheUndying/GraspOfTheUndying',
    8439: 'Resolve/VeteranAftershock/VeteranAftershock',
    8465: 'Resolve/Guardian/Guardian',
    // inspiration
    8351: 'Inspiration/GlacialAugment/GlacialAugment',
    8360: 'Inspiration/UnsealedSpellbook/UnsealedSpellbook',
    8369: 'Inspiration/FirstStrike/FirstStrike',
  }
  
  const runePath = runePathMap[perkId]
  if (!runePath) {
    return '' // return empty string if not found
  }
  
  return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${runePath}.png`
}

export function getRuneStyleImageUrl(styleId: number): string {
  // style/tree images use different path format
  const styleMap: Record<number, string> = {
    8000: '7201_Precision',
    8100: '7200_Domination', 
    8200: '7202_Sorcery',
    8300: '7203_Whimsy',
    8400: '7204_Resolve',
  }
  const styleName = styleMap[styleId]
  if (!styleName) {
    return '' // return empty string if not found
  }
  return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${styleName}.png`
}
