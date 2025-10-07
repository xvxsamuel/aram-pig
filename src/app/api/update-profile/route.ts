import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase';
import { getAccountByRiotId, getSummonerByPuuid, getMatchIdsByPuuid, getMatchById } from '../../../lib/riot-api';
import { PLATFORM_TO_REGIONAL, type PlatformCode } from '../../../lib/regions';
import type { UpdateJob } from '../../../types/update-jobs';

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

// cleanup stale jobs before starting new one
async function cleanupStaleJobs(supabase: any) {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  // cleanup jobs older than 15 minutes
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: 'job timed out after 15 minutes',
      completed_at: new Date().toISOString()
    })
    .in('status', ['pending', 'processing'])
    .lt('started_at', fifteenMinutesAgo);
  
  // also cleanup processing jobs with no recent progress (likely orphaned by server restart)
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: 'job stalled - no progress in 5 minutes',
      completed_at: new Date().toISOString()
    })
    .eq('status', 'processing')
    .lt('updated_at', fiveMinutesAgo);
}

// check for existing active job
async function getActiveJob(supabase: any, puuid: string): Promise<UpdateJob | null> {
  const { data } = await supabase
    .from('update_jobs')
    .select('*')
    .eq('puuid', puuid)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return data;
}

// create new job
async function createJob(supabase: any, puuid: string, totalMatches: number, etaSeconds: number): Promise<string> {
  const { data, error } = await supabase
    .from('update_jobs')
    .insert({
      puuid,
      status: 'processing',
      total_matches: totalMatches,
      fetched_matches: 0,
      eta_seconds: etaSeconds,
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
    throw new Error(`failed to create job: ${error.message}`);
  }
  
  return data.id;
}

// update job progress with dynamic eta
async function updateJobProgress(supabase: any, jobId: string, fetchedMatches: number, elapsedMs: number, totalMatches: number) {
  // calculate dynamic eta based on actual fetch time
  const avgTimePerMatch = elapsedMs / fetchedMatches;
  const remainingMatches = totalMatches - fetchedMatches;
  const etaSeconds = Math.ceil((avgTimePerMatch * remainingMatches) / 1000);
  
  await supabase
    .from('update_jobs')
    .update({ 
      fetched_matches: fetchedMatches,
      eta_seconds: etaSeconds 
    })
    .eq('id', jobId);
}

// mark job as completed
async function completeJob(supabase: any, jobId: string) {
  await supabase
    .from('update_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId);
}

// mark job as failed
async function failJob(supabase: any, jobId: string, errorMessage: string) {
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId);
}

export async function POST(request: Request) {
  let jobId: string | null = null;
  try {
    const { region, gameName, tagLine, platform } = await request.json();
    
    if (!region || !gameName || !tagLine || !platform) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // cleanup stale jobs first
    await cleanupStaleJobs(supabase);

    // riot
    const accountData = await getAccountByRiotId(gameName, tagLine, region as any);
    if (!accountData) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // check for existing active job
    const existingJob = await getActiveJob(supabase, accountData.puuid);
    if (existingJob) {
      return NextResponse.json({
        message: 'update already in progress',
        jobId: existingJob.id,
        alreadyInProgress: true
      });
    }

    // use platform from request instead of hardcoded map
    const summonerData = await getSummonerByPuuid(accountData.puuid, platform as PlatformCode);
    if (!summonerData) {
      return NextResponse.json({ error: 'Summoner not found' }, { status: 404 });
    }

    // check if recently updated (within last 5 minutes) BEFORE updating
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: existingSummoner } = await supabase
      .from('summoners')
      .select('last_updated')
      .eq('puuid', accountData.puuid)
      .single();
    
    if (existingSummoner?.last_updated) {
      const lastUpdated = new Date(existingSummoner.last_updated);
      if (lastUpdated > fiveMinutesAgo) {
        console.log('Profile recently updated, skipping fetch');
        return NextResponse.json({
          message: 'Profile is up to date',
          newMatches: 0,
          recentlyUpdated: true
        });
      }
    }

    // now update summoner data
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

    // only fetch from riot api if we have existing matches (to compare)
    // for new profiles, we need to fetch anyway
    const hasExistingMatches = existingMatchIds.size > 0;

    const matchIds = await fetchMatchIds(region, accountData.puuid);
    
    const newMatchIds = matchIds.filter((id: string) => !existingMatchIds.has(id));

    if (newMatchIds.length === 0 && hasExistingMatches) {
      // update last_updated timestamp
      await supabase
        .from('summoners')
        .update({ last_updated: new Date().toISOString() })
        .eq('puuid', accountData.puuid);
        
      return NextResponse.json({
        message: 'Profile is up to date',
        newMatches: 0,
      });
    }

    // calculate initial eta (rough estimate)
    const apiCallsNeeded = newMatchIds.length + Math.ceil(newMatchIds.length / 100);
    const etaSeconds = Math.ceil(apiCallsNeeded / 15);

    // create job
    jobId = await createJob(supabase, accountData.puuid, newMatchIds.length, etaSeconds);
    console.log(`Created job ${jobId} for ${newMatchIds.length} matches`)

    let fetchedMatches = 0;
    const updateProgressInterval = 5; // update progress every 5 matches
    const startTime = Date.now();

    for (const matchId of newMatchIds) {
      try {
        console.log(`Fetching match ${fetchedMatches + 1}/${newMatchIds.length}: ${matchId}`)
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
          .insert(summonerMatchRecords)
          .select();

        if (junctionError && junctionError.code !== '23505') {
          // ignore duplicate key errors (23505), log others
          console.error('Junction table insert error:', junctionError);
        } else if (!junctionError) {
          console.log(`Inserted ${summonerMatchRecords.length} summoner_match records for match ${matchId}`)
        }

        fetchedMatches++;

        // update progress every N matches
        if (fetchedMatches % updateProgressInterval === 0 || fetchedMatches === newMatchIds.length) {
          const elapsedMs = Date.now() - startTime;
          await updateJobProgress(supabase, jobId, fetchedMatches, elapsedMs, newMatchIds.length);
          
          const avgTimePerMatch = elapsedMs / fetchedMatches;
          const etaSeconds = Math.ceil((avgTimePerMatch * (newMatchIds.length - fetchedMatches)) / 1000);
          console.log(`✓ Progress update: ${fetchedMatches}/${newMatchIds.length} (${Math.round((fetchedMatches/newMatchIds.length)*100)}%) - ETA: ${etaSeconds}s`)
        }
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

    // mark job as completed
    await completeJob(supabase, jobId);
    console.log(`Job ${jobId} completed - fetched ${fetchedMatches} matches`)

    return NextResponse.json({
      message: 'Profile updated successfully',
      newMatches: fetchedMatches,
      jobId
    });

  } catch (error: any) {
    console.error('Update profile error:', error);
    
    // mark job as failed if we created one
    if (jobId) {
      const supabase = createAdminClient();
      await failJob(supabase, jobId, error.message || 'unknown error');
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
