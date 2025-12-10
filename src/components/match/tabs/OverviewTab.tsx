'use client'

import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { ParticipantData } from '@/types/match'
import { getChampionImageUrl, getItemImageUrl, getChampionUrlName } from '@/lib/ddragon'
import { getPigScoreColor, getKdaColor } from '@/lib/ui'
import ItemTooltip from '@/components/ui/ItemTooltip'
import { OverviewTabProps, formatDamage } from './shared'

interface TeamData {
  players: ParticipantData[]
  won: boolean
  name: string
  isFirst: boolean
}

export function OverviewTab({
  match,
  currentPuuid,
  ddragonVersion,
  region,
  team100,
  team200,
  team100Won,
  team200Won,
  hasPigScores,
  loadingPigScores,
  pigScores,
  maxDamage,
}: OverviewTabProps) {
  // Determine MOG (highest on winning team) and TRY (highest on losing team)
  const allParticipants = [...team100, ...team200]
  const winningTeam = team100Won ? team100 : team200
  const losingTeam = team100Won ? team200 : team100

  // Find highest scorer on each team
  const getHighestScorer = (team: ParticipantData[]): string | null => {
    let highest: { puuid: string; score: number } | null = null
    for (const p of team) {
      const score = pigScores.get(p.puuid)
      if (score !== null && score !== undefined) {
        if (!highest || score > highest.score) {
          highest = { puuid: p.puuid, score }
        }
      }
    }
    return highest?.puuid ?? null
  }

  // Only assign MOG/TRY if all players have scores
  const allHaveScores = allParticipants.every(p => {
    const score = pigScores.get(p.puuid)
    return score !== null && score !== undefined
  })

  const mogPuuid = allHaveScores ? getHighestScorer(winningTeam) : null
  const tryPuuid = allHaveScores ? getHighestScorer(losingTeam) : null

  function renderPlayerRow(p: ParticipantData, isCurrentPlayer: boolean, teamWon: boolean) {
    const damageDealtPct = maxDamage > 0 ? (p.totalDamageDealtToChampions / maxDamage) * 100 : 0
    const kda =
      p.deaths === 0
        ? 'Perfect'
        : ((p.kills + p.assists) / p.deaths).toFixed(2)
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
    const score = pigScores.get(p.puuid) ?? null
    
    // MOG = highest on winning team, TRY = highest on losing team
    const badge = p.puuid === mogPuuid ? 'MOG' : p.puuid === tryPuuid ? 'TRY' : null
    
    // Calculate rank among players with scores
    let rank = 0
    if (score !== null) {
      const allScores = Array.from(pigScores.values()).filter((s): s is number => s !== null)
      allScores.sort((a, b) => b - a)
      rank = allScores.indexOf(score) + 1
    }

    const playerTag = p.riotIdTagline || ''
    const profileUrl = `/${region}/${encodeURIComponent(p.riotIdGameName)}-${encodeURIComponent(playerTag)}`
    const championUrl = `/champions/${getChampionUrlName(p.championName, {})}`

    return (
      <tr
        key={p.puuid}
        className={clsx(
          'border-b border-abyss-700/50 last:border-b-0',
          isCurrentPlayer && (teamWon ? 'bg-accent-light/10' : 'bg-negative/10')
        )}
      >
        {/* Champion + Summoner */}
        <td className="py-1.25 pl-3">
          <div className="flex items-center gap-2">
            <Link href={championUrl} className="relative flex-shrink-0 hover:brightness-75 transition-all">
              <div className="w-9 h-9 rounded-lg overflow-hidden border border-gold-dark bg-abyss-800">
                <Image
                  src={getChampionImageUrl(p.championName, ddragonVersion)}
                  alt={p.championName}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 text-[10px] font-bold bg-abyss-700 text-white px-1 rounded border border-gold-dark/50">
                {p.champLevel}
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              {isCurrentPlayer ? (
                <span className="text-sm font-medium truncate text-gold-light">
                  {p.riotIdGameName}
                </span>
              ) : (
                <Link
                  href={profileUrl}
                  className="text-sm font-medium truncate transition-colors text-text-secondary hover:text-gold-light block"
                >
                  {p.riotIdGameName}
                </Link>
              )}
            </div>
          </div>
        </td>

        {/* PIG Score */}
        {hasPigScores && (
          <td className="py-1.25 text-center">
            {score !== null ? (
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold tabular-nums" style={{ color: getPigScoreColor(score) }}>
                  {Math.round(score)}
                </span>
                <span
                  className={clsx(
                    'text-[10px]',
                    badge === 'MOG'
                      ? 'text-gold-light font-base'
                      : badge === 'TRY'
                        ? 'text-gold-light font-base'
                        : 'text-text-muted'
                  )}
                >
                  {badge || `#${rank}`}
                </span>
              </div>
            ) : loadingPigScores ? (
              <div className="w-3 h-3 mx-auto border-2 border-accent-light/30 rounded-full animate-spin border-t-accent-light" />
            ) : (
              <span className="text-text-muted text-xs">-</span>
            )}
          </td>
        )}

        {/* KDA */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center">
            <div className="text-xs tabular-nums whitespace-nowrap">
              {p.kills} <span className="text-text-muted">/</span> <span className="text-white">{p.deaths}</span>{' '}
              <span className="text-text-muted">/</span> {p.assists}
            </div>
            <span
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: kda === 'Perfect' ? getKdaColor(99) : getKdaColor(Number(kda)) }}
            >
              {kda}
            </span>
          </div>
        </td>

        {/* Damage */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-white tabular-nums">{formatDamage(p.totalDamageDealtToChampions)}</span>
            <div className="w-12 h-1.5 bg-abyss-800/75 rounded-sm overflow-hidden">
              <div className="h-full bg-negative rounded-full" style={{ width: `${damageDealtPct}%` }} />
            </div>
          </div>
        </td>

        {/* CS */}
        <td className="py-1.5 text-center">
          <div className="flex flex-col items-center">
            <span className="text-xs text-text-secondary tabular-nums">{p.totalMinionsKilled}</span>
            <span className="text-[10px] text-text-muted tabular-nums">
              {(p.totalMinionsKilled / (match.info.gameDuration / 60)).toFixed(1)}/m
            </span>
          </div>
        </td>

        {/* Items */}
        <td className="py-1">
          <div className="flex gap-0.5 justify-center">
            {items.map((item, idx) =>
              item > 0 ? (
                <ItemTooltip key={idx} itemId={item}>
                  <div className="w-6 h-6 rounded overflow-hidden bg-abyss-800 border border-gold-dark">
                    <Image
                      src={getItemImageUrl(item, ddragonVersion)}
                      alt=""
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </ItemTooltip>
              ) : (
                <div key={idx} className="w-6 h-6 rounded bg-abyss-800/50 border border-gold-dark/50" />
              )
            )}
          </div>
        </td>
      </tr>
    )
  }

  const isPlayerInTeam100 = team100.some(p => p.puuid === currentPuuid)
  const teamsToRender: TeamData[] = isPlayerInTeam100
    ? [
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: true },
        { players: team200, won: team200Won, name: 'Red Team', isFirst: false },
      ]
    : [
        { players: team200, won: team200Won, name: 'Red Team', isFirst: true },
        { players: team100, won: team100Won, name: 'Blue Team', isFirst: false },
      ]

  return (
    <div className="flex flex-col">
      {teamsToRender.map((team, teamIdx) => (
        <div
          key={team.name}
          className={clsx(
            teamIdx === 0 && 'border-b border-abyss-500/50',
            team.won ? 'bg-win/75' : 'bg-loss/75'
          )}
        >
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[28%]" />
              {hasPigScores && <col className="w-[10%]" />}
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[28%]" />
            </colgroup>
            <thead>
              <tr className="text-[10px] text-text-muted border-b border-abyss-700 bg-abyss-700">
                <th className="py-1.5 pl-3 text-left font-normal">
                  <span
                    className={clsx('text-sm font-semibold', team.won ? 'text-accent-light' : 'text-negative')}
                  >
                    {team.won ? 'Victory' : 'Defeat'}
                  </span>
                  <span className="text-xs text-text-muted ml-1.5">({team.name})</span>
                </th>
                {hasPigScores && <th className="py-1.5 text-center font-normal">PIG</th>}
                <th className="py-1.5 text-center font-normal">KDA</th>
                <th className="py-1.5 text-center font-normal">Damage</th>
                <th className="py-1.5 text-center font-normal">CS</th>
                <th className="py-1.5 text-center font-normal">Items</th>
              </tr>
            </thead>
            <tbody>{team.players.map(p => renderPlayerRow(p, p.puuid === currentPuuid, team.won))}</tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
