import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createAdminClient } from '../../../lib/supabase';
import { getAccountByRiotId, getSummonerByPuuid, getMatchIdsByPuuid, getMatchById, getMatchTimeline} from '../../../lib/riot-api';
import { checkRateLimit, type RequestType } from '../../../lib/rate-limiter';
import type { PlatformCode } from '../../../lib/regions';
import type { UpdateJob } from '../../../types/update-jobs';
import { calculatePigScoreWithBreakdown } from '../../../lib/pig-score-v2';
import { extractAbilityOrder } from '../../../lib/ability-leveling';
import { extractPatch, getPatchFromDate, isPatchAccepted } from '../../../lib/patch-utils';
import { extractBuildOrder, extractFirstBuy, formatBuildOrder, formatFirstBuy } from '../../../lib/item-purchases';
import { extractItemPurchases, type ItemPurchaseEvent } from '../../../lib/item-purchase-history';
import { recalculateProfileStatsForPlayers, getTrackedPlayersFromMatches } from '../../../lib/profile-stats';
import itemsData from '../../../data/items.json';

// in-memory lock to prevent concurrent processing of same profile (handles Strict Mode double-invoke)
const processingLocks = new Map<string, Promise<Response>>()

// helper to check if item is a finished item (legendary or boots)
const isFinishedItem = (itemId: number): boolean => {
  const item = (itemsData as Record<string, any>)[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
}

// helper to extract skill max order abbreviation (e.g., "qwe" for Q>W>E)
function extractSkillOrderAbbreviation(abilityOrder: string): string {
  if (!abilityOrder || abilityOrder.length === 0) return ''
  
  const abilities = abilityOrder.split(' ')
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []
  
  for (const ability of abilities) {
    if (ability in counts) {
      counts[ability as keyof typeof counts]++
      if (ability !== 'R' && counts[ability as keyof typeof counts] === 5) {
        maxOrder.push(ability.toLowerCase())
      }
    }
  }
  
  const result = maxOrder.join('')
  if (result.length === 1) return ''
  if (result.length === 2) {
    const abilitiesList = ['q', 'w', 'e']
    const missing = abilitiesList.find(a => !result.includes(a))
    return missing ? result + missing : result
  }
  return result
}

const _RIOT_API_KEY = process.env.RIOT_API_KEY;

async function fetchMatchIds(region: string, puuid: string, count?: number, requestType: RequestType = 'batch') {
  const allMatchIds: string[] = [];
  const maxPerRequest = 100;
  let start = 0;
  
  while (true) {
    if (count && allMatchIds.length >= count) break;
    
    const batchCount = count ? Math.min(maxPerRequest, count - allMatchIds.length) : maxPerRequest;
    
    const batchIds = await getMatchIdsByPuuid(puuid, region as any, 450, batchCount, start, requestType);
    
    if (batchIds.length === 0) break;
    
    allMatchIds.push(...batchIds);
    
    if (batchIds.length < maxPerRequest) break;
    
    start += maxPerRequest;
  }
  
  return allMatchIds;
}

async function fetchMatch(region: string, matchId: string, requestType: RequestType = 'batch') {
  return await getMatchById(matchId, region as any, requestType);
}

// cleanup stale jobs before starting new one
async function cleanupStaleJobs(supabase: any) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  // cleanup jobs older than 30 minutes (allows for large match histories)
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: 'job timed out after 30 minutes',
      completed_at: new Date().toISOString()
    })
    .in('status', ['pending', 'processing'])
    .lt('started_at', thirtyMinutesAgo);
  
  // cleanup processing jobs with no progress update in 10 minutes (likely orphaned by server restart)
  // this is safe because we update progress every 3 matches (~3-6 seconds)
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: 'job stalled - no progress in 10 minutes (likely server restart)',
      completed_at: new Date().toISOString()
    })
    .eq('status', 'processing')
    .lt('updated_at', tenMinutesAgo);
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

// threshold for direct processing vs GitHub Actions
// ≤40 matches (80 API calls): process in Vercel directly
// >40 matches: trigger GitHub Action (handles large batches without timeout)
const DIRECT_PROCESS_THRESHOLD = 40;

// minimum rate limit buffer to keep for other website users
const RATE_LIMIT_RESERVE = 10;

// create new job with pending matches
async function createJob(supabase: any, puuid: string, matchIds: string[], region: string, etaSeconds: number, useGitHubAction: boolean = false): Promise<string> {
  const { data, error } = await supabase
    .from('update_jobs')
    .insert({
      puuid,
      status: useGitHubAction ? 'pending' : 'processing',
      total_matches: matchIds.length,
      fetched_matches: 0,
      eta_seconds: etaSeconds,
      pending_match_ids: matchIds,
      region: region,
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
    throw new Error(`failed to create job: ${error.message}`);
  }
  
  return data.id;
}

// update job progress with remaining matches
async function updateJobProgress(supabase: any, jobId: string, fetchedMatches: number, elapsedMs: number, totalMatches: number, remainingMatchIds?: string[]) {
  // calculate dynamic eta based on actual fetch time
  const avgTimePerMatch = fetchedMatches > 0 ? elapsedMs / fetchedMatches : 5000;
  const remainingMatches = totalMatches - fetchedMatches;
  
  // add 10% buffer for variance and final processing
  const etaSeconds = Math.ceil((avgTimePerMatch * remainingMatches * 1.1) / 1000);
  
  const updateData: any = { 
    fetched_matches: fetchedMatches,
    eta_seconds: etaSeconds,
    updated_at: new Date().toISOString()
  }
  
  // update remaining matches if provided (for chunked processing)
  if (remainingMatchIds !== undefined) {
    updateData.pending_match_ids = remainingMatchIds
  }
  
  await supabase
    .from('update_jobs')
    .update(updateData)
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

// check and calculate missing pig scores for recent matches (within 30 days)
async function calculateMissingPigScores(supabase: any, puuid: string) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
  
  // get recent matches for this user that don't have pig scores
  // join with matches table to get game_creation and filter old matches upfront
  const { data: recentMatches, error: fetchError } = await supabase
    .from('summoner_matches')
    .select('match_id, puuid, match_data, patch, champion_name, game_creation, matches!inner(game_duration, game_creation)')
    .eq('puuid', puuid)
    .gte('game_creation', thirtyDaysAgo)
    .order('game_creation', { ascending: false })
    .limit(30)
  
  if (fetchError || !recentMatches) {
    console.error('[UpdateProfile] Error fetching recent matches for pig score calculation:', fetchError)
    return 0
  }
  
  // filter to matches that are missing pig scores and not remakes
  const matchesNeedingPigScore = recentMatches.filter((m: any) => {
    const hasPigScore = m.match_data?.pigScore !== null && m.match_data?.pigScore !== undefined
    const isRemake = m.match_data?.isRemake === true
    return !hasPigScore && !isRemake
  })
  
  if (matchesNeedingPigScore.length === 0) {
    console.log('[UpdateProfile] All recent matches have pig scores')
    return 0
  }
  
  console.log(`[UpdateProfile] Calculating pig scores for ${matchesNeedingPigScore.length} matches...`)
  
  let calculated = 0
  let failedCalc = 0
  for (const match of matchesNeedingPigScore) {
    try {
      const gameDuration = match.matches?.game_duration || 0
      
      // calculate pig score with breakdown
      const breakdown = await calculatePigScoreWithBreakdown({
        championName: match.champion_name,
        damage_dealt_to_champions: match.match_data.stats?.damage || 0,
        total_damage_dealt: match.match_data.stats?.totalDamageDealt || 0,
        total_heals_on_teammates: match.match_data.stats?.totalHealsOnTeammates || 0,
        total_damage_shielded_on_teammates: match.match_data.stats?.totalDamageShieldedOnTeammates || 0,
        time_ccing_others: match.match_data.stats?.timeCCingOthers || 0,
        game_duration: gameDuration,
        deaths: match.match_data.deaths || 0,
        item0: match.match_data.items?.[0] || 0,
        item1: match.match_data.items?.[1] || 0,
        item2: match.match_data.items?.[2] || 0,
        item3: match.match_data.items?.[3] || 0,
        item4: match.match_data.items?.[4] || 0,
        item5: match.match_data.items?.[5] || 0,
        perk0: match.match_data.runes?.primary?.perks?.[0] || 0,
        patch: match.patch,
        spell1: match.match_data.spells?.[0] || 0,
        spell2: match.match_data.spells?.[1] || 0,
        skillOrder: extractSkillOrderAbbreviation(match.match_data.abilityOrder || ''),
        buildOrder: match.match_data.buildOrder || undefined
      })
      
      if (breakdown) {
        // update the match_data with pig score and breakdown
        const updatedMatchData = {
          ...match.match_data,
          pigScore: breakdown.finalScore,
          pigScoreBreakdown: breakdown
        }
        
        await supabase
          .from('summoner_matches')
          .update({ match_data: updatedMatchData })
          .eq('match_id', match.match_id)
          .eq('puuid', match.puuid)
        
        calculated++
      } else {
        failedCalc++
        // log first few failures for debugging
        if (failedCalc <= 3) {
          console.log(`[UpdateProfile] Pig score returned null for ${match.champion_name} on patch ${match.patch} (match ${match.match_id})`)
        }
      }
    } catch (err) {
      console.error(`[UpdateProfile] Failed to calculate pig score for ${match.match_id}:`, err)
    }
  }
  
  console.log(`[UpdateProfile] Pig scores: ${calculated} calculated, ${failedCalc} failed (insufficient data)`)
  return calculated
}

export async function POST(request: Request) {
  try {
    const { region, gameName, tagLine, platform } = await request.json();
    
    if (!region || !gameName || !tagLine || !platform) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // check if already processing this profile (handles Strict Mode double-invoke)
    const lockKey = `${region}:${gameName}:${tagLine}`.toLowerCase()
    const existingLock = processingLocks.get(lockKey)
    if (existingLock) {
      console.log(`[UpdateProfile] Already processing ${gameName}#${tagLine}, waiting for result...`)
      return existingLock
    }

    // create processing promise and store it
    const processPromise = processProfileUpdate(region, gameName, tagLine, platform)
    processingLocks.set(lockKey, processPromise)

    try {
      return await processPromise
    } finally {
      processingLocks.delete(lockKey)
    }
  } catch (error) {
    console.error('[UpdateProfile] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processProfileUpdate(region: string, gameName: string, tagLine: string, platform: string): Promise<Response> {
  let jobId: string | null = null;
  try {
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

    // check for 5-minute cooldown
    const { data: existingSummoner } = await supabase
      .from('summoners')
      .select('last_updated')
      .eq('puuid', accountData.puuid)
      .single();

    if (existingSummoner?.last_updated) {
      const lastUpdatedTime = new Date(existingSummoner.last_updated).getTime();
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      
      if (lastUpdatedTime > fiveMinutesAgo) {
        return NextResponse.json({
          message: 'Profile updated recently, please wait',
          recentlyUpdated: true,
          newMatches: 0
        });
      }
    }

    // use platform from request instead of hardcoded map
    const summonerData = await getSummonerByPuuid(accountData.puuid, platform as PlatformCode);
    if (!summonerData) {
      return NextResponse.json({ error: 'Summoner not found' }, { status: 404 });
    }

    // now update summoner data (but don't update last_updated yet - only after processing matches)
    const { error: summonerError } = await supabase
      .from('summoners')
      .upsert({
        puuid: accountData.puuid,
        game_name: accountData.gameName,
        tag_line: accountData.tagLine,
        summoner_level: summonerData.summonerLevel,
        profile_icon_id: summonerData.profileIconId,
        region: platform, // store platform code (euw1, na1) not regional cluster
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

    console.log(`[UpdateProfile] Found ${existingMatchIds.size} existing matches for puuid ${accountData.puuid}`)

    // check if last job failed/interrupted - if so, skip quick check optimization
    // to ensure we properly find any matches that weren't fetched
    const { data: lastJob } = await supabase
      .from('update_jobs')
      .select('status, error_message')
      .eq('puuid', accountData.puuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const lastJobFailed = lastJob?.status === 'failed';
    const shouldSkipQuickCheck = lastJobFailed || existingMatchIds.size === 0;

    if (shouldSkipQuickCheck) {
      console.log(`[UpdateProfile] Skipping quick check optimization (last job failed: ${lastJobFailed}, existing matches: ${existingMatchIds.size})`)
    }

    // Quick check: fetch match IDs and compare against this player's summoner_matches
    // This handles the case where matches exist (from other players) but aren't linked to this player
    // Fetching 100 IDs is 1 API call, so this is efficient
    if (!shouldSkipQuickCheck) {
      console.log('[UpdateProfile] Quick check: fetching recent match IDs...')
      const quickCheckIds = await fetchMatchIds(region, accountData.puuid, 100, 'overhead');
      
      // count how many matches are missing for THIS player (not in summoner_matches)
      const missingForPlayer = quickCheckIds.filter((id: string) => !existingMatchIds.has(id));
      
      if (missingForPlayer.length === 0) {
        console.log('[UpdateProfile] No new matches found (all recent matches already linked to player)')
        
        // still check for missing pig scores before returning
        console.log('[UpdateProfile] Checking for missing pig scores...')
        const pigScoresCalculated = await calculateMissingPigScores(supabase, accountData.puuid)
        
        return NextResponse.json({ 
          success: true, 
          newMatches: 0,
          pigScoresCalculated,
          message: pigScoresCalculated > 0 
            ? `Profile is up to date, calculated ${pigScoresCalculated} pig scores`
            : 'Profile is already up to date'
        });
      }
      
      console.log(`[UpdateProfile] Quick check found ${missingForPlayer.length} matches not linked to player`)
    }
    
    console.log('[UpdateProfile] New matches detected, fetching full match history...')
    const matchIds = await fetchMatchIds(region, accountData.puuid, undefined, 'batch');
    
    console.log(`[UpdateProfile] Fetched ${matchIds.length} total match IDs from Riot API`)
    
    // filter to new matches and deduplicate (safety measure)
    const newMatchIdsRaw = matchIds.filter((id: string) => !existingMatchIds.has(id));
    const newMatchIds = [...new Set(newMatchIdsRaw)];
    
    if (newMatchIdsRaw.length !== newMatchIds.length) {
      console.log(`[UpdateProfile] WARNING: Removed ${newMatchIdsRaw.length - newMatchIds.length} duplicate match IDs from Riot API response`)
    }
    
    console.log(`[UpdateProfile] Found ${newMatchIds.length} new matches to process`)

    // use batch queue for all profile updates
    const requestType: RequestType = 'batch';

    // check rate limit status to decide processing method
    const rateLimitStatus = await checkRateLimit(region);
    
    // calculate required API calls: 2 per match (match data + timeline for recent matches)
    // we already used some calls for match ID fetch, but rate limit should have refreshed or be accounted for
    const requiredApiCalls = newMatchIds.length * 2;
    const availableForProcessing = rateLimitStatus.estimatedRequestsRemaining - RATE_LIMIT_RESERVE;
    const canFitInRateLimit = requiredApiCalls <= availableForProcessing;
    
    // decide: use GitHub Actions if too many matches OR can't fit in rate limit
    let useGitHubAction = newMatchIds.length > DIRECT_PROCESS_THRESHOLD || !canFitInRateLimit;
    
    // single consolidated log for decision
    console.log(`[UpdateProfile] Decision: ${newMatchIds.length} matches (threshold: ${DIRECT_PROCESS_THRESHOLD}), need ~${requiredApiCalls} API calls, have ${availableForProcessing} available (${rateLimitStatus.estimatedRequestsRemaining} - ${RATE_LIMIT_RESERVE} reserve), method: ${useGitHubAction ? 'GitHub Action' : 'Vercel direct'}${!canFitInRateLimit ? ' [RATE LIMIT]' : ''}${newMatchIds.length > DIRECT_PROCESS_THRESHOLD ? ' [TOO MANY MATCHES]' : ''}`)
    
    // calculate ETA based on method
    // Vercel: ~5 sec/match (includes DB latency)
    // GitHub Actions: 15s startup + ~3 sec/match (warmer environment)
    const etaSeconds = useGitHubAction
      ? 15 + Math.ceil(newMatchIds.length * 3)
      : Math.ceil(newMatchIds.length * 5);
    
    // create job
    jobId = await createJob(supabase, accountData.puuid, newMatchIds, region, etaSeconds, useGitHubAction);
    console.log(`[UpdateProfile] Created job ${jobId} for ${newMatchIds.length} matches (method: ${useGitHubAction ? 'GitHub Action' : 'Vercel direct'}, ETA: ${etaSeconds}s)`)

    if (useGitHubAction) {
      // trigger GitHub Action for large batches
      const githubToken = process.env.GITHUB_PAT;
      console.log(`[UpdateProfile] GITHUB_PAT configured: ${!!githubToken}, length: ${githubToken?.length || 0}`)
      if (!githubToken) {
        console.error('[UpdateProfile] GITHUB_PAT not configured, falling back to Vercel direct');
        // fall through to direct processing
        useGitHubAction = false;
      } else {
        try {
          const response = await fetch('https://api.github.com/repos/xvxsamuel/aram-pig/dispatches', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event_type: 'update-profile',
              client_payload: {
                job_id: jobId,
                puuid: accountData.puuid,
                region: region,
                match_ids: JSON.stringify(newMatchIds)
              }
            })
          });
          
          if (response.ok) {
            console.log(`[UpdateProfile] Triggered GitHub Action for job ${jobId}`);
            return NextResponse.json({
              message: 'Update started (processing in background)',
              newMatches: newMatchIds.length,
              jobId,
              method: 'github-action',
              reason: !canFitInRateLimit ? 'rate-limit' : 'too-many-matches',
              rateLimit: rateLimitStatus.estimatedRequestsRemaining,
              required: requiredApiCalls
            });
          } else {
            console.error('[UpdateProfile] Failed to trigger GitHub Action:', await response.text());
            // fall through to direct processing
          }
        } catch (err) {
          console.error('[UpdateProfile] Error triggering GitHub Action:', err);
          // fall through to direct processing
        }
      }
    }

    // direct processing for small batches (or fallback)
    const backgroundWork = processMatchesInBackground(
      supabase,
      jobId,
      newMatchIds,
      region,
      requestType,
      accountData.puuid
    ).catch(err => {
      console.error('[UpdateProfile] Background processing error:', err)
      if (jobId) {
        failJob(supabase, jobId, err.message || 'unknown error')
      }
    })
    
    // waitUntil keeps the function alive until backgroundWork completes
    waitUntil(backgroundWork)

    // return immediately so user sees progress
    return NextResponse.json({
      message: 'Update started',
      newMatches: newMatchIds.length,
      jobId,
      method: 'vercel-direct'
    });

  } catch (error: any) {
    console.error('[UpdateProfile] Error:', error);
    
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
// processes up to CHUNK_SIZE matches, saves remaining for continuation
async function processMatchesInBackground(
  supabase: any,
  jobId: string,
  newMatchIds: string[],
  region: string,
  requestType: RequestType,
  puuid: string
) {
  // process all matches directly (for small batches ≤20)
  // large batches go to GitHub Actions instead
  const matchesToProcess = newMatchIds
  
  console.log(`[UpdateProfile] processMatchesInBackground started for job ${jobId}: processing ${matchesToProcess.length} matches`)
  
  const startTime = Date.now();
  const updateProgressInterval = 3;
  let fetchedMatches = 0;
  const processedMatches = new Set<string>();

  try {
    // BATCH PRE-CHECK: fetch existing matches and user records
    const batchStart = Date.now()
    const [existingMatchesResult, existingUserRecordsResult] = await Promise.all([
      supabase
        .from('matches')
        .select('match_id, game_creation, game_duration, patch')
        .in('match_id', matchesToProcess),
      supabase
        .from('summoner_matches')
        .select('match_id')
        .eq('puuid', puuid)
        .in('match_id', matchesToProcess)
    ])
    
    const batchTime = Date.now() - batchStart
    
    // build lookup maps
    const existingMatchesMap = new Map<string, any>()
    for (const match of existingMatchesResult.data || []) {
      existingMatchesMap.set(match.match_id, match)
    }
    
    const userHasRecord = new Set<string>()
    for (const record of existingUserRecordsResult.data || []) {
      userHasRecord.add(record.match_id)
    }
    
    console.log(`[UpdateProfile] Batch pre-check: ${existingMatchesMap.size} matches in DB, ${userHasRecord.size} user records (${batchTime}ms)`)
    
    for (const matchId of matchesToProcess) {
      // safety check for duplicate processing
      if (processedMatches.has(matchId)) {
        console.log(`[UpdateProfile] WARNING: Match ${matchId} already processed in this batch, skipping duplicate`)
        continue
      }
      processedMatches.add(matchId)
      
      try {
        const timings: Record<string, number> = {}
        let t0 = Date.now()
        
        // use pre-fetched data instead of per-match queries
        const existingMatch = existingMatchesMap.get(matchId)
        const existingUserRecord = userHasRecord.has(matchId)
        
        if (existingMatch) {
          if (existingUserRecord) {
            // User already has this match, skip entirely (no API call needed)
            fetchedMatches++
            continue
          }
          
          // Match exists but user doesn't have a record - need to fetch from API
          t0 = Date.now()
          const match = await fetchMatch(region, matchId, requestType);
          timings.fetchMatch = Date.now() - t0
          
          console.log(`[UpdateProfile] Match ${matchId} fetched (api: ${timings.fetchMatch}ms)`)
          
          // Skip timeline for matches that already exist - saves an API call
          // User gets the match without detailed build order, which is acceptable
          const timeline = null
          const isOlderThan30Days = existingMatch.game_creation < (Date.now() - 30 * 24 * 60 * 60 * 1000)
          
          // Prepare records for ALL participants (same as new match logic)
          const summonerMatchRecords = await Promise.all(
            match.info.participants.map(async (p: any, index: number) => {
              const participantId = index + 1
              const isTrackedUser = p.puuid === puuid
              
              // Extract timeline data for ALL players
              let abilityOrder = null
              let buildOrderStr = null
              let firstBuyStr = null
              let itemPurchasesStr = null
              
              if (!isOlderThan30Days && timeline) {
                abilityOrder = extractAbilityOrder(timeline, participantId)
                const buildOrder = extractBuildOrder(timeline, participantId)
                const firstBuy = extractFirstBuy(timeline, participantId)
                const itemPurchases = extractItemPurchases(timeline, participantId)
                buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
                firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
                itemPurchasesStr = itemPurchases.length > 0 ? JSON.stringify(itemPurchases) : null
              }
              
              // Calculate pig score with breakdown for tracked user
              let pigScore = null
              let pigScoreBreakdown = null
              if (isTrackedUser && !isOlderThan30Days && !p.gameEndedInEarlySurrender) {
                try {
                  const breakdown = await calculatePigScoreWithBreakdown({
                    championName: p.championName,
                    damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
                    total_damage_dealt: p.totalDamageDealt || 0,
                    total_heals_on_teammates: p.totalHealsOnTeammates || 0,
                    total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
                    time_ccing_others: p.timeCCingOthers || 0,
                    game_duration: match.info.gameDuration || 0,
                    deaths: p.deaths,
                    item0: p.item0 || 0,
                    item1: p.item1,
                    item2: p.item2,
                    item3: p.item3,
                    item4: p.item4,
                    item5: p.item5,
                    perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
                    patch: existingMatch.patch,
                    spell1: p.summoner1Id || 0,
                    spell2: p.summoner2Id || 0,
                    skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
                    buildOrder: buildOrderStr || undefined
                  })
                  if (breakdown) {
                    pigScore = breakdown.finalScore
                    pigScoreBreakdown = breakdown
                  }
                } catch (err) {
                  console.error(`[UpdateProfile] Failed to calculate PIG score:`, err)
                }
              }
              
              // parse item purchases from JSON string
              const itemPurchases = itemPurchasesStr ? JSON.parse(itemPurchasesStr) : null
              
              return {
                puuid: p.puuid,
                match_id: matchId,
                champion_name: p.championName,
                riot_id_game_name: p.riotIdGameName || '',
                riot_id_tagline: p.riotIdTagline || '',
                win: p.win,
                game_creation: existingMatch.game_creation,
                patch: existingMatch.patch,
                match_data: {
                  kills: p.kills,
                  deaths: p.deaths,
                  assists: p.assists,
                  level: p.champLevel || 0,
                  teamId: p.teamId || 0,
                  isRemake: p.gameEndedInEarlySurrender || false,
                  
                  stats: {
                    damage: p.totalDamageDealtToChampions || 0,
                    gold: p.goldEarned || 0,
                    cs: p.totalMinionsKilled || 0,
                    doubleKills: p.doubleKills || 0,
                    tripleKills: p.tripleKills || 0,
                    quadraKills: p.quadraKills || 0,
                    pentaKills: p.pentaKills || 0,
                    totalDamageDealt: p.totalDamageDealt || 0,
                    timeCCingOthers: p.timeCCingOthers || 0,
                    totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
                    totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0
                  },
                  
                  // store all items for display (filtering happens at stats aggregation time)
                  items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
                    .filter(id => id > 0),
                  
                  spells: [p.summoner1Id || 0, p.summoner2Id || 0],
                  
                  runes: {
                    primary: {
                      style: p.perks?.styles?.[0]?.style || 0,
                      perks: [
                        p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
                        p.perks?.styles?.[0]?.selections?.[1]?.perk || 0,
                        p.perks?.styles?.[0]?.selections?.[2]?.perk || 0,
                        p.perks?.styles?.[0]?.selections?.[3]?.perk || 0
                      ]
                    },
                    secondary: {
                      style: p.perks?.styles?.[1]?.style || 0,
                      perks: [
                        p.perks?.styles?.[1]?.selections?.[0]?.perk || 0,
                        p.perks?.styles?.[1]?.selections?.[1]?.perk || 0
                      ]
                    },
                    statPerks: [
                      p.perks?.statPerks?.offense || 0,
                      p.perks?.statPerks?.flex || 0,
                      p.perks?.statPerks?.defense || 0
                    ]
                  },
                  
                  pigScore: pigScore,
                  pigScoreBreakdown: pigScoreBreakdown,
                  abilityOrder: abilityOrder,
                  buildOrder: buildOrderStr,
                  firstBuy: firstBuyStr,
                  itemPurchases: itemPurchases
                }
              }
            })
          )
          
          // Insert all participant records
          const { error: insertError } = await supabase
            .from('summoner_matches')
            .insert(summonerMatchRecords)
          
          if (insertError) {
            if (insertError.code === '23505') {
              console.log(`[UpdateProfile] Some/all records already exist for match ${matchId}`)
            } else {
              console.error(`[UpdateProfile] Error inserting participant records:`, insertError)
            }
          } else {
            console.log(`[UpdateProfile] Added ${summonerMatchRecords.length} participant records to existing match ${matchId}`)
            // NOTE: Do NOT increment champion_stats here!
            // Stats were already counted when the match was first stored (by scraper or another user's profile update)
            // Only new matches (not in matches table) should increment stats
          }
          
          fetchedMatches++;
          if (fetchedMatches % updateProgressInterval === 0 || fetchedMatches === newMatchIds.length) {
            const elapsedMs = Date.now() - startTime;
            await updateJobProgress(supabase, jobId, fetchedMatches, elapsedMs, newMatchIds.length);
          }
          continue;
        }
        
        // Match doesn't exist, fetch full match data
        t0 = Date.now()
        const match = await fetchMatch(region, matchId, requestType);
        timings.fetchMatch = Date.now() - t0

        // check if match is older than 30 days - if so, skip timeline fetch and pig score calculation
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const matchDate = match.info.gameCreation;
        const isOlderThan30Days = matchDate < thirtyDaysAgo;

        // fetch timeline for recent matches to get accurate item purchase order
        let timeline = null
        if (!isOlderThan30Days) {
          try {
            t0 = Date.now()
            timeline = await getMatchTimeline(matchId, region as any, requestType)
            timings.fetchTimeline = Date.now() - t0
            console.log(`[UpdateProfile] Match ${matchId} new (api: ${timings.fetchMatch}ms, timeline: ${timings.fetchTimeline}ms)`)
          } catch (err) {
            console.error(`[UpdateProfile] Failed to fetch timeline:`, err)
            // continue without timeline - pig score will use final items instead
          }
        } else {
          console.log(`[UpdateProfile] Match ${matchId} new+old (api: ${timings.fetchMatch}ms, no timeline)`)
        }

        // extract patch version (with API conversion 15.x -> 25.x)
        const patchVersion = match.info.gameVersion 
          ? extractPatch(match.info.gameVersion)
          : getPatchFromDate(match.info.gameCreation)

        t0 = Date.now()
        const { error: matchError } = await supabase
          .from('matches')
          .upsert({
            match_id: match.metadata.matchId,
            game_creation: match.info.gameCreation,
            game_duration: match.info.gameDuration,
            patch: patchVersion,
          });

        if (matchError) {
          console.error('[UpdateProfile] Match insert error:', matchError);
          continue;
        }

        console.log(`[UpdateProfile] Match ${matchId} stored in matches table, preparing participant records...`)

        try {
          // prepare summoner match records (only calculate PIG for tracked user, lazy load for others)
          const summonerMatchRecords = await Promise.all(
            match.info.participants.map(async (p: any, index: number) => {
            const participantId = index + 1 // participant IDs are 1-indexed
            const isTrackedUser = p.puuid === puuid // only the user being updated
            
            // extract timeline data for ALL players in recent matches (like scraper does)
            let abilityOrder = null
            let buildOrderStr = null
            let firstBuyStr = null
            let itemPurchases: ItemPurchaseEvent[] = []
            
            if (!isOlderThan30Days && timeline) {
              abilityOrder = extractAbilityOrder(timeline, participantId)
              const buildOrder = extractBuildOrder(timeline, participantId)
              const firstBuy = extractFirstBuy(timeline, participantId)
              itemPurchases = extractItemPurchases(timeline, participantId)
              buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
              firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
              
              if (isTrackedUser) {
                console.log(`    ${p.championName} (tracked, P${participantId}): build_order=${buildOrderStr || 'NULL'}, first_buy=${firstBuyStr || 'NULL'}`)
              }
            }

            // calculate pig score with breakdown for tracked user in recent matches
            let pigScore = null
            let pigScoreBreakdown = null
            if (isTrackedUser && !isOlderThan30Days && !p.gameEndedInEarlySurrender) {
              try {
                const breakdown = await calculatePigScoreWithBreakdown({
                  championName: p.championName,
                  damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
                  total_damage_dealt: p.totalDamageDealt || 0,
                  total_heals_on_teammates: p.totalHealsOnTeammates || 0,
                  total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
                  time_ccing_others: p.timeCCingOthers || 0,
                  game_duration: match.info.gameDuration || 0,
                  deaths: p.deaths,
                  item0: p.item0 || 0,
                  item1: p.item1,
                  item2: p.item2,
                  item3: p.item3,
                  item4: p.item4,
                  item5: p.item5,
                  perk0: p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
                  patch: patchVersion,
                  spell1: p.summoner1Id || 0,
                  spell2: p.summoner2Id || 0,
                  skillOrder: abilityOrder ? extractSkillOrderAbbreviation(abilityOrder) : undefined,
                  buildOrder: buildOrderStr || undefined
                })
                if (breakdown) {
                  pigScore = breakdown.finalScore
                  pigScoreBreakdown = breakdown
                }
              } catch (err) {
                console.error(`  Failed to calculate PIG score:`, err)
                pigScore = null
              }
            }

            return {
              puuid: p.puuid,
              match_id: match.metadata.matchId,
              champion_name: p.championName,
              riot_id_game_name: p.riotIdGameName || '',
              riot_id_tagline: p.riotIdTagline || '',
              win: p.win,
              game_creation: match.info.gameCreation,
              patch: patchVersion,
              match_data: {
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                level: p.champLevel || 0,
                teamId: p.teamId || 0,
                isRemake: p.gameEndedInEarlySurrender || false,
                
                stats: {
                  damage: p.totalDamageDealtToChampions || 0,
                  gold: p.goldEarned || 0,
                  cs: p.totalMinionsKilled || 0,
                  doubleKills: p.doubleKills || 0,
                  tripleKills: p.tripleKills || 0,
                  quadraKills: p.quadraKills || 0,
                  pentaKills: p.pentaKills || 0,
                  totalDamageDealt: p.totalDamageDealt || 0,
                  timeCCingOthers: p.timeCCingOthers || 0,
                  totalHealsOnTeammates: p.totalHealsOnTeammates || 0,
                  totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates || 0
                },
                
                // store all items for display (filtering happens at stats aggregation time)
                items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
                  .filter(id => id > 0),
                
                spells: [p.summoner1Id || 0, p.summoner2Id || 0],
                
                runes: {
                  primary: {
                    style: p.perks?.styles?.[0]?.style || 0,
                    perks: [
                      p.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
                      p.perks?.styles?.[0]?.selections?.[1]?.perk || 0,
                      p.perks?.styles?.[0]?.selections?.[2]?.perk || 0,
                      p.perks?.styles?.[0]?.selections?.[3]?.perk || 0
                    ]
                  },
                  secondary: {
                    style: p.perks?.styles?.[1]?.style || 0,
                    perks: [
                      p.perks?.styles?.[1]?.selections?.[0]?.perk || 0,
                      p.perks?.styles?.[1]?.selections?.[1]?.perk || 0
                    ]
                  },
                  statPerks: [
                    p.perks?.statPerks?.offense || 0,
                    p.perks?.statPerks?.flex || 0,
                    p.perks?.statPerks?.defense || 0
                  ]
                },
                
                pigScore: pigScore,
                pigScoreBreakdown: pigScoreBreakdown,
                abilityOrder: abilityOrder,
                buildOrder: buildOrderStr,
                firstBuy: firstBuyStr,
                itemPurchases: itemPurchases.length > 0 ? itemPurchases : null
              }
            }
          })
        )

        console.log(`Attempting to insert ${summonerMatchRecords.length} records into summoner_matches for match ${matchId}`)
        console.log(`  First record puuid: ${summonerMatchRecords[0]?.puuid.substring(0, 30)}...`)
        const { error: junctionError } = await supabase
          .from('summoner_matches')
          .insert(summonerMatchRecords)

        if (junctionError) {
          // Ignore duplicate key errors (match already processed for this user)
          if (junctionError.code === '23505') {
            console.log(`  Match ${matchId} already exists in summoner_matches, skipping`)
          } else {
            console.error('Junction table insert error:', junctionError);
          }
        } else {
          console.log(`Inserted ${summonerMatchRecords.length} summoner_match records for match ${matchId}`)
          
          // Only increment champion_stats for the TRACKED USER on new matches
          // Other players' stats will be updated when they view the match details (on-demand)
          // This prevents incomplete data (no timeline) from polluting stats
          // Skip remakes - they have very short durations and skew the data
          const isRemake = match.info.participants.some((p: any) => p.gameEndedInEarlySurrender)
          if (await isPatchAccepted(patchVersion) && !isRemake) {
            // Find the tracked user's participant
            const trackedUserIdx = match.info.participants.findIndex((p: any) => p.puuid === puuid)
            if (trackedUserIdx !== -1) {
              const participant = match.info.participants[trackedUserIdx]
              const participantId = trackedUserIdx + 1
            
              // Extract timeline data for stats
              let abilityOrderStr = null
              let buildOrderForStats: number[] = []
              let firstBuyForStats = ''
            
              if (!isOlderThan30Days && timeline) {
                abilityOrderStr = extractAbilityOrder(timeline, participantId)
                const buildOrder = extractBuildOrder(timeline, participantId)
                const firstBuy = extractFirstBuy(timeline, participantId)
                buildOrderForStats = buildOrder.filter(id => isFinishedItem(id)).slice(0, 6)
                firstBuyForStats = (firstBuy.length > 0 ? formatFirstBuy(firstBuy) : '') ?? ''
              }
            
              const skillOrder = abilityOrderStr ? extractSkillOrderAbbreviation(abilityOrderStr) : ''
            
              // Get items - use build order if available, otherwise filter final items to finished only
              const itemsForStats = buildOrderForStats.length > 0 
                ? buildOrderForStats
                : [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5]
                    .filter(id => id > 0 && isFinishedItem(id))
            
              const runes = {
                primary: { style: participant.perks?.styles?.[0]?.style || 0, perks: participant.perks?.styles?.[0]?.selections?.map((s: any) => s.perk) || [0,0,0,0] },
                secondary: { style: participant.perks?.styles?.[1]?.style || 0, perks: participant.perks?.styles?.[1]?.selections?.map((s: any) => s.perk) || [0,0] },
                statPerks: [participant.perks?.statPerks?.offense || 0, participant.perks?.statPerks?.flex || 0, participant.perks?.statPerks?.defense || 0]
              }
            
              const { error: statsError } = await supabase.rpc('increment_champion_stats', {
                p_champion_name: participant.championName,
                p_patch: patchVersion,
                p_win: participant.win ? 1 : 0,
                p_items: JSON.stringify(itemsForStats),
                p_first_buy: firstBuyForStats,
                p_keystone_id: runes.primary.perks[0] || 0,
                p_rune1: runes.primary.perks[1] || 0,
                p_rune2: runes.primary.perks[2] || 0,
                p_rune3: runes.primary.perks[3] || 0,
                p_rune4: runes.secondary.perks[0] || 0,
                p_rune5: runes.secondary.perks[1] || 0,
                p_rune_tree_primary: runes.primary.style,
                p_rune_tree_secondary: runes.secondary.style,
                p_stat_perk0: runes.statPerks[0],
                p_stat_perk1: runes.statPerks[1],
                p_stat_perk2: runes.statPerks[2],
                p_spell1_id: participant.summoner1Id || 0,
                p_spell2_id: participant.summoner2Id || 0,
                p_skill_order: skillOrder,
                p_damage_to_champions: participant.totalDamageDealtToChampions || 0,
                p_total_damage: participant.totalDamageDealt || 0,
                p_healing: participant.totalHealsOnTeammates || 0,
                p_shielding: participant.totalDamageShieldedOnTeammates || 0,
                p_cc_time: participant.timeCCingOthers || 0,
                p_game_duration: match.info.gameDuration || 0,
                p_deaths: participant.deaths || 0
              })
            
              if (statsError) {
                console.error(`  Error updating champion stats for ${participant.championName}:`, statsError)
              } else {
                console.log(`  Updated champion stats for tracked user: ${participant.championName}`)
              }
            }
          } // end isPatchAccepted check
        }
        
        } catch (recordError) {
          console.error(`Failed to prepare/insert summoner_match records for ${matchId}:`, recordError)
          continue;
        }

        fetchedMatches++;        // update progress every N matches
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

    // all matches processed (small batch), calculate pig scores and complete
    console.log('[UpdateProfile] Checking for missing pig scores...')
    const pigScoresCalculated = await calculateMissingPigScores(supabase, puuid)
    
    // recalculate profile champion stats for the updating player and all other tracked players in the matches
    console.log('[UpdateProfile] Recalculating profile champion stats...')
    
    // collect all participant PUUIDs from processed matches
    const allParticipantPuuids: string[] = []
    for (const matchId of processedMatches) {
      // fetch participant PUUIDs from summoner_matches for this match
      const { data: participants } = await supabase
        .from('summoner_matches')
        .select('puuid')
        .eq('match_id', matchId)
      
      if (participants) {
        allParticipantPuuids.push(...participants.map((p: { puuid: string }) => p.puuid))
      }
    }
    
    // find which of these are tracked players (exist in summoners table)
    const trackedPlayers = await getTrackedPlayersFromMatches(allParticipantPuuids)
    
    // always include the updating player
    if (!trackedPlayers.includes(puuid)) {
      trackedPlayers.push(puuid)
    }
    
    // recalculate stats for all tracked players
    await recalculateProfileStatsForPlayers(trackedPlayers)
    
    // mark job as completed
    await completeJob(supabase, jobId);
    console.log(`[UpdateProfile] Job ${jobId} completed - fetched ${fetchedMatches} matches, calculated ${pigScoresCalculated} pig scores, updated ${trackedPlayers.length} player profiles`)
  } catch (error: any) {
    console.error('[UpdateProfile] Background processing error:', error);
    await failJob(supabase, jobId, error.message || 'unknown error');
  }
}
