import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase';
import { rateLimiter } from '../../../lib/rate-limiter';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

async function fetchAccount(region: string, gameName: string, tagLine: string) {
  await rateLimiter.waitForSlot();
  
  const accountUrl = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const accountRes = await fetch(accountUrl, {
    headers: { 'X-Riot-Token': RIOT_API_KEY! },
  });
  if (!accountRes.ok) throw new Error('Account not found');
  return accountRes.json();
}

async function fetchSummoner(region: string, puuid: string) {
  await rateLimiter.waitForSlot();
  
  const platformMap: Record<string, string> = {
    americas: 'na1',
    europe: 'euw1',
    asia: 'kr',
    sea: 'oc1',
  };
  const platform = platformMap[region] || 'na1';
  const summonerUrl = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const summonerRes = await fetch(summonerUrl, {
    headers: { 'X-Riot-Token': RIOT_API_KEY! },
  });
  if (!summonerRes.ok) throw new Error('Summoner not found');
  return summonerRes.json();
}

async function fetchMatchIds(region: string, puuid: string, count?: number) {
  const allMatchIds: string[] = [];
  const maxPerRequest = 100;
  let start = 0;
  
  while (true) {
    if (count && allMatchIds.length >= count) break;
    
    await rateLimiter.waitForSlot();
    
    const batchCount = count ? Math.min(maxPerRequest, count - allMatchIds.length) : maxPerRequest;
    const matchIdsUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=normal&queue=450&start=${start}&count=${batchCount}`;
    
    const matchIdsRes = await fetch(matchIdsUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY! },
    });
    
    if (!matchIdsRes.ok) break;
    
    const batchIds = await matchIdsRes.json();
    
    if (batchIds.length === 0) break;
    
    allMatchIds.push(...batchIds);
    
    if (batchIds.length < maxPerRequest) break;
    
    start += maxPerRequest;
  }
  
  return allMatchIds;
}

async function fetchMatch(region: string, matchId: string) {
  await rateLimiter.waitForSlot();
  
  const matchUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const matchRes = await fetch(matchUrl, {
    headers: { 'X-Riot-Token': RIOT_API_KEY! },
  });
  if (!matchRes.ok) throw new Error(`Failed to fetch match ${matchId}`);
  return matchRes.json();
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

    const accountData = await fetchAccount(region, gameName, tagLine);
    const summonerData = await fetchSummoner(region, accountData.puuid);

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
      }
    }

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
