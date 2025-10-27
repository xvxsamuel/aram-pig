'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { getTooltipData, type TooltipType } from '../lib/tooltip-data'
import { cleanWikiMarkup } from '../lib/wiki-markup-simple'
import { getItemImageUrl, getRuneImageUrl } from '../lib/ddragon-client'

interface TooltipProps {
  id: number
  type?: 'item' | 'rune' | 'summoner-spell'
  children: React.ReactNode
  ddragonVersion?: string
}

// get item type label
function getItemTypeLabel(itemType: TooltipType): string {
  switch (itemType) {
    case 'legendary': return 'Legendary Item'
    case 'boots': return 'Boots'
    case 'component': return 'Component'
    case 'starter': return 'Starter Item'
    case 'consumable': return 'Consumable'
    default: return ''
  }
}

// get icon for wiki keywords (tip templates)
function getKeywordIcon(keyword: string): string | null {
  const lower = keyword.toLowerCase().trim()
  
  // status effects
  if (lower === 'slow' || lower === 'slowing' || lower === 'slows') return '/icons/tooltips/slow_icon.png'
  if (lower === 'stun' || lower === 'stuns' || lower === 'stunned') return '/icons/tooltips/stun_icon.png'
  if (lower === 'immobilize' || lower === 'immobilizing' || lower === 'immobilized') return '/icons/tooltips/stun_icon.png'
  if (lower === 'cripple' || lower === 'crippling' || lower === 'crippled') return '/icons/tooltips/cripple_icon.png'
  if (lower === 'stasis' || lower === 'stasis (buff)') return '/icons/tooltips/stasis_icon.png'
  if (lower === 'untargetable') return '/icons/tooltips/untargetable_icon.png'
  if (lower === 'invulnerable') return '/icons/tooltips/taric_cosmic_radiance.png'
  
  // unit types
  if (lower === 'melee') return '/icons/tooltips/melee_role_icon.png'
  if (lower === 'ranged') return '/icons/tooltips/ranged_role_icon.png'
  if (lower === 'minions' || lower === 'minion') return '/icons/tooltips/minion_icon.png'
  if (lower === 'monsters' || lower === 'monster') return '/icons/tooltips/monster_icon.png'
  
  // attack/damage types
  if (lower === 'on-hit') return '/icons/tooltips/on-hit_icon.png'
  if (lower === 'on-attack') return '/icons/tooltips/on-attack_icon.png'
  if (lower === 'critical strike' || lower === 'critically strikes') return '/icons/tooltips/critical_strike_icon.png'
  if (lower === 'takedown' || lower === 'takedowns') return '/icons/tooltips/damage_rating.png'
  
  // healing/shielding
  if (lower === 'heal' || lower === 'healing' || lower === 'healed') return '/icons/tooltips/heal_power_icon.png'
  if (lower === 'shield' || lower === 'shielding') return '/icons/tooltips/hybrid_resistances_icon.png'
  if (lower === 'spell shield') return '/icons/tooltips/sivir_spell_shield.png'
  if (lower === 'life steal') return '/icons/tooltips/lifesteal_icon.png'
  
  // vision
  if (lower === 'sight') return '/icons/tooltips/sight_icon.png'
  if (lower === 'stealth ward') return '/icons/tooltips/stealth_ward_icon.png'
  
  // range indicator
  if (lower === 'cr' || lower === 'er') return '/icons/tooltips/range_center.png'
  
  return null
}

// format stat value
function formatStatValue(statName: string, statValue: number): string {
  // check if this stat is typically shown as percentage
  const percentStats = ['critical strike', 'attack speed', 'cooldown', 'life steal', 'omnivamp', 
                       'ability haste', 'heal and shield', 'tenacity', 'move speed', 'movement speed']
  const isPercent = percentStats.some(s => statName.toLowerCase().includes(s))
  
  if (isPercent) {
    return `${statValue}%`
  }
  return `${statValue}`
}

// format description with color coding for wiki markup
// two-pass approach: clean wiki markup to text with markers, then render react elements
function formatDescription(desc: string, isRune: boolean = false): React.ReactNode {
  if (!desc) return null
  
  // for runes, strip HTML tags and clean up formatting
  let cleanedDesc = desc
  if (isRune) {
    // remove HTML tags but keep text content
    cleanedDesc = desc
      .replace(/<[^>]+>/g, '') // remove all HTML tags
      .replace(/&nbsp;/g, ' ') // replace &nbsp; with space
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .trim()
  }
  
  // split by newlines to handle multiple passives
  const lines = cleanedDesc.split('\n').filter(line => line.trim())
  
  return lines.map((line, lineIdx) => {
    const elements: React.ReactNode[] = []
    let key = 0
    
    // check if line starts with a passive name (text before first colon)
    const passiveNameMatch = line.match(/^([^:]+):/)
    const hasPassiveName = passiveNameMatch && passiveNameMatch[1].length < 50
    
    let currentText = line
    
    if (hasPassiveName) {
      // add passive name in gold uppercase
      elements.push(
        <strong key={key++} className="text-[#d4af37] font-bold uppercase">
          {passiveNameMatch[1]}
        </strong>
      )
      elements.push(<span key={key++}>: </span>)
      currentText = line.slice(passiveNameMatch[0].length)
    }
    
    // pass 1: clean wiki markup to text with markers
    const cleanedText = cleanWikiMarkup(currentText)
    
    // pass 2: recursively render all nested markers
    const rendered = renderNestedMarkers(cleanedText, lineIdx * 10000)
    elements.push(...rendered)
    
    return (
      <div key={lineIdx} className="mb-1 last:mb-0">
        {elements}
      </div>
    )
  })
}

// helper to recursively render nested markers (color tags, bold, italic)
function renderNestedMarkers(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  
  // split by all possible markers
  const segments = text.split(/(<ap>(?:(?!<\/ap>).)*<\/ap>|<rd>(?:(?!<\/rd>).)*<\/rd>|<gold>(?:(?!<\/gold>).)*<\/gold>|<vamp>(?:(?!<\/vamp>).)*<\/vamp>|<tip>(?:(?!<\/tip>).)*<\/tip>|<keyword>(?:(?!<\/keyword>).)*<\/keyword>|<ad>(?:(?!<\/ad>).)*<\/ad>|<ad-bonus>(?:(?!<\/ad-bonus>).)*<\/ad-bonus>|<health>(?:(?!<\/health>).)*<\/health>|<mana>(?:(?!<\/mana>).)*<\/mana>|<armor>(?:(?!<\/armor>).)*<\/armor>|<mr>(?:(?!<\/mr>).)*<\/mr>|<heal>(?:(?!<\/heal>).)*<\/heal>|<ms>(?:(?!<\/ms>).)*<\/ms>|<magic>(?:(?!<\/magic>).)*<\/magic>|<bold>(?:(?!<\/bold>).)*<\/bold>|<italic>(?:(?!<\/italic>).)*<\/italic>)/g)
  
  segments.forEach((segment, idx) => {
    if (!segment) return
    
    const key = `${baseKey}-${idx}`
    
    if (segment.startsWith('<ap>')) {
      const content = segment.slice(4, -5)
      parts.push(<span key={key} className="text-teal-400">{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<rd>')) {
      const content = segment.slice(4, -5)
      parts.push(<span key={key} style={{ whiteSpace: 'nowrap' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<gold>')) {
      const content = segment.slice(6, -7)
      parts.push(
        <span key={key} style={{ color: 'var(--tooltip-gold)', whiteSpace: 'nowrap' }}>
          <img src="/icons/tooltips/gold_colored_icon.png" alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
          {content}
        </span>
      )
    } else if (segment.startsWith('<magic>')) {
      const content = segment.slice(7, -8)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-magic)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<ad>')) {
      const content = segment.slice(4, -5)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-ad)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<ad-bonus>')) {
      const content = segment.slice(10, -11)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-ad-bonus)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<health>')) {
      const content = segment.slice(8, -9)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-health)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<mana>')) {
      const content = segment.slice(6, -7)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-mana)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<armor>')) {
      const content = segment.slice(7, -8)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-armor)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<mr>')) {
      const content = segment.slice(4, -5)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-mr)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<heal>')) {
      const content = segment.slice(6, -7)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-heal)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<vamp>')) {
      const content = segment.slice(6, -7)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-vamp)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<ms>')) {
      const content = segment.slice(4, -5)
      parts.push(<span key={key} style={{ color: 'var(--tooltip-ms)' }}>{renderNestedMarkers(content, idx * 1000)}</span>)
    } else if (segment.startsWith('<tip>')) {
      const content = segment.slice(5, -6)
      const tipParts = content.split('|||')
      if (tipParts.length === 2) {
        const [tipKeyword, displayText] = tipParts
        const icon = getKeywordIcon(tipKeyword)
        const lowerKeyword = tipKeyword.toLowerCase().trim()
        const isIconOnly = displayText === 'ICONONLY'
        
        // determine text color based on keyword type
        let textColor = 'text-white'
        if (lowerKeyword === 'heal' || lowerKeyword === 'healing' || lowerKeyword === 'healed' || 
            lowerKeyword === 'shield' || lowerKeyword === 'shielding') {
          textColor = '' // use style instead
        }
        
        if (icon) {
          if (isIconOnly) {
            // render only the icon without text
            parts.push(
              <img key={key} src={icon} alt={tipKeyword} className="inline h-[1em] w-auto align-baseline" />
            )
          } else {
            parts.push(
              <span key={key} className={textColor} style={{ whiteSpace: 'nowrap', ...((!textColor ? { color: 'var(--tooltip-heal)' } : {})) }}>
                <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
                {displayText}
              </span>
            )
          }
        } else {
          parts.push(<span key={key} className={textColor} style={!textColor ? { color: 'var(--tooltip-heal)' } : undefined}>{isIconOnly ? '' : displayText}</span>)
        }
      } else {
        parts.push(<span key={key} className="text-white">{content}</span>)
      }
    } else if (segment.startsWith('<keyword>')) {
      const content = segment.slice(9, -10)
      const icon = getKeywordIcon(content)
      if (icon) {
        parts.push(
          <span key={key} className="text-white" style={{ whiteSpace: 'nowrap' }}>
            <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
            {content}
          </span>
        )
      } else {
        parts.push(<span key={key} className="text-orange-400">{content}</span>)
      }
    } else if (segment.startsWith('<bold>')) {
      const content = segment.slice(6, -7)
      parts.push(<strong key={key}>{renderNestedMarkers(content, idx * 1000)}</strong>)
    } else if (segment.startsWith('<italic>')) {
      const content = segment.slice(8, -9)
      parts.push(<em key={key}>{renderNestedMarkers(content, idx * 1000)}</em>)
    } else {
      parts.push(segment)
    }
  })
  
  return parts
}

// unified tooltip component
export default function Tooltip({ id, type = 'item', children, ddragonVersion = '15.20.1' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  
  // hubris id override
  const actualId = id === 126697 ? 6697 : id
  const tooltipData = getTooltipData(actualId, type)

  useEffect(() => {
    const updatePosition = () => {
      if (isVisible && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.top
        })
      }
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isVisible])

  if (id === 0 || !tooltipData) {
    return <div className="inline-block">{children}</div>
  }

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-block relative"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: 'translate(-50%, calc(-100% - 8px))'
          }}
        >
          <div className="bg-[#1a1a1a] border border-[#785a28] rounded-lg p-3 shadow-xl w-80">
            {/* header with icon and name */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {type === 'item' && (
                  <div className="w-8 h-8 rounded border border-[#785a28] overflow-hidden relative">
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
                  <div className="w-8 h-8 rounded border border-[#785a28] overflow-hidden relative">
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
                <div className="text-sm font-semibold text-[#c8aa6e]">
                  {tooltipData.name}
                </div>
              </div>
              {tooltipData.totalCost !== undefined && tooltipData.totalCost > 0 && (
                <div className="text-sm font-semibold ml-2 flex items-center gap-1" style={{ color: 'var(--tooltip-gold)' }}>
                  <img 
                    src="/icons/tooltips/gold_colored_icon.png" 
                    alt="gold" 
                    className="w-4 h-4"
                  />
                  {tooltipData.totalCost}
                </div>
              )}
            </div>
            
            {/* stats */}
            {tooltipData.stats && Object.keys(tooltipData.stats).length > 0 && (
              <>
                <div className="mb-2">
                  {Object.entries(tooltipData.stats).map(([statName, statValue]) => {
                    return (
                      <div key={statName} className="text-xs text-white">
                        {formatStatValue(statName, statValue)} {statName}
                      </div>
                    )
                  })}
                </div>
                
                {/* separator line after stats */}
                <div className="h-px bg-gradient-to-r from-[#785a28]/50 via-[#785a28]/30 to-transparent mb-2" />
              </>
            )}
            
            {/* description */}
            {tooltipData.description && tooltipData.description.trim() !== '' && (
              <>
                <div className="text-xs text-gray-300 leading-relaxed break-words mb-2">
                  {formatDescription(tooltipData.description, type === 'rune')}
                </div>
                
                {/* separator line if there's an item type to show */}
                {tooltipData.itemType && tooltipData.itemType !== 'other' && (
                  <div className="h-px bg-gradient-to-r from-[#785a28]/50 via-[#785a28]/30 to-transparent mb-2" />
                )}
              </>
            )}
            
            {/* show item type label */}
            {tooltipData.itemType && tooltipData.itemType !== 'other' && (
              <div className="text-xs text-[#785a28] italic">
                {getItemTypeLabel(tooltipData.itemType)}
              </div>
            )}
          </div>
          
          {/* tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-8 border-transparent border-t-[#785a28]" />
          </div>
        </div>
      )}
    </>
  )
}
