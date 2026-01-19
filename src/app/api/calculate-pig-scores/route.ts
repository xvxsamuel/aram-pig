// on-demand pig score calculation endpoint
// calculates pig scores in background after matches are fetched
// phases: user (tracked user's matches) -> others (teammates/enemies)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db'
import {
  ONE_YEAR_MS,
  calculateUserMatchesPigScores,
  calculateOtherPlayersPigScores,
} from '@/lib/scoring/pig-calculator'
import { recalculateProfileStatsForPlayers } from '@/lib/scoring'

// in-memory state to prevent duplicate processing
const processingState = new Map<string, { isProcessing: boolean; lastActivity: number }>()

function cleanupStaleStates() {
  const now = Date.now()
  const staleThreshold = 5 * 60 * 1000
  for (const [puuid, state] of processingState) {
    if (now - state.lastActivity > staleThreshold) {
      processingState.delete(puuid)
    }
  }
}

interface CalculateRequest {
  puuid: string
  region: string
  phase?: 'user' | 'others'
  offset?: number
}

export async function POST(request: Request) {
  try {
    const { puuid, region, phase = 'user', offset = 0 }: CalculateRequest = await request.json()

    if (!puuid || !region) {
      return NextResponse.json({ error: 'puuid and region required' }, { status: 400 })
    }

    console.log(`[PigCalc] phase=${phase}, offset=${offset}`)

    cleanupStaleStates()

    // check/set processing state
    let state = processingState.get(puuid)
    if (!state) {
      state = { isProcessing: false, lastActivity: Date.now() }
      processingState.set(puuid, state)
    }

    if (state.isProcessing) {
      return NextResponse.json({ status: 'processing', message: 'Already in progress' })
    }

    state.isProcessing = true
    state.lastActivity = Date.now()

    const supabase = createAdminClient()
    const startTime = Date.now()
    const oneYearAgo = Date.now() - ONE_YEAR_MS

    try {
      if (phase === 'user') {
        const result = await calculateUserMatchesPigScores(supabase, puuid, region, oneYearAgo, offset, startTime)
        
        // when user phase completes, recalculate profile stats to include new PIG scores
        if (!result.hasMore) {
          console.log(`[PigCalc] User phase complete, recalculating profile stats for ${puuid}`)
          await recalculateProfileStatsForPlayers([puuid])
        }
        
        return NextResponse.json({
          status: result.hasMore ? 'processing' : 'user_complete',
          phase: 'user',
          calculated: result.calculated,
          offset: result.nextOffset,
          hasMore: result.hasMore,
        })
      } else {
        const result = await calculateOtherPlayersPigScores(supabase, puuid, region, oneYearAgo, offset, startTime)
        
        return NextResponse.json({
          status: result.hasMore ? 'processing' : 'complete',
          phase: 'others',
          calculated: result.calculated,
          offset: result.nextOffset,
          hasMore: result.hasMore,
        })
      }
    } finally {
      state.isProcessing = false
      state.lastActivity = Date.now()
    }
  } catch (error) {
    console.error('[PigCalc] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
