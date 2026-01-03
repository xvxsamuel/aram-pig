'use client'

import { useMemo, memo } from 'react'
import Image from 'next/image'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import { getTooltipData, cleanWikiMarkup } from '@/lib/ui'
import augmentsData from '@/data/augments.json'

// Import the rendering logic from ItemTooltip
const MARKER_REGEX =
  /(<ap>(?:(?!<\/ap>).)*<\/ap>|<rd>(?:(?!<\/rd>).)*<\/rd>|<gold>(?:(?!<\/gold>).)*<\/gold>|<vamp>(?:(?!<\/vamp>).)*<\/vamp>|<tip>(?:(?!<\/tip>).)*<\/tip>|<keyword>(?:(?!<\/keyword>).)*<\/keyword>|<ad>(?:(?!<\/ad>).)*<\/ad>|<ad-bonus>(?:(?!<\/ad-bonus>).)*<\/ad-bonus>|<health>(?:(?!<\/health>).)*<\/health>|<mana>(?:(?!<\/mana>).)*<\/mana>|<armor>(?:(?!<\/armor>).)*<\/armor>|<mr>(?:(?!<\/mr>).)*<\/mr>|<heal>(?:(?!<\/heal>).)*<\/heal>|<ms>(?:(?!<\/ms>).)*<\/ms>|<magic>(?:(?!<\/magic>).)*<\/magic>|<bold>(?:(?!<\/bold>).)*<\/bold>|<italic>(?:(?!<\/italic>).)*<\/italic>)/g

const KEYWORD_ICON_MAP = new Map<string, string>([
  ['slow', '/icons/tooltips/slow_icon.png'],
  ['slowing', '/icons/tooltips/slow_icon.png'],
  ['slows', '/icons/tooltips/slow_icon.png'],
  ['stun', '/icons/tooltips/stun_icon.png'],
  ['stuns', '/icons/tooltips/stun_icon.png'],
  ['stunned', '/icons/tooltips/stun_icon.png'],
  ['immobilize', '/icons/tooltips/stun_icon.png'],
  ['immobilizing', '/icons/tooltips/stun_icon.png'],
  ['immobilized', '/icons/tooltips/stun_icon.png'],
  ['cripple', '/icons/tooltips/cripple_icon.png'],
  ['shield', '/icons/tooltips/hybrid_resistances_icon.png'],
  ['melee', '/icons/tooltips/melee_role_icon.png'],
  ['ranged', '/icons/tooltips/ranged_role_icon.png'],
  ['minions', '/icons/tooltips/minion_icon.png'],
  ['minion', '/icons/tooltips/minion_icon.png'],
  ['monsters', '/icons/tooltips/monster_icon.png'],
  ['cr', '/icons/tooltips/range_center.png'],
])

function getKeywordIcon(keyword: string): string | null {
  return KEYWORD_ICON_MAP.get(keyword.toLowerCase().trim()) || null
}

function renderNestedMarkers(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const segments = text.split(MARKER_REGEX)

  let key = 0
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue

    const keyStr = `${baseKey}-${key++}`

    if (segment.startsWith('<ap>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ap)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<rd>')) {
      parts.push(
        <span key={keyStr} style={{ whiteSpace: 'nowrap' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<gold>')) {
      const content = segment.slice(6, -7)
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-gold)', whiteSpace: 'nowrap' }}>
          <img
            src="/icons/tooltips/gold_colored_icon.png"
            alt=""
            className="inline h-[1em] w-auto align-baseline mr-0.5"
          />
          {content}
        </span>
      )
    } else if (segment.startsWith('<magic>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-magic)' }}>
          {renderNestedMarkers(segment.slice(7, -8), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<ad>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ad)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<ad-bonus>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ad-bonus)' }}>
          {renderNestedMarkers(segment.slice(10, -11), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<health>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-health)' }}>
          {renderNestedMarkers(segment.slice(8, -9), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<mana>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-mana)' }}>
          {renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<armor>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-armor)' }}>
          {renderNestedMarkers(segment.slice(7, -8), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<mr>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-mr)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<heal>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-heal)' }}>
          {renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<vamp>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-vamp)' }}>
          {renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<ms>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ms)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<tip>')) {
      const content = segment.slice(5, -6)
      const tipParts = content.split('|||')
      if (tipParts.length === 2) {
        const [tipKeyword, displayText] = tipParts
        const icon = getKeywordIcon(tipKeyword)
        const isIconOnly = displayText === 'ICONONLY'

        if (icon) {
          if (isIconOnly) {
            parts.push(
              <img key={keyStr} src={icon} alt={tipKeyword} className="inline h-[1em] w-auto align-baseline" />
            )
          } else {
            parts.push(
              <span key={keyStr} style={{ whiteSpace: 'nowrap' }}>
                <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
                {displayText}
              </span>
            )
          }
        } else {
          parts.push(<span key={keyStr}>{isIconOnly ? '' : displayText}</span>)
        }
      } else {
        parts.push(<span key={keyStr}>{content}</span>)
      }
    } else if (segment.startsWith('<keyword>')) {
      const content = segment.slice(9, -10)
      const icon = getKeywordIcon(content)
      if (icon) {
        parts.push(
          <span key={keyStr} style={{ whiteSpace: 'nowrap' }}>
            <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
            {content}
          </span>
        )
      } else {
        parts.push(
          <span key={keyStr} className="text-gold-light">
            {content}
          </span>
        )
      }
    } else if (segment.startsWith('<bold>')) {
      parts.push(<strong key={keyStr}>{renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}</strong>)
    } else if (segment.startsWith('<italic>')) {
      parts.push(<em key={keyStr}>{renderNestedMarkers(segment.slice(8, -9), baseKey * 1000)}</em>)
    } else {
      parts.push(segment)
    }
  }

  return parts
}

function formatDescription(desc: string): React.ReactNode {
  if (!desc) return null

  // Clean wiki markup first (this converts <br> to \n)
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

// Tier label mapping
const TIER_LABELS: Record<string, string> = {
  Silver: 'Silver Augment',
  Gold: 'Gold Augment',
  Prismatic: 'Prismatic Augment',
}

interface AugmentTooltipProps {
  augmentName: string
  children: React.ReactNode
}

const AugmentTooltipContent = memo(({ tooltipData, augmentName }: { tooltipData: any; augmentName: string }) => {
  const formattedDescription = useMemo(
    () => formatDescription(tooltipData.description),
    [tooltipData.description]
  )

  // Get augment icon from augments.json
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

export default function AugmentTooltip({ augmentName, children }: AugmentTooltipProps) {
  const tooltipData = useMemo(() => getTooltipData(augmentName, 'augment'), [augmentName])
  
  if (!tooltipData) {
    return <>{children}</>
  }

  return (
    <SimpleTooltip content={<AugmentTooltipContent tooltipData={tooltipData} augmentName={augmentName} />}>
      {children}
    </SimpleTooltip>
  )
}
