import { NextResponse } from 'next/server';
import { getMatchIdsByPuuid } from '@/lib/riot/api';
import { createAdminClient } from '@/lib/db';

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

    const supabase = createAdminClient();
    const { data: existingMatches } = await supabase
      .from('summoner_matches')
      .select('match_id')
      .eq('puuid', puuid);

    const existingMatchIds = new Set(
      existingMatches?.map(m => m.match_id) || []
    );

    console.log(`existing: ${existingMatchIds.size}`);

    let newMatchCount = 0;
    let start = 0;
    const batchSize = 100;
    const maxMatches = 1000;

    while (start < maxMatches) {
      const matchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchSize, start, 'overhead');
      
      if (matchIds.length === 0) break;

      const newMatches = matchIds.filter(id => !existingMatchIds.has(id));
      newMatchCount += newMatches.length;

      console.log(`batch ${start / batchSize + 1}: ${newMatches.length}/${matchIds.length} new`);

      if (newMatches.length < matchIds.length) {
        console.log('Reached existing matches');
        break;
      }
      
      if (matchIds.length < batchSize) break;
      
      start += batchSize;
    }

    console.log(`Total new: ${newMatchCount}`);

    return NextResponse.json({ totalMatches: newMatchCount });

  } catch (error: any) {
    console.error('Match count error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get match count' },
      { status: 500 }
    );
  }
}