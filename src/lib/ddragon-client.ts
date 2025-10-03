// client helpers

export function getChampionImageUrl(championName: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`
}

export function getChampionCenteredUrl(championName: string, skinNum: number = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${championName}_${skinNum}.jpg`
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

// spells
function getSpellName(spellId: number): string {
  const spellMap: Record<number, string> = {
    1: 'Boost',      // cleanse
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste',      // ghost
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Clarity',
    14: 'Ignite',
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Snowball',  // mark
    39: 'Snowball',  // mark recast should be useless but just in case
  }
  return spellMap[spellId] || 'Flash'
}
