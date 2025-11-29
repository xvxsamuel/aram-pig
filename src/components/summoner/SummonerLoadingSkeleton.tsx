"use client"

import ProfileCard from "@/components/ui/ProfileCard"
import LoadingSpinner from "@/components/ui/LoadingSpinner"

// skeleton row for champions list
function ChampionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 px-2 animate-pulse">
      <div className="w-8 h-8 bg-abyss-500 rounded flex-shrink-0"></div>
      <div className="flex-1 min-w-0">
        <div className="h-4 w-20 bg-abyss-500 rounded mb-1"></div>
        <div className="h-3 w-12 bg-abyss-500 rounded"></div>
      </div>
      <div className="h-4 w-14 bg-abyss-500 rounded"></div>
      <div className="h-4 w-12 bg-abyss-500 rounded"></div>
    </div>
  )
}

export default function SummonerLoadingSkeleton() {
  return (
    <div className="flex flex-col xl:flex-row gap-4">
      {/* left sidebar */}
      <div className="flex flex-col gap-4 xl:w-80 w-full flex-shrink-0">
        {/* Performance card */}
        <ProfileCard title="Performance" contentClassName="pb-2">
          <div className="grid grid-cols-3 gap-2">
            {/* PIG score arc placeholder */}
            <div className="flex items-center justify-start">
              <div className="w-[72px] h-[72px] rounded-full border-4 border-abyss-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-text-muted">--</span>
              </div>
            </div>
            {/* KDA placeholder */}
            <div className="flex flex-col items-center justify-center">
              <div className="h-5 w-16 bg-abyss-500 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-20 bg-abyss-500 rounded animate-pulse"></div>
            </div>
            {/* Winrate placeholder */}
            <div className="flex flex-col items-end justify-center">
              <div className="h-5 w-14 bg-abyss-500 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-16 bg-abyss-500 rounded animate-pulse"></div>
            </div>
          </div>
        </ProfileCard>

        {/* Champions card */}
        <ProfileCard title="Champions">
          <div className="-mx-2 space-y-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <ChampionRowSkeleton key={i} />
            ))}
          </div>
        </ProfileCard>
      </div>

      {/* Match History with spinner */}
      <div className="w-full xl:flex-1 xl:min-w-0 flex flex-col">
        <ProfileCard 
          title="ARAM History" 
          contentClassName="flex-1 flex flex-col"
          headerRight={
            <div className="h-7 w-48 bg-abyss-500 rounded-xl animate-pulse"></div>
          }
        >
          <div className="flex-1 flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        </ProfileCard>
      </div>
    </div>
  )
}
