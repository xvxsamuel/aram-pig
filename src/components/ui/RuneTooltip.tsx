'use client'

import { useMemo, memo } from 'react'
import Image from 'next/image'
import { getTooltipData, cleanWikiMarkup } from '@/lib/ui'
import SimpleTooltip from './SimpleTooltip'
import { renderNestedMarkers } from './tooltip-utils'

interface RuneTooltipProps {
  runeId: number
  children: React.ReactNode
}

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

const RuneTooltipContent = memo(({ tooltipData, runeId: _runeId }: { tooltipData: any; runeId: number }) => {
  const formattedDescription = useMemo(() => formatRuneDescription(tooltipData.description), [tooltipData.description])

  return (
    <div className="text-left p-1 min-w-0 max-w-[320px]">
      {/* header */}
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

      {/* description */}
      {tooltipData.description && tooltipData.description.trim() !== '' && (
        <div className="text-xs text-gray-300 leading-relaxed break-words overflow-wrap-anywhere">
          {formattedDescription}
        </div>
      )}
    </div>
  )
})

RuneTooltipContent.displayName = 'RuneTooltipContent'

export default function RuneTooltip({ runeId, children }: RuneTooltipProps) {
  const tooltipData = useMemo(() => getTooltipData(runeId, 'rune'), [runeId])

  if (runeId === 0 || !tooltipData) {
    return <div className="inline-block">{children}</div>
  }

  return (
    <SimpleTooltip content={<RuneTooltipContent tooltipData={tooltipData} runeId={runeId} />}>
      {children}
    </SimpleTooltip>
  )
}
