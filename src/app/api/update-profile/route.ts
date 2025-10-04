import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase';
import { getAccountByRiotId, getSummonerByPuuid, getMatchIdsByPuuid, getMatchById } from '../../../lib/riot-api';
import { PLATFORM_TO_REGIONAL, type PlatformCode } from '../../../lib/regions';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

async function fetchMatchIds(region: string, puuid: string, count?: number) {
  const allMatchIds: string[] = [];
  const maxPerRequest = 100;
  let start = 0;
  
  while (true) {
    if (count && allMatchIds.length >= count) break;
    
    const batchCount = count ? Math.min(maxPerRequest, count - allMatchIds.length) : maxPerRequest;
    
    const batchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchCount, start);
    
    if (batchIds.length === 0) break;
    
    allMatchIds.push(...batchIds);
    
    if (batchIds.length < maxPerRequest) break;
    
    start += maxPerRequest;
  }
  
  return allMatchIds;
}

async function fetchMatch(region: string, matchId: string) {
  return await getMatchById(matchId, region as any);
}

export async function POST(request: Request) {
  try {
    const { region, gameName, tagLine } = await request.json();
    
    if (!region || !gameName || !tagLine) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // riot
    const accountData = await getAccountByRiotId(gameName, tagLine, region as any);
    if (!accountData) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // platform
    const platformMap: Record<string, PlatformCode> = {
      americas: 'na1',
      europe: 'euw1',
      asia: 'kr',
      sea: 'oc1',
    };
    const platform = platformMap[region] || 'na1';
    const summonerData = await getSummonerByPuuid(accountData.puuid, platform as PlatformCode);
    if (!summonerData) {
      return NextResponse.json({ error: 'Summoner not found' }, { status: 404 });
    }

    const { error: summonerError } = await supabase
      .from('summoners')
      .upsert({
        puuid: accountData.puuid,
        game_name: accountData.gameName,
        tag_line: accountData.tagLine,
        summoner_level: summonerData.summonerLevel,
        profile_icon_id: summonerData.profileIconId,
        region: region,
        last_updated: new Date().toISOString(),
      });

    if (summonerError) {
      console.error('Summoner upsert error:', summonerError);
      return NextResponse.json(
        { error: 'Failed to update summoner data' },
        { status: 500 }
      );
    }

    const { data: existingMatches } = await supabase
      .from('summoner_matches')
      .select('match_id')
      .eq('puuid', accountData.puuid);

    const existingMatchIds = new Set(
      existingMatches?.map((m: { match_id: string }) => m.match_id) || []
    );

    const matchIds = await fetchMatchIds(region, accountData.puuid);
    
    const newMatchIds = matchIds.filter((id: string) => !existingMatchIds.has(id));

    if (newMatchIds.length === 0) {
      return NextResponse.json({
        message: 'Profile is up to date',
        newMatches: 0,
      });
    }

    let fetchedMatches = 0;

    for (const matchId of newMatchIds) {
      try {
        const match = await fetchMatch(region, matchId);

        const { error: matchError } = await supabase
          .from('matches')
          .upsert({
            match_id: match.metadata.matchId,
            game_creation: match.info.gameCreation,
            game_duration: match.info.gameDuration,
            game_mode: match.info.gameMode,
            queue_id: match.info.queueId,
            match_data: match,
          });

        if (matchError) {
          console.error('Match insert error:', matchError);
          continue;
        }

        const allPuuids = match.info.participants.map((p: any) => p.puuid);
        const { error: summonersError } = await supabase
          .from('summoners')
          .upsert(
            allPuuids.map((puuid: string) => ({ puuid })),
            { onConflict: 'puuid', ignoreDuplicates: true }
          );

        if (summonersError) {
          console.error('Summoners insert error:', summonersError);
        }

        const summonerMatchRecords = match.info.participants.map((p: any) => ({
          puuid: p.puuid,
          match_id: match.metadata.matchId,
          champion_name: p.championName,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          win: p.win,
        }));

        const { error: junctionError } = await supabase
          .from('summoner_matches')
          .upsert(summonerMatchRecords);

        if (junctionError) {
          console.error('Junction table insert error:', junctionError);
        }

        fetchedMatches++;
      } catch (err) {
        console.error(`Failed to fetch/store match ${matchId}:`, err);
        // continue with next match
      }
    }

    // update last_updated timestamp
    await supabase
      .from('summoners')
      .update({ last_updated: new Date().toISOString() })
      .eq('puuid', accountData.puuid);

    return NextResponse.json({
      message: 'Profile updated successfully',
      newMatches: fetchedMatches,
    });

  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
