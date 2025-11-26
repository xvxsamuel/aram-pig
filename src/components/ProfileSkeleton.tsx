"use client"

import Image from "next/image"

interface Props {
  profileIconId: number
  gameName: string
  tagLine: string
  summonerLevel: number
  profileIconUrl: string
  region: string
  name: string
}



export default function ProfileSkeleton({ 
  profileIconId, 
  gameName, 
  tagLine, 
  summonerLevel,
  profileIconUrl,
  region,
  name
}: Props) {
  return (
    <>
      {/* profile header with basic info */}
      <section className="relative overflow-hidden bg-abyss-700">
        <div className="max-w-6xl mx-auto px-8 py-6 min-h-40 relative z-10">
          <div className="flex items-start gap-6">
            <div className="relative flex-shrink-0">
              <div className="rounded-xl p-px bg-gradient-to-b from-gold-light to-gold-dark">
                <div className="w-24 h-24 rounded-[inherit] bg-accent-dark overflow-hidden">
                  <Image 
                    src={profileIconUrl}
                    alt="Profile Icon"
                    width={120}
                    height={120}
                    className="w-full h-full object-cover"
                    priority
                  />
                </div>
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-md p-px bg-gradient-to-b from-gold-light to-gold-dark">
                <div className="px-2 py-0.5 rounded-[inherit] bg-abyss-500">
                  <span className="text-sm font-bold text-white">{summonerLevel}</span>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-between h-26">
              <h1 className="text-3xl font-bold text-white">
                {gameName}
                <span className="text-text-muted"> #{tagLine}</span>
              </h1>
              <div className="flex flex-col gap-2">
                <div className="h-10 w-32 bg-abyss-500/50 rounded animate-pulse"></div>
                <p className="text-xs text-text-muted">Loading...</p>
              </div>
            </div>
          </div>

          {/* tab navigation skeleton */}
          <div className="flex gap-1 mt-4">
            <div className="px-6 py-2 border-b-2 border-accent-light">
              <span className="font-semibold text-white">Overview</span>
            </div>
            <div className="px-6 py-2 border-b-2 border-transparent">
              <span className="font-semibold text-text-muted">Champions</span>
            </div>
            <div className="px-6 py-2 border-b-2 border-transparent">
              <span className="font-semibold text-text-muted">Performance</span>
            </div>
          </div>
        </div>
      </section>

      {/* loading content */}
      <div className="max-w-6xl mx-auto px-2 sm:px-8">
        <div className="flex flex-col xl:flex-row gap-4 py-4">
          {/* left sidebar skeletons */}
          <div className="flex flex-col gap-4 xl:w-80 w-full flex-shrink-0">
            {/* Performance card skeleton */}
            <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
              <div className="px-4 py-1.5">
                <h2 className="text-xl font-bold text-left mb-1.5">Performance</h2>
                <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-4 -mx-4" />
                <div className="flex items-center gap-4 pb-2">
                  <div className="w-[72px] h-[72px] bg-abyss-500 rounded-lg animate-pulse flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="h-6 w-20 bg-abyss-500 rounded animate-pulse mb-1"></div>
                    <div className="h-4 w-28 bg-abyss-500 rounded animate-pulse"></div>
                  </div>
                  <div className="text-right">
                    <div className="h-4 w-16 bg-abyss-500 rounded animate-pulse mb-1"></div>
                    <div className="h-5 w-20 bg-abyss-500 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Champions card skeleton */}
            <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
              <div className="px-4 py-1.5">
                <h2 className="text-xl font-bold text-left mb-1.5">Champions</h2>
                <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-4 -mx-4" />
                <div className="space-y-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="w-10 h-10 bg-abyss-500 rounded animate-pulse"></div>
                      <div className="flex-1">
                        <div className="h-4 w-20 bg-abyss-500 rounded animate-pulse mb-1"></div>
                        <div className="h-3 w-12 bg-abyss-500 rounded animate-pulse"></div>
                      </div>
                      <div className="h-5 w-12 bg-abyss-500 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recently played skeleton */}
            <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 overflow-hidden">
              <div className="py-3">
                <h2 className="text-xl font-bold text-left mb-3 px-6">Recently played with</h2>
                <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-1" />
                <div className="space-y-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 px-6">
                      <div className="w-7 h-7 bg-abyss-500 rounded-full animate-pulse"></div>
                      <div className="flex-1">
                        <div className="h-4 w-24 bg-abyss-500 rounded animate-pulse mb-1"></div>
                        <div className="h-3 w-16 bg-abyss-500 rounded animate-pulse"></div>
                      </div>
                      <div className="h-4 w-10 bg-abyss-500 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* match history skeleton */}
          <div className="flex-1 bg-abyss-600 rounded-lg border border-gold-dark/40">
            <div className="px-6 py-3">
              <div className="flex items-center justify-between gap-4 mb-3">
                <h2 className="text-xl font-bold">Match History</h2>
                <div className="h-8 w-64 bg-abyss-500 rounded-xl animate-pulse"></div>
              </div>
              <div className="h-px bg-gradient-to-r from-gold-dark/30 to-transparent mb-4 -mx-6" />
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-20 bg-abyss-500 rounded-lg animate-pulse"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
