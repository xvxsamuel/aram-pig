import { NextResponse } from 'next/server';
import { rateLimiter } from '../../../lib/rate-limiter';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { region, puuid } = body;

    if (!region || !puuid) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let totalMatches = 0;
    let start = 0;
    const batchSize = 100;

    while (true) {
      await rateLimiter.waitForSlot();
      
      const matchIdsUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=450&start=${start}&count=${batchSize}`;
      const response = await fetch(matchIdsUrl, {
        headers: { 'X-Riot-Token': RIOT_API_KEY! },
      });

      if (!response.ok) {
        if (totalMatches === 0) {
          throw new Error('Failed to fetch match count');
        }
        break;
      }

      const matchIds: string[] = await response.json();
      
      if (matchIds.length === 0) break;
      
      totalMatches += matchIds.length;
      
      if (matchIds.length < batchSize) break;
      
      start += batchSize;
    }

    return NextResponse.json({ totalMatches });

  } catch (error: any) {
    console.error('Match count error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get match count' },
      { status: 500 }
    );
  }
}
