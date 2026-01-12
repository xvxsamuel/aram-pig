'use client'

import { useState, useEffect, useMemo, memo } from 'react'
import Image from 'next/image'
import { getTooltipData, cleanWikiMarkup, renderNestedMarkers, type TooltipType } from '@/lib/ui'
import { getItemImageUrl, getLatestVersion } from '@/lib/ddragon'
import SimpleTooltip from './SimpleTooltip'
import augmentsData from '@/data/augments.json'

interface TooltipProps {
  id: number | string
  type: 'item' | 'rune' | 'spell' | 'augment'
  children: React.ReactNode
}

// item type labels
const ITEM_TYPE_LABELS: Record<TooltipType, string> = {
  legendary: 'Legendary Item',
  boots: 'Boots',
  component: 'Component',
  starter: 'Starter Item',
  consumable: 'Consumable',
  other: 'Special Item',
}

// augment tier labels
const TIER_LABELS: Record<string, string> = {
  Silver: 'Silver Augment',
  Gold: 'Gold Augment',
  Prismatic: 'Prismatic Augment',
}

// stats that should display as percentages
const PERCENT_STATS = new Set([
  'critical strike',
  'attack speed',
  'cooldown',
  'life steal',
  'omnivamp',
  'ability haste',
  'heal and shield',
  'tenacity',
  'move speed',
  'movement speed',
])

function formatStatValue(statName: string, statValue: number): string {
  const isPercent = Array.from(PERCENT_STATS).some(s => statName.toLowerCase().includes(s))
  return isPercent ? `${statValue}%` : `${statValue}`
}

// format description with passive name detection
function formatDescription(desc: string, cleanHtml = false): React.ReactNode {
  if (!desc) return null

  let processedDesc = desc
  if (cleanHtml) {
    processedDesc = desc
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const lines = processedDesc.split('\n').filter(line => line.trim())

  return lines.map((line, lineIdx) => {
    const elements: React.ReactNode[] = []
    let key = 0

    const passiveNameMatch = line.match(/^([^:]+):/)
    const hasPassiveName = passiveNameMatch && passiveNameMatch[1].length < 50

    let currentText = line

    if (hasPassiveName) {
      elements.push(
        <strong key={key++} className="text-gold-light font-bold uppercase">
          {passiveNameMatch[1]}
        </strong>
      )
      elements.push(<span key={key++}>: </span>)
      currentText = line.slice(passiveNameMatch[0].length)
    }

    const cleanedText = cleanWikiMarkup(currentText)
    const rendered = renderNestedMarkers(cleanedText, lineIdx * 10000)
    elements.push(...rendered)

    return (
      <div key={lineIdx} className="mb-1 last:mb-0">
        {elements}
      </div>
    )
  })
}

// augment-specific formatting (simpler, no passive detection)
function formatAugmentDescription(desc: string): React.ReactNode {
  if (!desc) return null

  const cleanedDesc = cleanWikiMarkup(desc)
  const lines = cleanedDesc.split('\n').filter(line => line.trim())

  return lines.map((line, lineIdx) => {
    const rendered = renderNestedMarkers(line, lineIdx * 10000)
    return (
      <div key={lineIdx} className="mb-2 last:mb-0">
        {rendered}
      </div>
    )
  })
}

// rune-specific formatting
function formatRuneDescription(desc: string): React.ReactNode {
  if (!desc) return null

  // clean HTML tags and normalize whitespace for runes
  const cleanedDesc = desc
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const lines = cleanedDesc.split('\n').filter(line => line.trim())

  return lines.map((line, lineIdx) => {
    const elements: React.ReactNode[] = []
    let key = 0

    const passiveNameMatch = line.match(/^([^:]+):/)
    const hasPassiveName = passiveNameMatch && passiveNameMatch[1].length < 50

    let currentText = line

    if (hasPassiveName) {
      elements.push(
        <strong key={key++} className="text-gold-light font-bold uppercase">
          {passiveNameMatch[1]}
        </strong>
      )
      elements.push(<span key={key++}>: </span>)
      currentText = line.slice(passiveNameMatch[0].length)
    }

    const cleanedText = cleanWikiMarkup(currentText)
    const rendered = renderNestedMarkers(cleanedText, lineIdx * 10000)
    elements.push(...rendered)

    return (
      <div key={lineIdx} className="mb-1 last:mb-0">
        {elements}
      </div>
    )
  })
}

// spell-specific formatting
function formatSpellDescription(desc: string): React.ReactNode {
  if (!desc) return null

  const lines = desc.split('\n').filter(line => line.trim())

  return lines.map((line, lineIdx) => {
    const elements: React.ReactNode[] = []
    let key = 0

    const passiveNameMatch = line.match(/^([^:]+):/)
    const hasPassiveName = passiveNameMatch && passiveNameMatch[1].length < 50

    let currentText = line

    if (hasPassiveName) {
      elements.push(
        <strong key={key++} className="text-gold-light font-bold uppercase">
          {passiveNameMatch[1]}
        </strong>
      )
      elements.push(<span key={key++}>: </span>)
      currentText = line.slice(passiveNameMatch[0].length)
    }

    const cleanedText = cleanWikiMarkup(currentText)
    const rendered = renderNestedMarkers(cleanedText, lineIdx * 10000)
    elements.push(...rendered)

    return (
      <div key={lineIdx} className="mb-1 last:mb-0">
        {elements}
      </div>
    )
  })
}

// item tooltip content
const ItemTooltipContent = memo(({ tooltipData, itemId }: { tooltipData: any; itemId: number }) => {
  const [ddragonVersion, setDdragonVersion] = useState<string>('15.23.1')

  useEffect(() => {
    getLatestVersion().then(setDdragonVersion)
  }, [])

  const formattedDescription = useMemo(() => formatDescription(tooltipData.description), [tooltipData.description])

  return (
    <div className="text-left p-1 min-w-0 max-w-[320px]">
      {/* header */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 flex-shrink-0 rounded border border-gold-dark/40 overflow-hidden relative">
            <Image
              src={getItemImageUrl(itemId, ddragonVersion)}
              alt={tooltipData.name}
              width={32}
              height={32}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
          <div className="text-sm font-semibold text-gold-light break-words min-w-0">{tooltipData.name}</div>
        </div>
        {tooltipData.totalCost !== undefined && tooltipData.totalCost > 0 && (
          <div
            className="text-sm font-semibold flex items-center gap-1 flex-shrink-0"
            style={{ color: 'var(--tooltip-gold)' }}
          >
            <img src="/icons/tooltips/gold_colored_icon.png" alt="gold" className="w-4 h-4" />
            {tooltipData.totalCost}
          </div>
        )}
      </div>

      {/* stats */}
      {tooltipData.stats && Object.keys(tooltipData.stats).length > 0 && (
        <>
          <div className="mb-2">
            {Object.entries(tooltipData.stats).map(([statName, statValue]) => (
              <div key={statName} className="text-xs text-white break-words">
                {formatStatValue(statName, statValue as number)} {statName}
              </div>
            ))}
          </div>
          <div className="h-px bg-gradient-to-r from-gold-dark/40 to-transparent -mx-4 mb-2" />
        </>
      )}

      {/* description */}
      {tooltipData.description && tooltipData.description.trim() !== '' && (
        <>
          <div className="text-xs text-gray-300 leading-relaxed break-words overflow-wrap-anywhere mb-2">
            {formattedDescription}
          </div>
          {tooltipData.itemType && tooltipData.itemType !== 'other' && (
            <div className="h-px bg-gradient-to-r from-gold-dark/40 to-transparent -mx-4 mb-2" />
          )}
        </>
      )}

      {/* item type */}
      {tooltipData.itemType && tooltipData.itemType !== 'other' && (
        <div className="text-xs text-gold-dark italic">{ITEM_TYPE_LABELS[tooltipData.itemType as TooltipType]}</div>
      )}
    </div>
  )
})
ItemTooltipContent.displayName = 'ItemTooltipContent'

// augment tooltip content
const AugmentTooltipContent = memo(({ tooltipData, augmentName }: { tooltipData: any; augmentName: string }) => {
  const formattedDescription = useMemo(
    () => formatAugmentDescription(tooltipData.description),
    [tooltipData.description]
  )

  const augmentEntry = (augmentsData as Record<string, { icon?: string; tier?: string }>)[augmentName]
  const iconName = augmentEntry?.icon
  const iconSrc = iconName ? `/icons/augments/${iconName}.png` : null

  return (
    <div className="text-left p-1 min-w-0 max-w-[320px]">
      {/* Header with icon */}
      <div className="flex items-center gap-2 mb-2">
        {iconSrc && (
          <div className="w-8 h-8 flex-shrink-0 rounded border border-gold-dark/40 overflow-hidden relative">
            <Image
              src={iconSrc}
              alt={tooltipData.name}
              width={32}
              height={32}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gold-light break-words">{tooltipData.name}</div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-gold-dark/40 to-transparent -mx-4 mb-2" />

      {/* Description */}
      {tooltipData.description && (
        <div className="text-xs text-gray-300 leading-relaxed break-words overflow-wrap-anywhere mb-2">
          {formattedDescription}
        </div>
      )}

      {/* Tier label at bottom like item types */}
      {tooltipData.tier && (
        <>
          <div className="h-px bg-gradient-to-r from-gold-dark/40 to-transparent -mx-4 mb-2" />
          <div className="text-xs text-gold-dark italic">{TIER_LABELS[tooltipData.tier] || `${tooltipData.tier} Augment`}</div>
        </>
      )}
    </div>
  )
})
AugmentTooltipContent.displayName = 'AugmentTooltipContent'

// rune tooltip content
const RuneTooltipContent = memo(({ tooltipData }: { tooltipData: any }) => {
  const formattedDescription = useMemo(() => formatRuneDescription(tooltipData.description || ''), [tooltipData.description])

  return (
    <div className="text-left p-1 min-w-0 max-w-[320px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {tooltipData.icon && (
          <div className="w-8 h-8 flex-shrink-0 rounded-full border-2 border-gold-dark/60 overflow-hidden relative">
            <Image
              src={`https://ddragon.leagueoflegends.com/cdn/img/${tooltipData.icon}`}
              alt={tooltipData.name}
              width={32}
              height={32}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
        )}
        <div className="text-sm font-semibold text-gold-light break-words min-w-0">{tooltipData.name}</div>
      </div>

      {/* Description */}
      {tooltipData.description && tooltipData.description.trim() !== '' && (
        <div className="text-xs text-gray-300 leading-relaxed break-words overflow-wrap-anywhere">
          {formattedDescription}
        </div>
      )}
    </div>
  )
})
RuneTooltipContent.displayName = 'RuneTooltipContent'

// spell tooltip content
const SpellTooltipContent = memo(({ tooltipData }: { tooltipData: any }) => {
  const formattedDescription = useMemo(
    () => formatSpellDescription(tooltipData.description),
    [tooltipData.description]
  )

  return (
    <div className="text-left p-1 min-w-0 max-w-[320px]">
      {/* Header */}
      <div className="mb-2">
        <div className="text-sm font-semibold text-gold-light break-words">{tooltipData.name}</div>
      </div>

      {/* Description */}
      {tooltipData.description && tooltipData.description.trim() !== '' && (
        <div className="text-xs text-gray-300 leading-relaxed break-words overflow-wrap-anywhere">
          {formattedDescription}
        </div>
      )}
    </div>
  )
})
SpellTooltipContent.displayName = 'SpellTooltipContent'

// main unified tooltip component
function Tooltip({ id, type, children }: TooltipProps) {
  const tooltipData = useMemo(() => {
    if (type === 'item') return getTooltipData(Number(id), 'item')
    if (type === 'rune') return getTooltipData(Number(id), 'rune')
    if (type === 'spell') return getTooltipData(Number(id), 'summoner-spell')
    if (type === 'augment') return getTooltipData(String(id), 'augment')
    return null
  }, [id, type])

  if (!tooltipData) {
    return <>{children}</>
  }

  let content: React.ReactNode = null
  if (type === 'item') {
    content = <ItemTooltipContent tooltipData={tooltipData} itemId={Number(id)} />
  } else if (type === 'augment') {
    content = <AugmentTooltipContent tooltipData={tooltipData} augmentName={String(id)} />
  } else if (type === 'rune') {
    content = <RuneTooltipContent tooltipData={tooltipData} />
  } else if (type === 'spell') {
    content = <SpellTooltipContent tooltipData={tooltipData} />
  }

  return <SimpleTooltip content={content}>{children}</SimpleTooltip>
}

export default memo(Tooltip)
