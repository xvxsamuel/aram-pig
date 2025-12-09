'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { ChevronDownIcon } from '@heroicons/react/24/solid'
import type { MatchData } from '@/types/match'
import {
  getChampionImageUrl,
  getSummonerSpellUrl,
  getItemImageUrl,
  getRuneImageUrl,
  getRuneStyleImageUrl,
} from '@/lib/ddragon'
import { getChampionUrlName } from '@/lib/ddragon'
import { getKdaColor, getPigScoreColor } from '@/lib/ui'
import MatchDetails from '@/components/match/MatchDetails'
import Tooltip from '@/components/ui/Tooltip'

// preload images for MatchDetails on hover
function preloadMatchImages(match: MatchData, ddragonVersion: string) {
  const urls: string[] = []

  for (const p of match.info.participants) {
    // champion image
    urls.push(getChampionImageUrl(p.championName, ddragonVersion))

    // summoner spells
    urls.push(getSummonerSpellUrl(p.summoner1Id, ddragonVersion))
    urls.push(getSummonerSpellUrl(p.summoner2Id, ddragonVersion))

    // keystone rune
    if (p.perks?.styles?.[0]?.selections?.[0]?.perk) {
      urls.push(getRuneImageUrl(p.perks.styles[0].selections[0].perk))
    }

    // items
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
    for (const item of items) {
      if (item && item > 0) {
        urls.push(getItemImageUrl(item, ddragonVersion))
      }
    }
  }

  // use link preload for better browser caching
  for (const url of urls) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    // avoid duplicate preloads
    if (!document.querySelector(`link[href="${url}"]`)) {
      document.head.appendChild(link)
    }
  }
}

interface Props {
  match: MatchData
  puuid: string
  region: string
  ddragonVersion: string
  championNames: Record<string, string>
}

export default function MatchHistoryItem({ match, puuid, region, ddragonVersion, championNames }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'build' | 'performance'>('overview')
  const hasPreloaded = useRef(false)

  // preload images on first hover
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    if (!hasPreloaded.current) {
      hasPreloaded.current = true
      preloadMatchImages(match, ddragonVersion)
    }
  }, [match, ddragonVersion])

  const participant = match.info.participants.find(p => p.puuid === puuid)
  if (!participant) return null

  // check if game was a remake
  const isRemake = participant.gameEndedInEarlySurrender
  const isWin = participant.win
  const kda =
    participant.deaths === 0 ? 'Perfect' : ((participant.kills + participant.assists) / participant.deaths).toFixed(2)

  const gameDurationMinutes = Math.floor(match.info.gameDuration / 60)
  const gameDurationSeconds = match.info.gameDuration % 60
  const gameDate = new Date(match.info.gameCreation)
  const timeAgo = getTimeAgo(gameDate)

  const team1 = match.info.participants.filter(p => p.teamId === 100)
  const team2 = match.info.participants.filter(p => p.teamId === 200)

  const showBorder = isExpanded || isHovered

  const matchLabel = `Match ${match.metadata.matchId.split('_')[1]}, ${participant.championName}, ${isRemake ? 'Remake' : isWin ? 'Victory' : 'Defeat'}, ${participant.kills}/${participant.deaths}/${participant.assists}`

  return (
    <li role="listitem" aria-label={matchLabel} className="relative rounded-lg p-px">
      {/* border anim */}
      <motion.div
        className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-light to-gold-dark"
        initial={{ opacity: 0 }}
        animate={{ opacity: showBorder ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />

      {/* content wrapper */}
      <div className="relative rounded-lg overflow-hidden bg-abyss-600">
        <div
          className="group flex cursor-pointer"
          onClick={() => {
            if (isExpanded) {
              setIsExpanded(false)
              setSelectedTab('overview') // reset
            } else {
              setIsExpanded(true)
            }
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setIsHovered(false)}
          role="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} match details`}
        >
          {/* main content */}
          <div
            className={clsx(
              'flex-1',
              isExpanded ? 'rounded-tl-lg' : 'rounded-l-lg',
              isRemake ? 'bg-remake' : isWin ? 'bg-win' : 'bg-loss'
            )}
          >
            <div className="flex items-center justify-between px-4 py-2 min-h-[84px]">
              {/* game result */}
              <div className="flex flex-col justify-center gap-2.5 w-16 flex-shrink-0">
                <div>
                  <div
                    className={clsx(
                      'text-sm font-bold tracking-wide',
                      isRemake ? 'text-text-muted' : isWin ? 'text-victory' : 'text-defeat'
                    )}
                  >
                    {isRemake ? 'REMAKE' : isWin ? 'VICTORY' : 'DEFEAT'}
                  </div>
                  <div className="text-xs text-text-muted">{timeAgo}</div>
                </div>
                <div className="text-xs text-text-muted">
                  {gameDurationMinutes}:{gameDurationSeconds.toString().padStart(2, '0')}
                </div>
              </div>

              {/* champion icon, spells & runes */}
              {(() => {
                const hasPigScore = participant.pigScore !== null && participant.pigScore !== undefined
                const labels: string[] = participant.labels || []
                const hasLabels = labels.length > 0

                return (
                  <div className="flex gap-1 flex-shrink-0 items-center">
                    {/* champion icon column w/ pig score */}
                    <div className="flex flex-col items-center w-[54px] gap-1">
                      <Link
                        href={`/champions/${getChampionUrlName(participant.championName, championNames)}`}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="relative p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-lg">
                          <div className="relative w-12 h-12 rounded-[calc(0.5rem-1px)] overflow-hidden bg-abyss-800">
                            <Image
                              src={getChampionImageUrl(participant.championName, ddragonVersion)}
                              alt={participant.championName}
                              width={64}
                              height={64}
                              className="w-full h-full scale-112 object-cover"
                              unoptimized
                            />
                            <div className="absolute inset-0 rounded-[calc(0.5rem-1px)] shadow-[inset_0_0_3px_1px_rgba(0,0,0,0.9)] pointer-events-none" />
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full">
                            <div className="bg-abyss-600 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-normal leading-none text-white pt-px">
                              {participant.champLevel}
                            </div>
                          </div>
                        </div>
                      </Link>

                      {hasPigScore && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedTab('performance')
                            setIsExpanded(true)
                          }}
                          className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full cursor-pointer flex"
                        >
                          <div className="bg-abyss-700 rounded-full px-1.5 py-1.5 text-[10px] font-bold leading-none flex items-center gap-1">
                            <span style={{ color: getPigScoreColor(participant.pigScore!) }}>
                              {participant.pigScore}
                            </span>
                            <span className="text-white">PIG</span>
                          </div>
                        </button>
                      )}
                    </div>

                    {/* spells & runes */}
                    <div className="flex gap-1 items-center">
                      <div className="flex flex-col gap-0.5">
                        <Tooltip id={participant.summoner1Id} type="summoner-spell">
                          <div className="w-6 h-6 rounded overflow-hidden bg-abyss-800 border border-gold-dark">
                            <Image
                              src={getSummonerSpellUrl(participant.summoner1Id, ddragonVersion)}
                              alt="Spell 1"
                              width={24}
                              height={24}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                        <Tooltip id={participant.summoner2Id} type="summoner-spell">
                          <div className="w-6 h-6 rounded overflow-hidden bg-abyss-800 border border-gold-dark">
                            <Image
                              src={getSummonerSpellUrl(participant.summoner2Id, ddragonVersion)}
                              alt="Spell 2"
                              width={24}
                              height={24}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        {participant.perks?.styles?.[0]?.selections?.[0]?.perk && (
                          <Tooltip id={participant.perks.styles[0].selections[0].perk} type="rune">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-abyss-800 border border-gold-dark">
                              <Image
                                src={getRuneImageUrl(participant.perks.styles[0].selections[0].perk)}
                                alt="Primary Rune"
                                width={24}
                                height={24}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </div>
                          </Tooltip>
                        )}
                        {participant.perks?.styles?.[1]?.style && (
                          <Tooltip id={participant.perks.styles[1].style} type="rune">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-abyss-800 border border-gold-dark flex items-center justify-center">
                              <Image
                                src={getRuneStyleImageUrl(participant.perks.styles[1].style)}
                                alt="Secondary Rune"
                                width={18}
                                height={18}
                                className="w-4 h-4 object-contain"
                                unoptimized
                              />
                            </div>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {hasLabels && (
                      <div className="flex items-center gap-0.5 flex-wrap">
                        {labels.map((label, idx) => (
                          <div
                            key={idx}
                            className="px-1.5 py-1 bg-abyss-700 border border-gold-dark/50 rounded text-[10px] font-medium text-text-muted"
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* kda */}
              <div className="flex flex-col justify-center items-center flex-shrink-0 min-w-[75px]">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold text-white tabular-nums">{participant.kills}</span>
                  <span className="text-text-muted text-sm">/</span>
                  <span className="text-lg font-bold text-negative tabular-nums">{participant.deaths}</span>
                  <span className="text-text-muted text-sm">/</span>
                  <span className="text-lg font-bold text-white tabular-nums">{participant.assists}</span>
                </div>
                <div
                  className="text-xs font-semibold"
                  style={{ color: kda === 'Perfect' ? getKdaColor(99) : getKdaColor(Number(kda)) }}
                >
                  {kda} KDA
                </div>
                <div className="text-xs text-text-muted">
                  {(participant.totalDamageDealtToChampions / (match.info.gameDuration / 60)).toFixed(0)} DPM
                </div>
              </div>

              {/* items */}
              <div className="flex-shrink-0 flex justify-center items-center">
                <div className="grid grid-cols-3 grid-rows-2 gap-0.5">
                  {[
                    participant.item0,
                    participant.item1,
                    participant.item2,
                    participant.item3,
                    participant.item4,
                    participant.item5,
                  ].map((itemId, idx) =>
                    itemId > 0 ? (
                      <Tooltip key={idx} id={itemId} type="item">
                        <div className="w-7 h-7 rounded overflow-hidden bg-abyss-800 border border-gold-dark">
                          <Image
                            src={getItemImageUrl(itemId, ddragonVersion)}
                            alt={`Item ${itemId}`}
                            width={28}
                            height={28}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      </Tooltip>
                    ) : (
                      <div key={idx} className="w-7 h-7 rounded bg-abyss-800/50 border border-gold-dark/50" />
                    )
                  )}
                </div>
              </div>

              {/* teams - hidden on small screens */}
              <div className="hidden lg:flex gap-1.5 flex-shrink-0">
                <div className="flex flex-col gap-0.5 w-24">
                  {team1.map((p, idx) => {
                    const playerName = p.riotIdGameName || p.summonerName
                    const playerTag = p.riotIdTagline || 'EUW'
                    const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
                    const isCurrentUser = p.puuid === puuid

                    return (
                      <div key={idx} className="flex items-center gap-1">
                        <div
                          className={clsx('w-4 h-4 rounded flex-shrink-0', isCurrentUser && 'ring-1 ring-gold-light')}
                        >
                          <Image
                            src={getChampionImageUrl(p.championName, ddragonVersion)}
                            alt={p.championName}
                            width={16}
                            height={16}
                            className="w-full h-full object-cover rounded"
                            unoptimized
                          />
                        </div>
                        {isCurrentUser ? (
                          <span className="text-xs truncate min-w-0 flex-1 text-white font-medium" title={playerName}>
                            {playerName}
                          </span>
                        ) : (
                          <Link
                            href={profileUrl}
                            onClick={e => e.stopPropagation()}
                            className="text-xs truncate min-w-0 flex-1 transition-colors text-text-muted font-normal hover:text-gold-light"
                            title={playerName}
                          >
                            {playerName}
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-0.5 w-24">
                  {team2.map((p, idx) => {
                    const playerName = p.riotIdGameName || p.summonerName
                    const playerTag = p.riotIdTagline || 'EUW'
                    const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
                    const isCurrentUser = p.puuid === puuid

                    return (
                      <div key={idx} className="flex items-center gap-1">
                        <div
                          className={clsx('w-4 h-4 rounded flex-shrink-0', isCurrentUser && 'ring-1 ring-gold-light')}
                        >
                          <Image
                            src={getChampionImageUrl(p.championName, ddragonVersion)}
                            alt={p.championName}
                            width={16}
                            height={16}
                            className="w-full h-full object-cover rounded"
                            unoptimized
                          />
                        </div>
                        {isCurrentUser ? (
                          <span className="text-xs truncate min-w-0 flex-1 text-white font-medium" title={playerName}>
                            {playerName}
                          </span>
                        ) : (
                          <Link
                            href={profileUrl}
                            onClick={e => e.stopPropagation()}
                            className="text-xs truncate min-w-0 flex-1 transition-colors text-text-muted font-normal hover:text-gold-light"
                            title={playerName}
                          >
                            {playerName}
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* expand button */}
          <div
            className={clsx(
              'flex items-end justify-center w-10 pb-2',
              isExpanded ? 'rounded-tr-lg' : 'rounded-r-lg',
              isRemake ? 'bg-remake-light' : isWin ? 'bg-win-light' : 'bg-loss-light'
            )}
          >
            <div className="gold-border-group p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full">
              <div className="relative z-10 w-6 h-6 rounded-full bg-abyss-700 flex items-center justify-center">
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.1 }}>
                  <ChevronDownIcon className="w-4 h-4 text-gold-light" />
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        {/* detailed match breakdown */}
        {isExpanded && (
          <MatchDetails
            match={match}
            currentPuuid={puuid}
            ddragonVersion={ddragonVersion}
            region={region}
            defaultTab={selectedTab}
            onTabChange={setSelectedTab}
          />
        )}
      </div>
    </li>
  )
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}
