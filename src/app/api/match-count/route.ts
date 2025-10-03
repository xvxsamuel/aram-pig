import { NextResponse } from 'next/server';
import { getMatchIdsByPuuid } from '../../../lib/riot-api';

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

    // batches
    while (true) {
      const matchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchSize);
      
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
