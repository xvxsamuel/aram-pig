import Link from 'next/link'
import Image from 'next/image'
import { PLATFORM_TO_LABEL } from '../lib/regions'

interface SuggestedSummoner {
  puuid: string
  game_name: string
  tag_line: string
  region: string
  profile_icon_id: number
}

interface Props {
  searchedRegion: string
  suggestedSummoners: SuggestedSummoner[]
  ddragonVersion: string
}

export default function SummonerNotFound({ searchedRegion, suggestedSummoners, ddragonVersion }: Props) {
  return (
    <div className="rounded-2xl p-px bg-gradient-to-b from-gold-light to-gold-dark mb-6">
      <div className="bg-abyss-600 rounded-[inherit] p-6">
        <p className="text-white text-lg mb-2">
          Summoner not found on {searchedRegion}
        </p>
        <p className="text-text-muted text-sm mb-6">
          Did you mean to search for...
        </p>
        
        <div className="flex flex-col gap-3">
          {suggestedSummoners.map((summoner) => {
            const regionLabel = PLATFORM_TO_LABEL[summoner.region as keyof typeof PLATFORM_TO_LABEL] || summoner.region.toUpperCase()
            const profileUrl = `/${regionLabel}/${encodeURIComponent(summoner.game_name)}-${encodeURIComponent(summoner.tag_line)}`
            
            return (
              <Link
                key={summoner.puuid}
                href={profileUrl}
                className="flex items-center gap-4 p-4 rounded-xl bg-abyss-700 hover:bg-abyss-500 transition-colors group"
              >
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gold-light/50 group-hover:border-gold-light transition-colors flex-shrink-0">
                  <Image
                    src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/profileicon/${summoner.profile_icon_id}.png`}
                    alt={`${summoner.game_name} profile icon`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-gold-light transition-colors">
                    {summoner.game_name}#{summoner.tag_line}
                  </p>
                  <p className="text-text-muted text-sm">
                    {regionLabel}
                  </p>
                </div>
                
                <div className="text-gold-light opacity-0 group-hover:opacity-100 transition-opacity">
                  →
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
