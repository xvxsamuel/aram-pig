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
                <p className="text-xs text-text-muted">loading...</p>
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
              <span className="font-semibold text-text-muted">Badges</span>
            </div>
          </div>
        </div>
      </section>

      {/* loading content */}
      <div className="max-w-6xl mx-auto px-2 sm:px-8">
        <div className="flex flex-col xl:flex-row gap-4 py-4">
          {/* left sidebar skeletons */}
          <div className="flex flex-col gap-4 xl:w-80 w-full">
            <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-6 min-h-[200px] flex items-center justify-center">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 border-3 border-accent-light rounded-full animate-spin border-t-transparent"></div>
              </div>
            </div>
            <div className="bg-abyss-600 rounded-lg border border-gold-dark/40 p-6 min-h-[300px] flex items-center justify-center">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 border-3 border-accent-light rounded-full animate-spin border-t-transparent"></div>
              </div>
            </div>
          </div>

          {/* match history skeleton */}
          <div className="flex-1 bg-abyss-600 rounded-lg border border-gold-dark/40 p-6 min-h-[500px] flex items-center justify-center">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-accent-light rounded-full animate-spin border-t-transparent"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
