// load more matches api - uses shared query functions
import { NextResponse } from 'next/server'
import { getMatchesAsMatchData } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { puuid, offset, limit = 20, currentName } = await request.json()

    if (!puuid) {
      return NextResponse.json({ error: 'PUUID is required' }, { status: 400 })
    }

    const { matches, hasMore } = await getMatchesAsMatchData(puuid, limit, offset, currentName)

    return NextResponse.json({ matches, hasMore })
  } catch (error: any) {
    console.error('Load more matches error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load matches' }, { status: 500 })
  }
}
