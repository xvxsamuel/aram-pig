import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Champions | ARAM PIG',
  description: 'View champion statistics and performance in ARAM.',
}

export default function ChampionsPage() {
  return (
    <main className="min-h-screen bg-accent-darker text-white">
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <h1 className="text-5xl font-bold mb-4">Champions</h1>
          <p className="text-2xl text-subtitle">Coming Soon</p>
        </div>
      </div>
    </main>
  )
}
