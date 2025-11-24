"use client"

import { useState, useEffect } from "react"
import type { MatchData } from "../lib/riot-api"
import Image from "next/image"
import Link from "next/link"
import clsx from "clsx"
import { getChampionImageUrl, getItemImageUrl, getRuneImageUrl, getRuneStyleImageUrl, getSummonerSpellUrl } from "../lib/ddragon-client"
import Tooltip from "./Tooltip"
import runesData from "@/data/runes.json"

interface Props {
  match: MatchData
  currentPuuid: string
  ddragonVersion: string
  region: string
  isWin: boolean
  isRemake: boolean
}

interface ItemTimelineEvent {
  timestamp: number
  type: 'ITEM_PURCHASED' | 'ITEM_SOLD' | 'ITEM_UNDO'
  itemId: number
}

interface ParticipantDetails {
  puuid: string
  build_order: string | null
  first_buy: string | null
  pig_score: number | null
  item_timeline: ItemTimelineEvent[]
  loading: boolean
}

export default function MatchDetails({ match, currentPuuid, ddragonVersion, region, isWin, isRemake }: Props) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'build' | 'performance'>('overview')
  const [participantDetails, setParticipantDetails] = useState<Map<string, ParticipantDetails>>(new Map())
  const [calculatingPigScores, setCalculatingPigScores] = useState(false)
  const [pigScores, setPigScores] = useState<Record<string, number>>({})
  const currentPlayer = match.info.participants.find(p => p.puuid === currentPuuid)

  // calculate pig scores for all participants when component mounts
  useEffect(() => {
    // skip if flag is disabled
    const recalculateEnabled = process.env.NEXT_PUBLIC_RECALCULATE_PIG_SCORES === 'true'
    if (!recalculateEnabled) return
    
    const calculatePigScores = async () => {
      setCalculatingPigScores(true)
      try {
        const response = await fetch('/api/calculate-pig-score', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId: match.metadata.matchId })
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('Calculated pig scores for match:', data)
          // update pig scores state
          if (data.results) {
            setPigScores(data.results)
          }
        }
      } catch (error) {
        console.error('Failed to calculate pig scores:', error)
      } finally {
        setCalculatingPigScores(false)
      }
    }
    
    calculatePigScores()
  }, [match.metadata.matchId])

  // separate teams
  const team100 = match.info.participants.filter(p => p.teamId === 100)
  const team200 = match.info.participants.filter(p => p.teamId === 200)
  
  const team100Won = team100[0]?.win || false
  const team200Won = team200[0]?.win || false

  // calculate team totals
  const team100Gold = team100.reduce((sum, p) => sum + p.goldEarned, 0)
  const team200Gold = team200.reduce((sum, p) => sum + p.goldEarned, 0)
  const team100Kills = team100.reduce((sum, p) => sum + p.kills, 0)
  const team200Kills = team200.reduce((sum, p) => sum + p.kills, 0)

  const formatGold = (gold: number) => `${(gold / 1000).toFixed(1)}k`
  const formatDamage = (dmg: number) => new Intl.NumberFormat('en-US').format(dmg)

  // Calculate max values for bars
  const allParticipants = match.info.participants
  const maxDamageDealt = Math.max(...allParticipants.map(p => p.totalDamageDealtToChampions || 0))
  const maxDamageTaken = Math.max(...allParticipants.map(p => (p as any).totalDamageTaken || 0))

  // Calculate ranks based on pig score
  const sortedByScore = [...allParticipants].sort((a, b) => {
    const scoreA = pigScores[a.puuid] ?? a.pigScore ?? 0
    const scoreB = pigScores[b.puuid] ?? b.pigScore ?? 0
    return scoreB - scoreA
  })

  const getRankInfo = (puuid: string, teamId: number) => {
    const score = pigScores[puuid] ?? allParticipants.find(p => p.puuid === puuid)?.pigScore ?? 0
    const rankIndex = sortedByScore.findIndex(p => p.puuid === puuid)
    const rank = rankIndex + 1
    
    const winningTeamId = allParticipants.find(p => p.win)?.teamId
    const isWinningTeam = teamId === winningTeamId
    
    const teamPlayers = allParticipants.filter(p => p.teamId === teamId)
    const highestInTeam = teamPlayers.reduce((prev, current) => {
        const prevScore = pigScores[prev.puuid] ?? prev.pigScore ?? 0
        const currScore = pigScores[current.puuid] ?? current.pigScore ?? 0
        return currScore > prevScore ? current : prev
    })
    
    let badge = null
    if (highestInTeam.puuid === puuid) {
        if (isWinningTeam) badge = "MVP"
        else badge = "ACE"
    }
    
    return { rank, badge, score }
  }

  // Lazy load participant details (timeline + PIG score)
  const loadParticipantDetails = async (puuid: string) => {
    // skip if already loading or loaded
    if (participantDetails.has(puuid)) return
    
    // m  ark as loading
    setParticipantDetails(prev => new Map(prev).set(puuid, {
      puuid,
      build_order: null,
      first_buy: null,
      pig_score: null,
      item_timeline: [],
      loading: true
    }))
    
    try {
      const response = await fetch('/api/match-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.metadata.matchId,
          puuid,
          region: region.toUpperCase()
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setParticipantDetails(prev => new Map(prev).set(puuid, {
          puuid,
          build_order: data.build_order,
          first_buy: data.first_buy,
          pig_score: data.pig_score,
          item_timeline: data.item_timeline || [],
          loading: false
        }))
      }
    } catch (error) {
      console.error('Failed to load participant details:', error)
      setParticipantDetails(prev => new Map(prev).set(puuid, {
        puuid,
        build_order: null,
        first_buy: null,
        pig_score: null,
        item_timeline: [],
        loading: false
      }))
    }
  }
  
  // load details for current player when switching to build tab
  useEffect(() => {
    if (selectedTab === 'build' && currentPlayer) {
      loadParticipantDetails(currentPlayer.puuid)
    }
  }, [selectedTab, match.metadata.matchId])

  const renderPlayerRow = (p: any, isCurrentPlayer: boolean) => {
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
    const kda = p.deaths === 0 ? "Perfect" : ((p.kills + p.assists) / p.deaths).toFixed(2)
    const dpm = ((p.totalDamageDealtToChampions || 0) / (match.info.gameDuration / 60)).toFixed(0)
    const playerName = p.riotIdGameName || p.summonerName
    const playerTag = p.riotIdTagline || ""
    const profileUrl = `/${region}/${encodeURIComponent(playerName)}-${encodeURIComponent(playerTag)}`
    
    const { rank, badge, score } = getRankInfo(p.puuid, p.teamId)
    const teamTotalKills = p.teamId === 100 ? team100Kills : team200Kills
    const killParticipation = teamTotalKills > 0 ? Math.round(((p.kills + p.assists) / teamTotalKills) * 100) : 0
    
    const damageDealtPct = maxDamageDealt > 0 ? (p.totalDamageDealtToChampions / maxDamageDealt) * 100 : 0
    const damageTakenPct = maxDamageTaken > 0 ? (p.totalDamageTaken / maxDamageTaken) * 100 : 0

    const csPerMin = (p.totalMinionsKilled / (match.info.gameDuration / 60)).toFixed(1)

    return (
      <tr 
        key={p.puuid} 
        className={clsx(
          "border-b border-abyss-700/50 hover:bg-abyss-700/30 transition-colors",
          isCurrentPlayer && "bg-gold-dark/5"
        )}
      >
        {/* champion & info */}
        <td className="py-3 pl-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded overflow-hidden bg-abyss-800">
                <Image
                  src={getChampionImageUrl(p.championName, ddragonVersion)}
                  alt={p.championName}
                  width={32}
                  height={32}
                  className="w-full h-full scale-110 object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-abyss-900 rounded-full w-4 h-4 flex items-center justify-center text-[9px] border border-abyss-700">
                {p.champLevel}
              </div>
            </div>
            
            <div className="flex gap-1">
              <div className="flex flex-col gap-0.5">
                <div className="w-4 h-4 rounded overflow-hidden bg-abyss-800">
                  <Image src={getSummonerSpellUrl(p.summoner1Id, ddragonVersion)} alt="Summoner 1" width={16} height={16} />
                </div>
                <div className="w-4 h-4 rounded overflow-hidden bg-abyss-800">
                  <Image src={getSummonerSpellUrl(p.summoner2Id, ddragonVersion)} alt="Summoner 2" width={16} height={16} />
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="w-4 h-4 rounded-full overflow-hidden bg-abyss-800">
                  <Image src={getRuneImageUrl(p.perks?.styles[0]?.selections[0]?.perk)} alt="Keystone" width={16} height={16} />
                </div>
                <div className="w-4 h-4 rounded-full overflow-hidden bg-abyss-800">
                  <Image src={getRuneStyleImageUrl(p.perks?.styles[1]?.style)} alt="Secondary" width={16} height={16} />
                </div>
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <Link 
                href={profileUrl}
                className={clsx(
                  "text-xs font-bold truncate hover:underline",
                  isCurrentPlayer ? "text-gold-light" : "text-white"
                )}
              >
                {playerName}
              </Link>
            </div>
          </div>
        </td>

        {/* PIG */}
        <td className="py-3 text-center">
          <div className="flex flex-col items-center justify-center">
            <span className={clsx(
              "text-sm font-bold",
              score < 50 ? "text-negative" : "text-accent-light"
            )}>
              {score.toFixed(1)}
            </span>
            {badge ? (
              <span className={clsx(
                "text-[10px] px-1.5 rounded-full font-bold",
                badge === "MVP" ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
              )}>
                {badge}
              </span>
            ) : (
              <span className="text-[10px] text-gray-500">{rank}th</span>
            )}
          </div>
        </td>

        {/* KDA */}
        <td className="py-3 text-center">
          <div className="flex flex-col items-center">
            <div className="text-xs text-gray-300">
              {p.kills}/{p.deaths}/{p.assists} <span className="text-gray-500">({killParticipation}%)</span>
            </div>
            <div className={clsx(
              "text-[10px] font-bold",
              Number(kda) >= 4 ? "text-yellow-400" : Number(kda) >= 3 ? "text-blue-400" : "text-gray-500"
            )}>
              {kda}:1
            </div>
          </div>
        </td>

        {/* Damage */}
        <td className="py-3 text-center w-32 px-4">
          <div className="flex flex-col gap-2 justify-center h-full">
            <div className="flex flex-col gap-0.5 text-[10px]">
              <span className="text-negative text-center leading-none">{formatDamage(p.totalDamageDealtToChampions)}</span>
              <div className="h-2 bg-abyss-800 rounded-full overflow-hidden w-full">
                <div className="h-full bg-negative" style={{ width: `${damageDealtPct}%` }}></div>
              </div>
            </div>
          </div>
        </td>

        {/* CS */}
        <td className="py-3 text-center">
          <div className="flex flex-col items-center">
            <span className="text-xs text-gray-300">{p.totalMinionsKilled}</span>
            <span className="text-[10px] text-gray-500">{csPerMin}/m</span>
          </div>
        </td>

        {/* Items */}
        <td className="py-3 pl-4">
          <div className="flex gap-0.5">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={clsx(
                  "w-7 h-7 rounded bg-abyss-800 border border-abyss-700 overflow-hidden",
                  idx === 6 && "rounded-full" // trinket
                )}
              >
                {item > 0 && (
                  <Image
                    src={getItemImageUrl(item, ddragonVersion)}
                    alt={`Item ${item}`}
                    width={28}
                    height={28}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </td>
      </tr>
    )
  }

  const isPlayerInTeam100 = team100.some(p => p.puuid === currentPuuid)
  const teamsToRender = isPlayerInTeam100 
    ? [
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: true },
        { players: team200, won: team200Won, name: 'Red Team', isFirst: false }
      ]
    : [
        { players: team200, won: team200Won, name: 'Red Team', isFirst: true },
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: false }
      ]

  return (
    <div className="bg-abyss-600 rounded-b-lg border-t border-abyss-700">
      {/* tab navigation */}
      <div className="flex border-b border-abyss-700">
        <button
          onClick={() => setSelectedTab('overview')}
          className={clsx(
            "flex-1 px-6 py-3 font-semibold text-sm transition-all border-b-2",
            selectedTab === 'overview'
              ? "border-accent-light text-white bg-abyss-700/50"
              : "border-transparent text-text-muted hover:text-white"
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setSelectedTab('build')}
          className={clsx(
            "flex-1 px-6 py-3 font-semibold text-sm transition-all border-b-2",
            selectedTab === 'build'
              ? "border-accent-light text-white bg-abyss-700/50"
              : "border-transparent text-text-muted hover:text-white"
          )}
        >
          Build
        </button>
        <button
          onClick={() => setSelectedTab('performance')}
          className={clsx(
            "flex-1 px-6 py-3 font-semibold text-sm transition-all border-b-2",
            selectedTab === 'performance'
              ? "border-accent-light text-white bg-abyss-700/50"
              : "border-transparent text-text-muted hover:text-white"
          )}
        >
          Performance
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-0">
        {selectedTab === 'overview' ? (
          <div className="flex flex-col">
            {teamsToRender.map((team) => (
              <div 
                key={team.name}
                className={clsx(
                  team.isFirst && "border-b border-abyss-700",
                  team.won ? "bg-[#28344E]" : "bg-[#59343B]"
                )}
              >
                <table className="w-full text-left border-collapse">
                  <thead className="bg-abyss-700/50 text-xs text-gray-400">
                    <tr>
                      <th className="py-2 pl-2 font-bold">
                        <span className={team.won ? "text-accent-light" : "text-negative"}>{team.won ? 'Victory' : 'Defeat'}</span> <span className="text-text-muted font-normal">({team.name})</span>
                      </th>
                      <th className="py-2 text-center font-normal">PIG</th>
                      <th className="py-2 text-center font-normal">KDA</th>
                      <th className="py-2 text-center font-normal">Damage</th>
                      <th className="py-2 text-center font-normal">CS</th>
                      <th className="py-2 pl-4 font-normal">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.players.map(p => renderPlayerRow(p, p.puuid === currentPuuid))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : selectedTab === 'build' ? (
          <div className="p-4 space-y-6">
            {currentPlayer && (
              <>
                {/* item Timeline */}
                <div className="bg-abyss-700 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-white mb-3">Item Timeline</h3>
                  {(() => {
                    const details = participantDetails.get(currentPlayer.puuid)
                    if (details?.loading) {
                      return <div className="text-xs text-subtitle">Loading timeline...</div>
                    }
                    if (!details?.item_timeline || details.item_timeline.length === 0) {
                      return (
                        <div className="flex gap-2 items-center flex-wrap">
                          {[currentPlayer.item0, currentPlayer.item1, currentPlayer.item2, currentPlayer.item3, currentPlayer.item4, currentPlayer.item5]
                            .filter(itemId => itemId > 0)
                            .map((itemId, idx) => (
                              <div key={idx} className="relative group">
                                <div className="w-12 h-12 rounded border-2 border-gold-dark/40 overflow-hidden bg-abyss-800">
                                  <Image
                                    src={getItemImageUrl(itemId, ddragonVersion)}
                                    alt={`Item ${itemId}`}
                                    width={48}
                                    height={48}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      )
                    }
                    
                    const formatTime = (ms: number) => {
                      const minutes = Math.floor(ms / 60000)
                      const seconds = Math.floor((ms % 60000) / 1000)
                      return `${minutes}:${seconds.toString().padStart(2, '0')}`
                    }
                    
                    return (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {details.item_timeline.map((event, idx) => (
                          <div key={idx} className="flex items-center gap-3 text-xs">
                            <span className="text-subtitle font-mono w-12">{formatTime(event.timestamp)}</span>
                            <div className="w-8 h-8 rounded border border-abyss-800 overflow-hidden bg-abyss-900">
                              <Image
                                src={getItemImageUrl(event.itemId, ddragonVersion)}
                                alt={`Item ${event.itemId}`}
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className={clsx(
                              "font-medium",
                              event.type === 'ITEM_PURCHASED' && "text-green-400",
                              event.type === 'ITEM_SOLD' && "text-red-400",
                              event.type === 'ITEM_UNDO' && "text-yellow-400"
                            )}>
                              {event.type === 'ITEM_PURCHASED' && 'Purchased'}
                              {event.type === 'ITEM_SOLD' && 'Sold'}
                              {event.type === 'ITEM_UNDO' && 'Undo'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* runes */}
                <div className="bg-abyss-700 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-white mb-3">Runes</h3>
                  <div className="flex gap-6">
                    {/* primary Tree */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gold-light mb-2">Primary</div>
                      <div className="grid grid-cols-4 gap-2">
                        {[currentPlayer.perks?.styles[0]?.selections[0]?.perk,
                          currentPlayer.perks?.styles[0]?.selections[1]?.perk,
                          currentPlayer.perks?.styles[0]?.selections[2]?.perk,
                          currentPlayer.perks?.styles[0]?.selections[3]?.perk]
                          .filter(Boolean)
                          .map((runeId, idx) => {
                            const runeInfo = (runesData as Record<string, any>)[String(runeId)]
                            const runeIcon = runeInfo?.icon
                            return (
                              <Tooltip key={idx} id={runeId!} type="rune">
                                <div className={clsx(
                                  "w-12 h-12 rounded-full overflow-hidden border-2 transition-colors",
                                  idx === 0 ? "border-gold-light bg-gold-dark/20" : "border-abyss-800 bg-abyss-800"
                                )}>
                                  {runeIcon && (
                                    <Image
                                      src={`https://ddragon.leagueoflegends.com/cdn/img/${runeIcon}`}
                                      alt="Rune"
                                      width={48}
                                      height={48}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                              </Tooltip>
                            )
                          })}
                      </div>
                    </div>

                    {/* Secondary Tree */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-subtitle mb-2">Secondary</div>
                      <div className="grid grid-cols-3 gap-2">
                        {[currentPlayer.perks?.styles[1]?.selections[0]?.perk,
                          currentPlayer.perks?.styles[1]?.selections[1]?.perk]
                          .filter(Boolean)
                          .map((runeId, idx) => {
                            const runeInfo = (runesData as Record<string, any>)[String(runeId)]
                            const runeIcon = runeInfo?.icon
                            return (
                              <Tooltip key={idx} id={runeId!} type="rune">
                                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-abyss-800 bg-abyss-800">
                                  {runeIcon && (
                                    <Image
                                      src={`https://ddragon.leagueoflegends.com/cdn/img/${runeIcon}`}
                                      alt="Rune"
                                      width={40}
                                      height={40}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                              </Tooltip>
                            )
                          })}
                      </div>
                    </div>

                    {/* Stat Shards */}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-subtitle mb-2">Shards</div>
                      <div className="flex gap-2">
                        {[currentPlayer.perks?.statPerks?.offense,
                          currentPlayer.perks?.statPerks?.flex,
                          currentPlayer.perks?.statPerks?.defense]
                          .filter(Boolean)
                          .map((shardId, idx) => (
                            <div key={idx} className="w-8 h-8 rounded bg-abyss-800 border border-abyss-900 flex items-center justify-center">
                              <span className="text-[10px] text-subtitle">+</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 min-h-[200px] flex items-center justify-center text-gray-500">
            Performance stats coming soon
          </div>
        )}
      </div>
    </div>
  )
}
