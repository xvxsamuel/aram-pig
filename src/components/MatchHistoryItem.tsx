'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { ChevronDownIcon } from '@heroicons/react/24/solid'
import type { MatchData } from '../lib/riot-api'
import {
  getChampionImageUrl,
  getSummonerSpellUrl,
  getItemImageUrl,
  getRuneImageUrl,
  getRuneStyleImageUrl,
} from '../lib/ddragon-client'
import { getChampionUrlName } from '../lib/champion-names'
import { getKdaColor } from '../lib/winrate-colors'
import MatchDetails from './MatchDetails'
import Tooltip from './Tooltip'

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

  const participant = match.info.participants.find((p) => p.puuid === puuid)
  if (!participant) return null

  // check if game was a remake
  const isRemake = participant.gameEndedInEarlySurrender
  const isWin = participant.win
  const kda = participant.deaths === 0 
    ? "Perfect"
    : ((participant.kills + participant.assists) / participant.deaths).toFixed(2)
  
  const gameDurationMinutes = Math.floor(match.info.gameDuration / 60)
  const gameDurationSeconds = match.info.gameDuration % 60
  const gameDate = new Date(match.info.gameCreation)
  const timeAgo = getTimeAgo(gameDate)

  const team1 = match.info.participants.filter(p => p.teamId === 100)
  const team2 = match.info.participants.filter(p => p.teamId === 200)

  const showBorder = isExpanded || isHovered

  return (
    <div 
      className="relative rounded-lg p-px"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* animated gradient border */}
      <motion.div
        className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-light to-gold-dark"
        initial={{ opacity: 0 }}
        animate={{ opacity: showBorder ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      />
      
      {/* content wrapper */}
      <div className="relative rounded-lg overflow-hidden bg-abyss-600">
        <div 
          className="flex cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          role="button"
          aria-label="Toggle match details"
        >
        {/* main content */}
        <div
          className={clsx(
            "flex-1",
            isExpanded ? "rounded-tl-lg" : "rounded-l-lg",
            isRemake
              ? "bg-remake"
              : isWin 
                ? "bg-win" 
                : "bg-loss"
          )}
        >
          <div className="flex items-center px-4 py-2 min-h-[80px] gap-5">
        {/* left side: game info, champion, summoners, runes */}
        <div className="flex items-center flex-shrink-0">
          <div className="flex flex-col justify-center min-w-[75px]">
              <div className={clsx(
                "text-base font-bold",
                isRemake 
                  ? "text-[#808080]"
                  : isWin ? "text-[#5383E8]" : "text-[#E84057]"
              )}>
                {isRemake ? "REMAKE" : isWin ? "WIN" : "LOSS"}
              </div>
              {participant.pigScore !== null && participant.pigScore !== undefined && (
                <div className="text-sm font-semibold text-gold-light mt-0.5">
                  {participant.pigScore} PIG
                </div>
              )}
              <div className="text-xs text-gray-400 mt-0.5">
                {gameDurationMinutes}:{gameDurationSeconds.toString().padStart(2, "0")}
              </div>
              <div className="text-xs text-gray-400">
                {timeAgo}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Link href={`/champions/${getChampionUrlName(participant.championName, championNames)}`}>
                <div className="relative p-px bg-gradient-to-b from-gold-light to-gold-dark rounded-lg cursor-pointer">
                  <div className="w-12 h-12 rounded-[inherit] overflow-hidden bg-accent-dark">
                    <Image
                      src={getChampionImageUrl(participant.championName, ddragonVersion)}
                      alt={participant.championName}
                      width={56}
                      height={56}
                      className="w-full h-full scale-115 object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 p-px bg-gradient-to-b from-gold-light to-gold-dark rounded">
                    <div className="bg-abyss-500 rounded-[inherit] px-1 py-0.5 text-[10px] font-regular leading-none">
                      {participant.champLevel}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="flex flex-col gap-0.5">
                <Tooltip id={participant.summoner1Id} type="summoner-spell">
                  <div className="w-6 h-6 rounded overflow-hidden bg-abyss-900/30 border border-gold-dark">
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
                  <div className="w-6 h-6 rounded overflow-hidden bg-abyss-900/30 border border-gold-dark">
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
                    <div className="w-6 h-6 rounded overflow-hidden bg-abyss-900/30 border border-gold-dark">
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
                    <div className="w-6 h-6 rounded overflow-hidden bg-abyss-900/30 border border-gold-dark flex items-center justify-center">
                      <Image
                        src={getRuneStyleImageUrl(participant.perks.styles[1].style)}
                        alt="Secondary Rune"
                        width={20}
                        height={20}
                        className="w-4 h-4 object-contain"
                        unoptimized
                      />
                    </div>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          {/* items section */}
          <div className="flex gap-0.5 flex-shrink-0 mx-auto">
            <div className="grid grid-cols-3 grid-rows-2 gap-0.5">
              {[
                participant.item0,
                participant.item1,
                participant.item2,
                participant.item3,
                participant.item4,
                participant.item5,
              ].map((itemId, idx) => (
                itemId > 0 ? (
                  <Tooltip key={idx} id={itemId} type="item">
                    <div className="w-6 h-6 rounded overflow-hidden bg-abyss-900/30 border border-gold-dark">
                      <Image
                        src={getItemImageUrl(itemId, ddragonVersion)}
                        alt={`Item ${itemId}`}
                        width={6}
                        height={6}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </Tooltip>
                ) : (
                  <div key={idx} className="w-6 h-6 rounded overflow-hidden bg-abyss-900/30 border border-gold-dark" />
                )
              ))}
            </div>
          </div>

          {/* stats */}
          <div className="flex flex-col justify-center flex-shrink-0 min-w-[75px] mx-auto">
            <div className="flex items-baseline gap-1 justify-center">
              <span className="text-base font-bold text-white">
                {participant.kills}
              </span>
              <span className="text-text-muted text-sm font-light">/</span>
              <span className="text-base font-bold text-negative">
                {participant.deaths}
              </span>
              <span className="text-text-muted text-sm font-light">/</span>
              <span className="text-base font-bold text-white">
                {participant.assists}
              </span>
            </div>
            <div 
              className="text-[12px] font-semibold text-center tracking-wide"
              style={{ color: kda === 'Perfect' ? getKdaColor(99) : getKdaColor(Number(kda)) }}
            >
              {kda} KDA
            </div>
            <div className="text-[12px] text-text-muted text-center mt-1">
              {participant.totalMinionsKilled + participant.neutralMinionsKilled} CS
            </div>
            <div className="text-[12px] text-text-muted text-center">
              {(participant.totalDamageDealtToChampions / (match.info.gameDuration / 60)).toFixed(0)} DPM
            </div>
          </div>

        {/* middle: teams - hidden on small screens, can grow/shrink */}
        <div className="hidden lg:flex gap-4 flex-shrink-0 ml-auto">
          <div className="flex flex-col gap-0.5 w-24 flex-shrink-0">
            {team1.map((p, idx) => {
              const playerName = p.riotIdGameName || p.summonerName
              const playerTag = p.riotIdTagline || "EUW"
              const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
              const isCurrentUser = p.puuid === puuid
              
              return (
                <div key={idx} className="flex items-center gap-1">
                  <div
                    className={clsx(
                      "w-4 h-4 rounded overflow-hidden flex-shrink-0",
                      isCurrentUser && "ring-2 ring-gold-light"
                    )}
                  >
                    <Image
                      src={getChampionImageUrl(p.championName, ddragonVersion)}
                      alt={p.championName}
                      width={16}
                      height={16}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                  <Link 
                    href={profileUrl}
                    onClick={(e) => e.stopPropagation()}
                    className={clsx(
                      "text-xs hover:text-gold-light truncate flex-1",
                      isCurrentUser ? "text-white" : "text-text-muted"
                    )}
                    title={playerName}
                  >
                    {playerName}
                  </Link>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-0.5 w-24 flex-shrink-0">
            {team2.map((p, idx) => {
              const playerName = p.riotIdGameName || p.summonerName
              const playerTag = p.riotIdTagline || "EUW"
              const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
              const isCurrentUser = p.puuid === puuid
              
              return (
                <div key={idx} className="flex items-center gap-1">
                  <div
                    className={clsx(
                      "w-4 h-4 rounded overflow-hidden flex-shrink-0",
                      isCurrentUser && "ring-1 ring-gold-light"
                    )}
                  >
                    <Image
                      src={getChampionImageUrl(p.championName, ddragonVersion)}
                      alt={p.championName}
                      width={16}
                      height={16}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                  <Link 
                    href={profileUrl}
                    onClick={(e) => e.stopPropagation()}
                    className={clsx(
                      "text-xs hover:text-gold-light truncate flex-1 transition-colors",
                      isCurrentUser ? "text-white" : "text-text-muted"
                    )}
                    title={playerName}
                  >
                    {playerName}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
          </div>
        </div>

        {/* styled chevron button */}
        <div className={clsx(
          "flex items-end justify-center px-2 pb-2",
          isExpanded ? "rounded-tr-lg" : "rounded-r-lg",
          isRemake
            ? "bg-[#3A3A3A]"
            : isWin 
              ? "bg-[#28344E]" 
              : "bg-[#59343B]"
        )}>
          <div className="relative rounded-full p-px bg-gradient-to-b from-gold-light to-gold-dark">
            {/* inner circle with chevron */}
            <div className="relative w-6 h-6 rounded-full bg-abyss-700 flex items-center justify-center">
              <ChevronDownIcon
                className={clsx(
                  "w-4 h-4 text-gold-light transition-transform",
                  isExpanded && "rotate-180"
                )}
                strokeWidth={3}
              />
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
          isWin={isWin}
          isRemake={isRemake}
        />
      )}
      </div>
    </div>
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
  return "Just now"
}
