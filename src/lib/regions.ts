export type RegionalCluster = 'europe' | 'americas' | 'asia' | 'sea'

export const REGIONS = [
  { code: 'euw1', label: 'EUW', regional: 'europe' as RegionalCluster, tag: 'EUW' },
  { code: 'eun1', label: 'EUNE', regional: 'europe' as RegionalCluster, tag: 'EUNE' },
  { code: 'na1', label: 'NA', regional: 'americas' as RegionalCluster, tag: 'NA1' },
  { code: 'br1', label: 'BR', regional: 'americas' as RegionalCluster, tag: 'BR1' },
  { code: 'oc1', label: 'OCE', regional: 'americas' as RegionalCluster, tag: 'OC' },
  { code: 'la1', label: 'LAN', regional: 'americas' as RegionalCluster, tag: 'LAN' },
  { code: 'la2', label: 'LAS', regional: 'americas' as RegionalCluster, tag: 'LAS' },
  { code: 'kr', label: 'KR', regional: 'asia' as RegionalCluster, tag: 'KR1' },
  { code: 'jp1', label: 'JP', regional: 'asia' as RegionalCluster, tag: 'JP1' },
  { code: 'sg2', label: 'SEA', regional: 'sea' as RegionalCluster, tag: 'SG2' },
  { code: 'tw2', label: 'TW', regional: 'sea' as RegionalCluster, tag: 'TW2' },
  { code: 'vn2', label: 'VN', regional: 'sea' as RegionalCluster, tag: 'VN2' },
  { code: 'tr1', label: 'TR', regional: 'europe' as RegionalCluster, tag: 'TR1' },
  { code: 'ru', label: 'RU', regional: 'europe' as RegionalCluster, tag: 'RU1' },
  { code: 'me1', label: 'MENA', regional: 'sea' as RegionalCluster, tag: 'ME1' },
] as const

export type PlatformCode = typeof REGIONS[number]['code']

export const PLATFORM_TO_REGIONAL: Record<PlatformCode, RegionalCluster> =
  REGIONS.reduce((acc, r) => { acc[r.code] = r.regional; return acc }, {} as Record<PlatformCode, RegionalCluster>)

export const PLATFORM_TO_LABEL: Record<PlatformCode, string> =
  REGIONS.reduce((acc, r) => { acc[r.code] = r.label; return acc }, {} as Record<PlatformCode, string>)

export const LABEL_TO_PLATFORM: Record<string, PlatformCode> =
  REGIONS.reduce((acc, r) => { acc[r.label] = r.code; return acc }, {} as Record<string, PlatformCode>)

export const LABEL_TO_TAG: Record<string, string> =
  REGIONS.reduce((acc, r) => { acc[r.label] = r.tag; return acc }, {} as Record<string, string>)

export const REGION_OPTIONS = REGIONS.map(r => ({ value: r.code as PlatformCode, label: r.label }))

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