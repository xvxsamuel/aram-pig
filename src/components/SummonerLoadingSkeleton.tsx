"use client"

export default function SummonerLoadingSkeleton() {
  return (
    <div className="flex flex-col xl:flex-row gap-4 py-4">
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
                <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
                  <div className="w-10 h-10 bg-abyss-500 rounded"></div>
                  <div className="flex-1">
                    <div className="h-4 w-20 bg-abyss-500 rounded mb-1"></div>
                    <div className="h-3 w-28 bg-abyss-500 rounded"></div>
                  </div>
                  <div className="h-5 w-12 bg-abyss-500 rounded"></div>
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
                <div key={i} className="flex items-center gap-3 py-1.5 px-6 animate-pulse">
                  <div className="w-7 h-7 bg-abyss-500 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-abyss-500 rounded mb-1"></div>
                    <div className="h-3 w-16 bg-abyss-500 rounded"></div>
                  </div>
                  <div className="h-4 w-10 bg-abyss-500 rounded"></div>
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
  )
}
