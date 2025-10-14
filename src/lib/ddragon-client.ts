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
  // get icon path from runes data
  const runesData = require('../data/runes.json')
  const rune = runesData[perkId]
  if (!rune || !rune.icon) {
    return ''
  }
  return `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`
}

export function getRuneStyleImageUrl(styleId: number): string {
  // get icon path from runes data (tree styles)
  const runesData = require('../data/runes.json')
  const style = runesData[styleId]
  if (!style || !style.icon) {
    return ''
  }
  return `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}`
}
