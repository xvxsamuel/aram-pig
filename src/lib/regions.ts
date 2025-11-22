export type RegionalCluster = 'europe' | 'americas' | 'asia' | 'sea'
export type PlatformCode = 'na1' | 'br1' | 'la1' | 'la2' | 'kr' | 'jp1' | 'eun1' | 'euw1' | 'ru' | 'tr1' | 'me1' | 'oc1' | 'sg2' | 'tw2' | 'vn2'

const PLATFORM_DATA: Record<PlatformCode, { label: string; regional: RegionalCluster; tag: string }> = {
  na1: { label: 'NA', regional: 'americas', tag: 'NA1' },
  br1: { label: 'BR', regional: 'americas', tag: 'BR1' },
  la1: { label: 'LAN', regional: 'americas', tag: 'LAN' },
  la2: { label: 'LAS', regional: 'americas', tag: 'LAS' },
  kr: { label: 'KR', regional: 'asia', tag: 'KR1' },
  jp1: { label: 'JP', regional: 'asia', tag: 'JP1' },
  eun1: { label: 'EUNE', regional: 'europe', tag: 'EUNE' },
  euw1: { label: 'EUW', regional: 'europe', tag: 'EUW' },
  ru: { label: 'RU', regional: 'europe', tag: 'RU1' },
  tr1: { label: 'TR', regional: 'europe', tag: 'TR1' },
  me1: { label: 'MENA', regional: 'europe', tag: 'ME1' },
  oc1: { label: 'OCE', regional: 'sea', tag: 'OC' },
  sg2: { label: 'SEA', regional: 'sea', tag: 'SG2' },
  tw2: { label: 'TW', regional: 'sea', tag: 'TW2' },
  vn2: { label: 'VN', regional: 'sea', tag: 'VN2' },
}

// region selector array don't use for others
export const REGIONS = Object.entries(PLATFORM_DATA).map(([code, data]) => ({
  code: code as PlatformCode,
  label: data.label,
  regional: data.regional,
  tag: data.tag
}))

export const PLATFORM_TO_REGIONAL: Record<PlatformCode, RegionalCluster> = 
  Object.fromEntries(Object.entries(PLATFORM_DATA).map(([k, v]) => [k, v.regional])) as Record<PlatformCode, RegionalCluster>

export const PLATFORM_TO_LABEL: Record<PlatformCode, string> = 
  Object.fromEntries(Object.entries(PLATFORM_DATA).map(([k, v]) => [k, v.label])) as Record<PlatformCode, string>

export const LABEL_TO_PLATFORM: Record<string, PlatformCode> =
  Object.fromEntries(Object.entries(PLATFORM_DATA).map(([k, v]) => [v.label, k])) as Record<string, PlatformCode>

export const LABEL_TO_TAG: Record<string, string> =
  Object.fromEntries(Object.entries(PLATFORM_DATA).map(([k, v]) => [v.label, v.tag])) as Record<string, string>

export const REGION_OPTIONS = Object.entries(PLATFORM_DATA).map(([code, data]) => ({ 
  value: code as PlatformCode, 
  label: data.label 
}))

export function getDefaultTag(regionLabel: string): string {
  return LABEL_TO_TAG[regionLabel.toUpperCase()] || regionLabel.toUpperCase()
}

export function isValidPlatform(code: string): code is PlatformCode {
  return (PLATFORM_TO_REGIONAL as Record<string, RegionalCluster>)[code] !== undefined
}

export function toLabel(code: string): string {
  return PLATFORM_TO_LABEL[code as PlatformCode] ?? code.toUpperCase()
}

export function toPlatform(input: string): PlatformCode | null {
  const normalized = input.trim().toLowerCase()
  if (isValidPlatform(normalized)) return normalized
  const byLabel = LABEL_TO_PLATFORM[normalized.toUpperCase()]
  return byLabel ?? null
}