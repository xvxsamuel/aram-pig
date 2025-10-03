import { NextResponse } from 'next/server'
import { rateLimiter } from '../../../lib/rate-limiter'

export async function GET() {
  try {
    const status = rateLimiter.getStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error('Error getting rate limit status:', error)
    return NextResponse.json(
      { error: 'Failed to get rate limit status' },
      { status: 500 }
    )
  }
}
