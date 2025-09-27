export type RegionalCluster = 'europe' | 'americas' | 'asia' | 'sea'

export const REGIONS = [
  { code: 'euw1', label: 'EUW', regional: 'europe' as RegionalCluster },
  { code: 'eun1', label: 'EUNE', regional: 'europe' as RegionalCluster },
  { code: 'tr1', label: 'TR', regional: 'europe' as RegionalCluster },
  { code: 'ru', label: 'RU', regional: 'europe' as RegionalCluster },
  { code: 'na1', label: 'NA', regional: 'americas' as RegionalCluster },
  { code: 'br1', label: 'BR', regional: 'americas' as RegionalCluster },
  { code: 'la1', label: 'LAN', regional: 'americas' as RegionalCluster },
  { code: 'la2', label: 'LAS', regional: 'americas' as RegionalCluster },
  { code: 'kr', label: 'KR', regional: 'asia' as RegionalCluster },
  { code: 'jp1', label: 'JP', regional: 'asia' as RegionalCluster },
  { code: 'ph2', label: 'PH', regional: 'sea' as RegionalCluster },
  { code: 'sg2', label: 'SG', regional: 'sea' as RegionalCluster },
  { code: 'th2', label: 'TH', regional: 'sea' as RegionalCluster },
  { code: 'tw2', label: 'TW', regional: 'sea' as RegionalCluster },
  { code: 'vn2', label: 'VN', regional: 'sea' as RegionalCluster },
  { code: 'me1', label: 'MENA', regional: 'sea' as RegionalCluster },
] as const

export type PlatformCode = typeof REGIONS[number]['code']

export const PLATFORM_TO_REGIONAL: Record<PlatformCode, RegionalCluster> =
  REGIONS.reduce((acc, r) => { acc[r.code] = r.regional; return acc }, {} as Record<PlatformCode, RegionalCluster>)

export const PLATFORM_TO_LABEL: Record<PlatformCode, string> =
  REGIONS.reduce((acc, r) => { acc[r.code] = r.label; return acc }, {} as Record<PlatformCode, string>)

export const LABEL_TO_PLATFORM: Record<string, PlatformCode> =
  REGIONS.reduce((acc, r) => { acc[r.label] = r.code; return acc }, {} as Record<string, PlatformCode>)

export const REGION_OPTIONS = REGIONS.map(r => ({ value: r.code as PlatformCode, label: r.label }))

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