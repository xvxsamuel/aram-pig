'use client'

import { useState, useRef, useCallback, useEffect, memo } from 'react'
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
import { getKdaColor, getPigScoreColor, ONE_YEAR_MS, getTimeAgo, formatDuration, perMinute } from '@/lib/ui'
import { calculateMatchLabels } from '@/lib/scoring/labels'
import MatchDetails from '@/components/match/MatchDetails'
import Tooltip from '@/components/ui/Tooltip'
import SimpleTooltip from '@/components/ui/SimpleTooltip'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

// preload images for matchdetails on hover
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
  onMatchEnriched?: (matchId: string, pigScores: Record<string, number | null>) => void
}

// memoize to prevent re-renders when sibling matches update
// only re-renders when this specific match's data changes
function MatchHistoryItemComponent({ match, puuid, region, ddragonVersion, championNames, onMatchEnriched }: Props) {
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

  const gameDuration = formatDuration(match.info.gameDuration)
  const gameDate = new Date(match.info.gameCreation)
  const timeAgo = getTimeAgo(gameDate)

  const team1 = match.info.participants.filter(p => p.teamId === 100)
  const team2 = match.info.participants.filter(p => p.teamId === 200)

  const showBorder = isExpanded || isHovered

  const matchLabel = `Match ${match.metadata.matchId.split('_')[1]}, ${participant.championName}, ${isRemake ? 'Remake' : isWin ? 'Victory' : 'Defeat'}, ${participant.kills}/${participant.deaths}/${participant.assists}`

  const hasPigScore = participant.pigScore !== null && participant.pigScore !== undefined
  // check if pig score should still be loading (match is recent enough + not a remake)
  const gameAge = Date.now() - match.info.gameCreation
  const isPigScoreLoading = !hasPigScore && !isRemake && gameAge < ONE_YEAR_MS
  const labels = calculateMatchLabels(match, participant)
  const hasLabels = hasPigScore && labels.length > 0

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
                  {gameDuration}
                </div>
              </div>

              {/* Middle Section: Champ/KDA/Items + Pig/Labels */}
              <div className="flex flex-col flex-1 min-w-0 mx-4 justify-center">
                {/* Top Row: Champ + KDA + Items */}
                <div className="flex items-center justify-between">
                  {/* Champion + Spells/Runes */}
                  <div className="flex gap-2 items-center">
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

                    <div className="flex gap-1 items-center">
                      <div className="flex flex-col gap-0.5">
                        <Tooltip id={participant.summoner1Id} type="spell">
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
                        <Tooltip id={participant.summoner2Id} type="spell">
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
                  </div>

                  {/* KDA */}
                  <div className="flex flex-col justify-center items-center flex-shrink-0 min-w-[75px] mx-4">
                    <div className="flex items-baseline gap-1">
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
                      {perMinute(participant.totalDamageDealtToChampions, match.info.gameDuration).toFixed(0)} DPM
                    </div>
                  </div>

                  {/* Items */}
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
                </div>

                {/* Bottom Row: Pig Score + Labels */}
                <div className="flex gap-2 items-center mt-0.5 w-full min-w-0">
                  {/* pig Score - aligned with Icon */}
                  <div className="w-[54px] flex justify-center flex-shrink-0">
                    {hasPigScore ? (
                      <SimpleTooltip content="Pig Score">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedTab('performance')
                            setIsExpanded(true)
                          }}
                          className="w-full p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full cursor-pointer flex"
                        >
                          <div className="w-full bg-abyss-700 rounded-full px-2 py-1.5 text-[10px] font-bold leading-none flex items-center justify-center gap-1 whitespace-nowrap">
                            <span style={{ color: getPigScoreColor(participant.pigScore!) }}>
                              {participant.pigScore}
                            </span>
                            <span className="text-white">PIG</span>
                          </div>
                        </button>
                      </SimpleTooltip>
                    ) : isPigScoreLoading ? (
                      <SimpleTooltip content="Calculating PIG...">
                        <div className="w-full p-px bg-gradient-to-b from-abyss-500 to-abyss-700 rounded-full flex">
                          <div className="w-full bg-abyss-700 rounded-full px-2 py-1.5 text-[10px] font-bold leading-none flex items-center justify-center gap-1 whitespace-nowrap">
                            <LoadingSpinner size={12} bgColor="bg-abyss-700" />
                            <span className="text-abyss-400">PIG</span>
                          </div>
                        </div>
                      </SimpleTooltip>
                    ) : null}
                  </div>

                  {/*labels */}
                  {hasLabels && (
                    <div className="relative w-0 flex-1 self-center group/labels overflow-hidden">
                      {/* Labels container - no scroll, clips overflow */}
                      <div className="flex items-center gap-1">
                        {labels.map(label => {
                          const isBad = label.type === 'bad'
                          return (
                            <SimpleTooltip key={label.id} content={label.description}>
                              <div className="p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full flex-shrink-0">
                                <div
                                  className={clsx(
                                    'rounded-full px-3 py-1.5 text-[10px] font-normal leading-none flex items-center whitespace-nowrap',
                                    isBad ? 'bg-worst-dark' : 'bg-abyss-700'
                                  )}
                                >
                                  <span className="text-white">{label.label}</span>
                                </div>
                              </div>
                            </SimpleTooltip>
                          )
                        })}
                      </div>
                      {/* Gradient fade + arrow on hover - only show when 4+ labels */}
                      {labels.length > 3 && (
                        <div className="absolute right-0 top-0 bottom-0 w-14 flex items-center justify-end pointer-events-none">
                          {/* Gradient background - matches win/loss bg */}
                          <div
                            className={clsx(
                              'absolute inset-0 bg-gradient-to-l to-transparent',
                              isRemake ? 'from-remake via-remake/90' : isWin ? 'from-win via-win/90' : 'from-loss via-loss/90'
                            )}
                          />
                          {/* Arrow button - fades in on hover, toggles expansion */}
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              if (isExpanded && selectedTab === 'performance') {
                                setIsExpanded(false)
                              } else {
                                setSelectedTab('performance')
                                setIsExpanded(true)
                              }
                            }}
                            className="relative z-10 pointer-events-auto p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-full opacity-0 group-hover/labels:opacity-100 transition-opacity duration-200 mr-1"
                          >
                            <div className="w-5 h-5 rounded-full bg-abyss-700 flex items-center justify-center">
                              <ChevronDownIcon className="w-3 h-3 text-gold-light -rotate-90" />
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
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
            onEnriched={onMatchEnriched ? (pigScores) => onMatchEnriched(match.metadata.matchId, pigScores) : undefined}
          />
        )}
      </div>
    </li>
  )
}

// custom comparison: only re-render if match data actually changed
function arePropsEqual(prev: Props, next: Props): boolean {
  // different match entirely
  if (prev.match.metadata.matchId !== next.match.metadata.matchId) return false
  
  // check if pig score changed for current user
  const prevParticipant = prev.match.info.participants.find(p => p.puuid === prev.puuid)
  const nextParticipant = next.match.info.participants.find(p => p.puuid === next.puuid)
  if (prevParticipant?.pigScore !== nextParticipant?.pigScore) return false
  
  // check other props that might change
  if (prev.puuid !== next.puuid) return false
  if (prev.region !== next.region) return false
  if (prev.ddragonVersion !== next.ddragonVersion) return false
  
  // callback identity doesn't matter for rendering
  return true
}

const MatchHistoryItem = memo(MatchHistoryItemComponent, arePropsEqual)
export default MatchHistoryItem
