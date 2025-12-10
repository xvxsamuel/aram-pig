'use client'

import { useMemo, memo } from 'react'
import { getTooltipData, cleanWikiMarkup } from '@/lib/ui'
import SimpleTooltip from './SimpleTooltip'
import { renderNestedMarkers } from './tooltip-utils'

interface SummonerSpellTooltipProps {
  spellId: number
  children: React.ReactNode
}

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

const SummonerSpellTooltipContent = memo(({ tooltipData }: { tooltipData: any }) => {
  const formattedDescription = useMemo(
    () => formatSpellDescription(tooltipData.description),
    [tooltipData.description]
  )

  return (
    <div className="text-left p-1 min-w-0 max-w-[320px]">
      {/* header */}
      <div className="mb-2">
        <div className="text-sm font-semibold text-gold-light break-words">{tooltipData.name}</div>
      </div>

      {/* description */}
      {tooltipData.description && tooltipData.description.trim() !== '' && (
        <div className="text-xs text-gray-300 leading-relaxed break-words overflow-wrap-anywhere">
          {formattedDescription}
        </div>
      )}
    </div>
  )
})

SummonerSpellTooltipContent.displayName = 'SummonerSpellTooltipContent'

export default function SummonerSpellTooltip({ spellId, children }: SummonerSpellTooltipProps) {
  const tooltipData = useMemo(() => getTooltipData(spellId, 'summoner-spell'), [spellId])

  if (spellId === 0 || !tooltipData) {
    return <div className="inline-block">{children}</div>
  }

  return (
    <SimpleTooltip content={<SummonerSpellTooltipContent tooltipData={tooltipData} />}>
      {children}
    </SimpleTooltip>
  )
}
