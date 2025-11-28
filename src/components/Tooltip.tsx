'use client'

import { useState, useEffect, useMemo, memo } from 'react'
import Image from 'next/image'
import { getTooltipData, type TooltipType } from '../lib/tooltip-data'
import { cleanWikiMarkup } from '../lib/wiki-markup-simple'
import { getItemImageUrl, getLatestVersion } from '../lib/ddragon-client'
import SimpleTooltip from './SimpleTooltip'

interface TooltipProps {
  id: number
  type?: 'item' | 'rune' | 'summoner-spell'
  children: React.ReactNode
}

const KEYWORD_ICON_MAP = new Map<string, string>([
  // status effects
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
  ['crippling', '/icons/tooltips/cripple_icon.png'],
  ['crippled', '/icons/tooltips/cripple_icon.png'],
  ['stasis', '/icons/tooltips/stasis_icon.png'],
  ['stasis (buff)', '/icons/tooltips/stasis_icon.png'],
  ['untargetable', '/icons/tooltips/untargetable_icon.png'],
  ['invulnerable', '/icons/tooltips/taric_cosmic_radiance.png'],
  // unit types
  ['melee', '/icons/tooltips/melee_role_icon.png'],
  ['ranged', '/icons/tooltips/ranged_role_icon.png'],
  ['minions', '/icons/tooltips/minion_icon.png'],
  ['minion', '/icons/tooltips/minion_icon.png'],
  ['monsters', '/icons/tooltips/monster_icon.png'],
  ['monster', '/icons/tooltips/monster_icon.png'],
  // attack/damage types
  ['on-hit', '/icons/tooltips/on-hit_icon.png'],
  ['on-attack', '/icons/tooltips/on-attack_icon.png'],
  ['critical strike', '/icons/tooltips/critical_strike_icon.png'],
  ['critically strikes', '/icons/tooltips/critical_strike_icon.png'],
  ['takedown', '/icons/tooltips/damage_rating.png'],
  ['takedowns', '/icons/tooltips/damage_rating.png'],
  // healing/shielding
  ['heal', '/icons/tooltips/heal_power_icon.png'],
  ['healing', '/icons/tooltips/heal_power_icon.png'],
  ['healed', '/icons/tooltips/heal_power_icon.png'],
  ['shield', '/icons/tooltips/hybrid_resistances_icon.png'],
  ['shielding', '/icons/tooltips/hybrid_resistances_icon.png'],
  ['spell shield', '/icons/tooltips/sivir_spell_shield.png'],
  ['life steal', '/icons/tooltips/lifesteal_icon.png'],
  // vision
  ['sight', '/icons/tooltips/sight_icon.png'],
  ['stealth ward', '/icons/tooltips/stealth_ward_icon.png'],
  // range indicator
  ['cr', '/icons/tooltips/range_center.png'],
  ['er', '/icons/tooltips/range_center.png'],
])

// optimized keyword icon lookup
function getKeywordIcon(keyword: string): string | null {
  return KEYWORD_ICON_MAP.get(keyword.toLowerCase().trim()) || null
}

// item type label lookup
const ITEM_TYPE_LABELS: Record<TooltipType, string> = {
  legendary: 'Legendary Item',
  boots: 'Boots',
  component: 'Component',
  starter: 'Starter Item',
  consumable: 'Consumable',
  other: 'Special Item',
}

// percentage stats for formatting
const PERCENT_STATS = new Set([
  'critical strike', 'attack speed', 'cooldown', 'life steal', 'omnivamp',
  'ability haste', 'heal and shield', 'tenacity', 'move speed', 'movement speed'
])

// format stat value (memoized via useMemo in parent)
function formatStatValue(statName: string, statValue: number): string {
  const isPercent = Array.from(PERCENT_STATS).some(s => statName.toLowerCase().includes(s))
  return isPercent ? `${statValue}%` : `${statValue}`
}

// optimized marker regex (compiled once)
const MARKER_REGEX = /(<ap>(?:(?!<\/ap>).)*<\/ap>|<rd>(?:(?!<\/rd>).)*<\/rd>|<gold>(?:(?!<\/gold>).)*<\/gold>|<vamp>(?:(?!<\/vamp>).)*<\/vamp>|<tip>(?:(?!<\/tip>).)*<\/tip>|<keyword>(?:(?!<\/keyword>).)*<\/keyword>|<ad>(?:(?!<\/ad>).)*<\/ad>|<ad-bonus>(?:(?!<\/ad-bonus>).)*<\/ad-bonus>|<health>(?:(?!<\/health>).)*<\/health>|<mana>(?:(?!<\/mana>).)*<\/mana>|<armor>(?:(?!<\/armor>).)*<\/armor>|<mr>(?:(?!<\/mr>).)*<\/mr>|<heal>(?:(?!<\/heal>).)*<\/heal>|<ms>(?:(?!<\/ms>).)*<\/ms>|<magic>(?:(?!<\/magic>).)*<\/magic>|<bold>(?:(?!<\/bold>).)*<\/bold>|<italic>(?:(?!<\/italic>).)*<\/italic>)/g

// render nested markers recursively (memoized per description)
function renderNestedMarkers(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const segments = text.split(MARKER_REGEX)
  
  let key = 0
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue
    
    const keyStr = `${baseKey}-${key++}`
    
    // check tag type via startsWith (faster than regex)
    if (segment.startsWith('<ap>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-ap)' }}>{renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<rd>')) {
      parts.push(<span key={keyStr} style={{ whiteSpace: 'nowrap' }}>{renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<gold>')) {
      const content = segment.slice(6, -7)
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-gold)', whiteSpace: 'nowrap' }}>
          <img src="/icons/tooltips/gold_colored_icon.png" alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
          {content}
        </span>
      )
    } else if (segment.startsWith('<magic>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-magic)' }}>{renderNestedMarkers(segment.slice(7, -8), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<ad>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-ad)' }}>{renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<ad-bonus>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-ad-bonus)' }}>{renderNestedMarkers(segment.slice(10, -11), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<health>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-health)' }}>{renderNestedMarkers(segment.slice(8, -9), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<mana>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-mana)' }}>{renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<armor>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-armor)' }}>{renderNestedMarkers(segment.slice(7, -8), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<mr>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-mr)' }}>{renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<heal>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-heal)' }}>{renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<vamp>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-vamp)' }}>{renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<ms>')) {
      parts.push(<span key={keyStr} style={{ color: 'var(--tooltip-ms)' }}>{renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}</span>)
    } else if (segment.startsWith('<tip>')) {
      const content = segment.slice(5, -6)
      const tipParts = content.split('|||')
      if (tipParts.length === 2) {
        const [tipKeyword, displayText] = tipParts
        const icon = getKeywordIcon(tipKeyword)
        const isIconOnly = displayText === 'ICONONLY'
        
        if (icon) {
          if (isIconOnly) {
            parts.push(<img key={keyStr} src={icon} alt={tipKeyword} className="inline h-[1em] w-auto align-baseline" />)
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
        parts.push(<span key={keyStr} className="text-gold-light">{content}</span>)
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

// format description - memoized per tooltip
function formatDescription(desc: string, isRune: boolean = false): React.ReactNode {
  if (!desc) return null
  
  let cleanedDesc = desc
  if (isRune) {
    cleanedDesc = desc
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
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

// memoized tooltip content component
const TooltipContent = memo(({ 
  tooltipData, 
  actualId, 
  type 
}: { 
  tooltipData: any
  actualId: number
  type: 'item' | 'rune' | 'summoner-spell'
}) => {
  // get cached ddragon version
  const [ddragonVersion, setDdragonVersion] = useState<string>('15.23.1')
  
  useEffect(() => {
    getLatestVersion().then(setDdragonVersion)
  }, [])
  
  // memoize formatted description
  const formattedDescription = useMemo(
    () => formatDescription(tooltipData.description, type === 'rune'),
    [tooltipData.description, type]
  )
  
  return (
    <div className="w-80 text-left p-1">
      {/* header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {type === 'item' && (
            <div className="w-8 h-8 rounded border border-gold-dark/40 overflow-hidden relative">
              <Image 
                src={getItemImageUrl(actualId, ddragonVersion)}
                alt={tooltipData.name}
                width={32}
                height={32}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
          )}
          {type === 'rune' && tooltipData.icon && (
            <div className="w-8 h-8 rounded border border-gold-dark/40 overflow-hidden relative">
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
          <div className="text-sm font-semibold text-gold-light">
            {tooltipData.name}
          </div>
        </div>
        {tooltipData.totalCost !== undefined && tooltipData.totalCost > 0 && (
          <div className="text-sm font-semibold ml-2 flex items-center gap-1" style={{ color: 'var(--tooltip-gold)' }}>
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
              <div key={statName} className="text-xs text-white">
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
          <div className="text-xs text-gray-300 leading-relaxed break-words mb-2">
            {formattedDescription}
          </div>
          {tooltipData.itemType && tooltipData.itemType !== 'other' && (
            <div className="h-px bg-gradient-to-r from-gold-dark/40 to-transparent -mx-4 mb-2" />
          )}
        </>
      )}
      
      {/* item type */}
      {tooltipData.itemType && tooltipData.itemType !== 'other' && (
        <div className="text-xs text-gold-dark italic">
          {ITEM_TYPE_LABELS[tooltipData.itemType as TooltipType]}
        </div>
      )}
    </div>
  )
})

TooltipContent.displayName = 'TooltipContent'

// main tooltip component - uses SimpleTooltip for positioning
export default function Tooltip({ id, type = 'item', children }: TooltipProps) {
  // hubris id override
  const actualId = id === 126697 ? 6697 : id
  
  // memoize tooltip data (only changes if id/type changes)
  const tooltipData = useMemo(
    () => getTooltipData(actualId, type),
    [actualId, type]
  )

  if (id === 0 || !tooltipData) {
    return <div className="inline-block">{children}</div>
  }

  return (
    <SimpleTooltip
      content={
        <TooltipContent 
          tooltipData={tooltipData}
          actualId={actualId}
          type={type}
        />
      }
    >
      {children}
    </SimpleTooltip>
  )
}
