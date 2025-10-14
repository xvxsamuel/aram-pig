'use client'

import { useState, useRef, useEffect } from 'react'
import { getTooltipData, type TooltipType } from '../lib/tooltip-data'
import { cleanWikiMarkup } from '../lib/wiki-markup-simple'

interface TooltipProps {
  id: number
  type?: 'item' | 'rune' | 'summoner-spell'
  children: React.ReactNode
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
  if (lower === 'stasis' || lower === 'stasis (buff)') return '/icons/tooltips/stasis_icon.png'
  if (lower === 'untargetable') return '/icons/tooltips/untargetable_icon.png'
  
  // unit types
  if (lower === 'melee') return '/icons/tooltips/melee_role_icon.png'
  if (lower === 'ranged') return '/icons/tooltips/ranged_role_icon.png'
  if (lower === 'minions' || lower === 'minion') return '/icons/tooltips/minion_icon.png'
  if (lower === 'monsters' || lower === 'monster') return '/icons/tooltips/monster_icon.png'
  
  // attack/damage types
  if (lower === 'on-hit') return '/icons/tooltips/on-hit_icon.png'
  if (lower === 'on-attack') return '/icons/tooltips/on-attack_icon.png'
  if (lower === 'critical strike' || lower === 'critically strikes') return '/icons/tooltips/critical_strike_icon.png'
  
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
    
    // pass 2: split by markers and render react elements
    // split by <scaling>, <tip>, <keyword>, <ad>, <ad-bonus>, <health>, <mana>, <heal>, <ms>, <magic>, <italic>, <bold> markers while keeping them in the result
    const parts = cleanedText.split(/(<scaling>.*?<\/scaling>|<tip>.*?<\/tip>|<keyword>.*?<\/keyword>|<ad>.*?<\/ad>|<ad-bonus>.*?<\/ad-bonus>|<health>.*?<\/health>|<mana>.*?<\/mana>|<heal>.*?<\/heal>|<ms>.*?<\/ms>|<magic>.*?<\/magic>|<italic>.*?<\/italic>|<bold>.*?<\/bold>)/g)
    
    parts.forEach((part: string) => {
      if (!part) return
      
      if (part.startsWith('<scaling>')) {
        // teal text for ability scaling
        const content = part.slice(9, -10) // remove <scaling> and </scaling>
        elements.push(<span key={key++} className="text-teal-400">{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<tip>')) {
        // white/gray text for tips with icon (no color)
        const content = part.slice(5, -6) // remove <tip> and </tip>
        
        // check for keyword|||display format
        const parts = content.split('|||')
        if (parts.length === 2) {
          const [tipKeyword, displayText] = parts
          const icon = getKeywordIcon(tipKeyword)
          
          if (icon) {
            elements.push(
              <span key={key++} className="text-white">
                <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
                {displayText}
              </span>
            )
          } else {
            elements.push(<span key={key++} className="text-white">{displayText}</span>)
          }
        } else {
          elements.push(<span key={key++} className="text-white">{content}</span>)
        }
      } else if (part.startsWith('<keyword>')) {
        // orange text for keywords (sti/ai icons)
        const content = part.slice(9, -10) // remove <keyword> and </keyword>
        elements.push(<span key={key++} className="text-orange-400">{content}</span>)
      } else if (part.startsWith('<ad>')) {
        // yellowish orange for base AD
        const content = part.slice(4, -5) // remove <ad> and </ad>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-ad)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<ad-bonus>')) {
        // darker orange for bonus physical damage
        const content = part.slice(10, -11) // remove <ad-bonus> and </ad-bonus>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-ad-bonus)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<health>')) {
        // green for health
        const content = part.slice(8, -9) // remove <health> and </health>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-health)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<mana>')) {
        // blue for mana
        const content = part.slice(6, -7) // remove <mana> and </mana>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-mana)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<heal>')) {
        // bright green for healing/shielding
        const content = part.slice(6, -7) // remove <heal> and </heal>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-heal)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<ms>')) {
        // lime green for movement speed
        const content = part.slice(4, -5) // remove <ms> and </ms>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-ms)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<magic>')) {
        // purple for AP/magic damage
        const content = part.slice(7, -8) // remove <magic> and </magic>
        elements.push(<span key={key++} style={{ color: 'var(--tooltip-magic)' }}>{renderInlineFormatting(content, key)}</span>)
      } else if (part.startsWith('<italic>')) {
        // italic text
        const content = part.slice(8, -9) // remove <italic> and </italic>
        elements.push(<em key={key++}>{content}</em>)
      } else if (part.startsWith('<bold>')) {
        // bold text - inherit parent color
        const content = part.slice(6, -7) // remove <bold> and </bold>
        elements.push(<strong key={key++}>{content}</strong>)
      } else {
        // regular text - check for inline formatting (bold/italic)
        const formatted = renderInlineFormatting(part, key)
        if (formatted.length > 0) {
          elements.push(<span key={key++}>{formatted}</span>)
        }
      }
    })
    
    return (
      <div key={lineIdx} className="mb-1 last:mb-0">
        {elements}
      </div>
    )
  })
}

// helper to render bold/italic formatting within colored text
function renderInlineFormatting(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // split by <bold> and <italic> markers
  const segments = text.split(/(<bold>.*?<\/bold>|<italic>.*?<\/italic>)/g)
  
  segments.forEach((segment, idx) => {
    if (!segment) return
    
    if (segment.startsWith('<bold>')) {
      const content = segment.slice(6, -7)
      parts.push(<strong key={`${baseKey}-${idx}`}>{content}</strong>)
    } else if (segment.startsWith('<italic>')) {
      const content = segment.slice(8, -9)
      parts.push(<em key={`${baseKey}-${idx}`}>{content}</em>)
    } else {
      parts.push(<span key={`${baseKey}-${idx}`}>{segment}</span>)
    }
  })
  
  return parts
}

// unified tooltip component
export default function Tooltip({ id, type = 'item', children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipData = getTooltipData(id, type)

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
                  <img 
                    src={`https://ddragon.leagueoflegends.com/cdn/14.23.1/img/item/${id}.png`}
                    alt={tooltipData.name}
                    className="w-8 h-8 rounded border border-[#785a28]"
                  />
                )}
                {type === 'rune' && tooltipData.icon && (
                  <img 
                    src={`https://ddragon.leagueoflegends.com/cdn/img/${tooltipData.icon}`}
                    alt={tooltipData.name}
                    className="w-8 h-8 rounded border border-[#785a28]"
                  />
                )}
                <div className="text-sm font-semibold text-[#c8aa6e]">
                  {tooltipData.name}
                </div>
              </div>
              {tooltipData.totalCost !== undefined && tooltipData.totalCost > 0 && (
                <div className="text-sm font-semibold text-[#d4af37] ml-2 flex items-center gap-1">
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
