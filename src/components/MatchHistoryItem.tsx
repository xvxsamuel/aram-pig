"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import clsx from "clsx"
import { ChevronDownIcon } from "@heroicons/react/24/solid"
import type { MatchData } from "../lib/riot-api"
import { getChampionImageUrl, getSummonerSpellUrl, getItemImageUrl, getRuneImageUrl, getRuneStyleImageUrl } from "../lib/ddragon-client"
import MatchDetails from "./MatchDetails"

interface Props {
  match: MatchData
  puuid: string
  region: string
  ddragonVersion: string
}

export default function MatchHistoryItem({ match, puuid, region, ddragonVersion }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const participant = match.info.participants.find(p => p.puuid === puuid)
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

  return (
    <div className={clsx("overflow-hidden", isExpanded ? "rounded-t-lg" : "rounded-lg")}>
      <div className="flex">
        {/* main content */}
        <div
          className={clsx(
            "border-l-[6px] flex-1",
            isExpanded ? "rounded-tl-lg" : "rounded-l-lg",
            isRemake
              ? "bg-[#3A3A3A] border-[#808080]"
              : isWin 
                ? "bg-[#28344E] border-[#5383E8]" 
                : "bg-[#59343B] border-[#E84057]"
          )}
        >
          <div className="flex items-center px-4 py-3 min-h-[80px] gap-4">
        {/* left side: game info, champion, summoners, runes */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex flex-col justify-center min-w-[75px]">
              <div className={clsx(
                "text-base font-bold",
                isRemake 
                  ? "text-[#808080]"
                  : isWin ? "text-[#5383E8]" : "text-[#E84057]"
              )}>
                {isRemake ? "REMAKE" : isWin ? "WIN" : "LOSS"}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {gameDurationMinutes}:{gameDurationSeconds.toString().padStart(2, "0")}
              </div>
              <div className="text-xs text-gray-400">
                {timeAgo}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <div className="relative">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-accent-dark border-2 border-gray-600">
                  <Image
                    src={getChampionImageUrl(participant.championName, ddragonVersion)}
                    alt={participant.championName}
                    width={56}
                    height={56}
                    className="w-full h-full scale-110 object-cover"

                  />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-[10px] font-bold leading-none">
                  {participant.champLevel}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="w-6 h-6 rounded bg-gray-800 border border-gray-700 overflow-hidden">
                  <Image
                    src={getSummonerSpellUrl(participant.summoner1Id, ddragonVersion)}
                    alt="Spell 1"
                    width={24}
                    height={24}
                    className="w-full h-full object-cover"

                  />
                </div>
                <div className="w-6 h-6 rounded bg-gray-800 border border-gray-700 overflow-hidden">
                  <Image
                    src={getSummonerSpellUrl(participant.summoner2Id, ddragonVersion)}
                    alt="Spell 2"
                    width={24}
                    height={24}
                    className="w-full h-full object-cover"

                  />
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {participant.perks?.styles?.[0]?.selections?.[0]?.perk && (
                  <div className="w-6 h-6 rounded bg-gray-800 border border-gray-700 overflow-hidden">
                    <Image
                      src={getRuneImageUrl(participant.perks.styles[0].selections[0].perk)}
                      alt="Primary Rune"
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"

                    />
                  </div>
                )}
                {participant.perks?.styles?.[1]?.style && (
                  <div className="w-6 h-6 rounded bg-gray-800 border border-gray-700 overflow-hidden">
                    <Image
                      src={getRuneStyleImageUrl(participant.perks.styles[1].style)}
                      alt="Secondary Rune"
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"

                    />
                  </div>
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
                <div
                  key={idx}
                  className="w-8 h-8 rounded bg-gray-800 border border-gray-700 overflow-hidden"
                >
                  {itemId > 0 && (
                    <Image
                      src={getItemImageUrl(itemId, ddragonVersion)}
                      alt={`Item ${itemId}`}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"

                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* stats */}
          <div className="flex flex-col justify-center flex-shrink-0 min-w-[100px] mx-auto">
            <div className="flex items-baseline gap-1 justify-center">
              <span className="text-base font-bold text-white">
                {participant.kills}
              </span>
              <span className="text-gray-500 text-sm">/</span>
              <span className="text-base font-bold text-[#E84057]">
                {participant.deaths}
              </span>
              <span className="text-gray-500 text-sm">/</span>
              <span className="text-base font-bold text-white">
                {participant.assists}
              </span>
            </div>
            <div className="text-xs text-white text-center mt-0.5">
              {kda} KDA
            </div>
            <div className="text-xs text-white text-center mt-0.5">
              {participant.totalMinionsKilled + participant.neutralMinionsKilled} CS
            </div>
            <div className="text-xs text-white text-center mt-0.5">
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

                    />
                  </div>
                  <Link 
                    href={profileUrl}
                    className={clsx(
                      "text-xs hover:text-gold-light truncate flex-1",
                      isCurrentUser ? "text-white" : "text-subtitle"
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
                      isCurrentUser && "ring-2 ring-gold-light"
                    )}
                  >
                    <Image
                      src={getChampionImageUrl(p.championName, ddragonVersion)}
                      alt={p.championName}
                      width={16}
                      height={16}
                      className="w-full h-full object-cover"

                    />
                  </div>
                  <Link 
                    href={profileUrl}
                    className={clsx(
                      "text-xs hover:text-gold-light truncate flex-1 transition-colors",
                      isCurrentUser ? "text-white" : "text-subtitle"
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

        {/* clickable chevron section - separate div that looks connected */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={clsx(
            "flex items-end justify-center px-3 pb-3 cursor-pointer transition-colors",
            isExpanded ? "rounded-tr-lg" : "rounded-r-lg",
            isRemake
              ? "bg-[#4A4A4A] hover:bg-[#5A5A5A]"
              : isWin 
                ? "bg-[#38445E] hover:bg-[#48546E]" 
                : "bg-[#69444B] hover:bg-[#79545B]"
          )}
          role="button"
          aria-label="Toggle match details"
        >
          <ChevronDownIcon
            className={clsx(
              "w-5 h-5 text-subtitle transition-transform",
              isExpanded && "rotate-180"
            )}
            strokeWidth={3}
          />
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
