import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase';
import { getAccountByRiotId, getSummonerByPuuid, getMatchIdsByPuuid, getMatchById, getMatchTimeline, extractItemPurchases } from '../../../lib/riot-api';
import type { RequestType } from '../../../lib/rate-limiter';
import { PLATFORM_TO_REGIONAL, type PlatformCode } from '../../../lib/regions';
import type { UpdateJob } from '../../../types/update-jobs';
import { calculatePigScore } from '../../../lib/pig-score';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

async function fetchMatchIds(region: string, puuid: string, count?: number, requestType: RequestType = 'priority') {
  const allMatchIds: string[] = [];
  const maxPerRequest = 100;
  let start = 0;
  
  while (true) {
    if (count && allMatchIds.length >= count) break;
    
    const batchCount = count ? Math.min(maxPerRequest, count - allMatchIds.length) : maxPerRequest;
    
    // use appropriate request type based on queue
    const batchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchCount, start, requestType);
    
    if (batchIds.length === 0) break;
    
    allMatchIds.push(...batchIds);
    
    if (batchIds.length < maxPerRequest) break;
    
    start += maxPerRequest;
  }
  
  return allMatchIds;
}

async function fetchMatch(region: string, matchId: string, requestType: RequestType = 'priority') {
  // use appropriate request type based on queue
  return await getMatchById(matchId, region as any, requestType);
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

    console.log(`Found ${existingMatchIds.size} existing matches for puuid ${accountData.puuid}`)

    // only fetch from riot api if we have existing matches (to compare)
    // for new profiles, we need to fetch anyway
    const hasExistingMatches = existingMatchIds.size > 0;

    const matchIds = await fetchMatchIds(region, accountData.puuid);
    console.log(`Fetched ${matchIds.length} total match IDs from Riot API`)
    
    const newMatchIds = matchIds.filter((id: string) => !existingMatchIds.has(id));
    console.log(`Found ${newMatchIds.length} new matches to process`)

    if (newMatchIds.length === 0 && hasExistingMatches) {
      // update last_updated timestamp
      await supabase
        .from('summoners')
        .update({ last_updated: new Date().toISOString() })
        .eq('puuid', accountData.puuid);
        
      console.log('No new matches found - profile is up to date')
      return NextResponse.json({
        message: 'Profile is up to date',
        newMatches: 0,
      });
    }

    // determine request type based on match count
    // <= 10 matches = priority queue (fast lane for small updates)
    // > 10 matches = batch queue (bulk fetching with majority of capacity)
    const requestType: RequestType = newMatchIds.length <= 10 ? 'priority' : 'batch';

    // calculate initial eta (rough estimate)
    const apiCallsNeeded = newMatchIds.length + Math.ceil(newMatchIds.length / 100);
    const etaSeconds = Math.ceil(apiCallsNeeded / 15);

    // create job
    jobId = await createJob(supabase, accountData.puuid, newMatchIds.length, etaSeconds);
    console.log(`Created job ${jobId} for ${newMatchIds.length} matches (type: ${requestType})`)

    // start processing matches asynchronously (don't await)
    processMatchesInBackground(
      supabase,
      jobId,
      newMatchIds,
      region,
      requestType,
      accountData.puuid
    ).catch(err => {
      console.error('Background processing error:', err)
      if (jobId) {
        failJob(supabase, jobId, err.message || 'unknown error')
      }
    })

    // return immediately so user sees progress
    return NextResponse.json({
      message: 'Update started',
      newMatches: newMatchIds.length,
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

// process matches in background after response is sent
async function processMatchesInBackground(
  supabase: any,
  jobId: string,
  newMatchIds: string[],
  region: string,
  requestType: RequestType,
  puuid: string
) {
  const startTime = Date.now();
  const updateProgressInterval = 5;
  let fetchedMatches = 0;

  try {
    for (const matchId of newMatchIds) {
      try {
        console.log(`Fetching match ${fetchedMatches + 1}/${newMatchIds.length}: ${matchId}`)
        const match = await fetchMatch(region, matchId, requestType);

        // check if match is older than 30 days - if so, skip timeline fetch and pig score calculation
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const matchDate = match.info.gameCreation;
        const isOlderThan30Days = matchDate < thirtyDaysAgo;

        // fetch timeline for recent matches to get accurate item purchase order
        let timeline = null
        if (!isOlderThan30Days) {
          try {
            timeline = await getMatchTimeline(matchId, region as any, requestType)
            console.log(`  Fetched timeline for match ${fetchedMatches + 1}`)
          } catch (err) {
            console.error(`  Failed to fetch timeline:`, err)
            // continue without timeline - pig score will use final items instead
          }
        } else {
          console.log(`  Skipping timeline fetch for old match (>30 days)`)
        }

        const { error: matchError } = await supabase
          .from('matches')
          .upsert({
            match_id: match.metadata.matchId,
            game_creation: match.info.gameCreation,
            game_duration: match.info.gameDuration,
          });

        if (matchError) {
          console.error('Match insert error:', matchError);
          continue;
        }

        // cache all participants with their riot ids for faster lookups
        const participantData = match.info.participants.map((p: any) => ({
          puuid: p.puuid,
          game_name: p.riotIdGameName || null,
          tag_line: p.riotIdTagLine || null,
          summoner_level: p.summonerLevel || null,
          profile_icon_id: p.profileIcon || null,
        }));
        
        const { error: summonersError } = await supabase
          .from('summoners')
          .upsert(participantData, { 
            onConflict: 'puuid',
            ignoreDuplicates: false // update cache fields if we have newer data
          });

        if (summonersError) {
          console.error('Summoners insert error:', summonersError);
        }

        // prepare summoner match records with pig scores
        const summonerMatchRecords = await Promise.all(
          match.info.participants.map(async (p: any, index: number) => {
            // extract item purchases from timeline if available
            let firstItem, secondItem, thirdItem
            if (timeline) {
              const participantId = index + 1 // riot api uses 1-indexed participant ids
              const purchases = extractItemPurchases(timeline, participantId)
              firstItem = purchases[0]
              secondItem = purchases[1]
              thirdItem = purchases[2]
            }

            // calculate pig score
            let pigScore
            try {
              // skip pig score calculation for remakes
              if (p.gameEndedInEarlySurrender) {
                pigScore = null
              } else {
                pigScore = await calculatePigScore(p, match, firstItem, secondItem, thirdItem)
                console.log(`  PIG score for ${p.championName}: ${pigScore}`)
              }
            } catch (err) {
              console.error(`  Failed to calculate PIG score:`, err)
              pigScore = null
            }

            return {
              puuid: p.puuid,
              match_id: match.metadata.matchId,
              champion_name: p.championName,
              summoner_name: p.summonerName || '',
              riot_id_game_name: p.riotIdGameName || '',
              riot_id_tagline: p.riotIdTagline || '',
              kills: p.kills,
              deaths: p.deaths,
              assists: p.assists,
              win: p.win,
              game_ended_in_early_surrender: p.gameEndedInEarlySurrender || false,
              damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
              damage_dealt_total: p.totalDamageDealt || 0,
              damage_dealt_to_objectives: p.damageDealtToObjectives || 0,
              damage_taken: p.totalDamageTaken || 0,
              game_duration: match.info.gameDuration || 0,
              time_ccing_others: p.timeCCingOthers || 0,
              total_time_spent_dead: p.totalTimeSpentDead || 0,
              total_minions_killed: p.totalMinionsKilled || 0,
              gold_earned: p.goldEarned || 0,
              damage_per_minute: p.challenges?.damagePerMinute || 
                (match.info.gameDuration > 0 ? ((p.totalDamageDealtToChampions || 0) / match.info.gameDuration) * 60 : 0),
              total_heals_on_teammates: p.totalHealsOnTeammates || 0,
              total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
              total_time_cc_dealt: p.totalTimeCCDealt || 0,
              double_kills: p.doubleKills || 0,
              triple_kills: p.tripleKills || 0,
              quadra_kills: p.quadraKills || 0,
              penta_kills: p.pentaKills || 0,
              item0: p.item0 || 0,
              item1: p.item1 || 0,
              item2: p.item2 || 0,
              item3: p.item3 || 0,
              item4: p.item4 || 0,
              item5: p.item5 || 0,
              first_item: firstItem || null,
              second_item: secondItem || null,
              third_item: thirdItem || null,
              pig_score: pigScore,
              champ_level: p.champLevel || 0,
              team_id: p.teamId || 0,
              summoner1_id: p.summoner1Id || 0,
              summoner2_id: p.summoner2Id || 0,
              perk_primary_style: p.perks?.styles?.[0]?.style || 0,
              perk_sub_style: p.perks?.styles?.[1]?.style || 0,
              perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
              perk1: p.perks?.styles?.[0]?.selections?.[1]?.perk || 0,
              perk2: p.perks?.styles?.[0]?.selections?.[2]?.perk || 0,
              perk3: p.perks?.styles?.[0]?.selections?.[3]?.perk || 0,
              perk4: p.perks?.styles?.[1]?.selections?.[0]?.perk || 0,
              perk5: p.perks?.styles?.[1]?.selections?.[1]?.perk || 0,
              stat_perk0: p.perks?.statPerks?.offense || 0,
              stat_perk1: p.perks?.statPerks?.flex || 0,
              stat_perk2: p.perks?.statPerks?.defense || 0,
            }
          })
        )

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
          console.log(`Progress update: ${fetchedMatches}/${newMatchIds.length} (${Math.round((fetchedMatches/newMatchIds.length)*100)}%)`)
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
      .eq('puuid', puuid);

    // clear pig scores for matches older than 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const { data: oldMatches } = await supabase
      .from('matches')
      .select('match_id')
      .lt('game_creation', thirtyDaysAgo);
    
    if (oldMatches && oldMatches.length > 0) {
      const oldMatchIds = oldMatches.map((m: any) => m.match_id);
      const { error: clearError } = await supabase
        .from('summoner_matches')
        .update({ 
          pig_score: null,
          first_item: null,
          second_item: null,
          third_item: null
        })
        .eq('puuid', puuid)
        .in('match_id', oldMatchIds);
      
      if (!clearError) {
        console.log(`Cleared PIG scores for ${oldMatches.length} old matches (>30 days)`);
      } else {
        console.error('Error clearing old PIG scores:', clearError);
      }
    }

    // mark job as completed
    await completeJob(supabase, jobId);
    console.log(`Job ${jobId} completed - fetched ${fetchedMatches} matches`)
  } catch (error: any) {
    console.error('Background processing error:', error);
    await failJob(supabase, jobId, error.message || 'unknown error');
  }
}
