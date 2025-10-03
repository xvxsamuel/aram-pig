import Image from "next/image"
import type { MatchData } from "../lib/riot-api"

interface Props {
  match: MatchData
  puuid: string
}

export default function MatchHistoryItem({ match, puuid }: Props) {
  const participant = match.info.participants.find(p => p.puuid === puuid)
  if (!participant) return null

  const isWin = participant.win
  const kda = participant.deaths === 0 
    ? 'Perfect'
    : ((participant.kills + participant.assists) / participant.deaths).toFixed(2)
  
  const gameDurationMinutes = Math.floor(match.info.gameDuration / 60)
  const gameDurationSeconds = match.info.gameDuration % 60
  const gameDate = new Date(match.info.gameCreation)
  const timeAgo = getTimeAgo(gameDate)

  const team1 = match.info.participants.filter(p => p.teamId === 100)
  const team2 = match.info.participants.filter(p => p.teamId === 200)

  return (
    <div
      className={`rounded-lg border-l-[6px] overflow-hidden ${
        isWin 
          ? 'bg-[#28344E] border-[#5383E8]' 
          : 'bg-[#59343B] border-[#E84057]'
      }`}
    >
      <div className="flex items-center gap-4 px-4 py-3 min-h-[80px]">
        {/* Champion Section */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-accent-dark border-2 border-gray-600">
              <Image
                src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/champion/${participant.championName}.png`}
                alt={participant.championName}
                width={48}
                height={48}
                className="w-full h-full scale-110 object-cover"
                unoptimized
              />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs font-bold">
              {participant.champLevel}
            </div>
          </div>

          {/* Summoner Spells */}
          <div className="flex flex-col gap-0.5">
            <div className="w-5 h-5 rounded bg-gray-800 border border-gray-700 overflow-hidden">
              <Image
                src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/spell/Summoner${getSpellName(participant.summoner1Id)}.png`}
                alt="Spell 1"
                width={20}
                height={20}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
            <div className="w-5 h-5 rounded bg-gray-800 border border-gray-700 overflow-hidden">
              <Image
                src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/spell/Summoner${getSpellName(participant.summoner2Id)}.png`}
                alt="Spell 2"
                width={20}
                height={20}
                className="w-full h-full object-cover"
                unoptimized
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col justify-center flex-shrink-0 min-w-[110px]">
          <div className={`text-sm font-bold mb-1 ${isWin ? 'text-[#5383E8]' : 'text-[#E84057]'}`}>
            {isWin ? 'WIN' : 'LOSE'}
            <span className="text-gray-400 font-normal ml-2 text-xs">
              {gameDurationMinutes}:{gameDurationSeconds.toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-white">
              {participant.kills}
            </span>
            <span className="text-gray-500 text-sm">/</span>
            <span className="text-lg font-bold text-[#E84057]">
              {participant.deaths}
            </span>
            <span className="text-gray-500 text-sm">/</span>
            <span className="text-lg font-bold text-white">
              {participant.assists}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{kda} KDA</div>
        </div>

        {/* Items */}
        <div className="flex gap-1 flex-shrink-0 ml-2">
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
                className="w-6 h-6 rounded bg-gray-800 border border-gray-700 overflow-hidden"
              >
                {itemId > 0 && (
                  <Image
                    src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/item/${itemId}.png`}
                    alt={`Item ${itemId}`}
                    width={24}
                    height={24}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CS */}
        <div className="flex flex-col items-center flex-shrink-0 min-w-[55px] ml-2">
          <div className="text-sm font-semibold text-white">
            {participant.totalMinionsKilled + participant.neutralMinionsKilled} CS
          </div>
          <div className="text-xs text-gray-400">
            ({((participant.totalMinionsKilled + participant.neutralMinionsKilled) / gameDurationMinutes).toFixed(1)})
          </div>
        </div>

        {/* All Players */}
        <div className="flex gap-3 ml-auto flex-shrink-0">
          {/* Team 1 */}
          <div className="flex flex-col gap-0.5 w-24">
            {team1.map((p, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <div
                  className={`w-4 h-4 rounded overflow-hidden flex-shrink-0 ${
                    p.puuid === puuid ? 'ring-2 ring-yellow-400' : ''
                  }`}
                >
                  <Image
                    src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/champion/${p.championName}.png`}
                    alt={p.championName}
                    width={16}
                    height={16}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
                <span className="text-xs text-gray-300 truncate max-w-[80px]">
                  {p.riotIdGameName || p.summonerName}
                </span>
              </div>
            ))}
          </div>

          {/* Team 2 */}
          <div className="flex flex-col gap-0.5">
            {team2.map((p, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <div
                  className={`w-4 h-4 rounded overflow-hidden flex-shrink-0 ${
                    p.puuid === puuid ? 'ring-2 ring-yellow-400' : ''
                  }`}
                >
                  <Image
                    src={`https://ddragon.leagueoflegends.com/cdn/14.21.1/img/champion/${p.championName}.png`}
                    alt={p.championName}
                    width={16}
                    height={16}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
                <span className="text-xs text-gray-300 truncate max-w-[80px]">
                  {p.riotIdGameName || p.summonerName}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Dropdown Arrow */}
        <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 11L3 6h10l-5 5z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function getSpellName(spellId: number): string {
  const spellMap: { [key: number]: string } = {
    1: 'Boost',
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste',
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Mana',
    14: 'Dot',
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Snowball',
  }
  return spellMap[spellId] || 'Flash'
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
