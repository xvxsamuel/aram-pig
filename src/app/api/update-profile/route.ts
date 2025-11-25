import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase';
import { getAccountByRiotId, getSummonerByPuuid, getMatchIdsByPuuid, getMatchById, getMatchTimeline} from '../../../lib/riot-api';
import type { RequestType } from '../../../lib/rate-limiter';
import { PLATFORM_TO_REGIONAL, type PlatformCode } from '../../../lib/regions';
import type { UpdateJob } from '../../../types/update-jobs';
import { calculatePigScore } from '../../../lib/pig-score-v2';
import { extractAbilityOrder } from '../../../lib/ability-leveling';
import { extractPatch, getPatchFromDate, isPatchAccepted } from '../../../lib/patch-utils';
import { extractBuildOrder, extractFirstBuy, formatBuildOrder, formatFirstBuy } from '../../../lib/item-purchases';
import { extractItemPurchases, type ItemPurchaseEvent } from '../../../lib/item-purchase-history';
import itemsData from '../../../data/items.json';

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

const RIOT_API_KEY = process.env.RIOT_API_KEY;

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
  // use exponential moving average to smooth out variance
  const avgTimePerMatch = elapsedMs / fetchedMatches;
  const remainingMatches = totalMatches - fetchedMatches;
  
  // add 10% buffer for variance and final processing
  const etaSeconds = Math.ceil((avgTimePerMatch * remainingMatches * 1.1) / 1000);
  
  await supabase
    .from('update_jobs')
    .update({ 
      fetched_matches: fetchedMatches,
      eta_seconds: etaSeconds,
      updated_at: new Date().toISOString() // manually update timestamp to prevent stale job cleanup
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

// check and calculate missing pig scores for recent matches (within 30 days)
async function calculateMissingPigScores(supabase: any, puuid: string) {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
  
  // get recent matches for this user that don't have pig scores
  const { data: recentMatches, error: fetchError } = await supabase
    .from('summoner_matches')
    .select('match_id, puuid, match_data, patch, champion_name')
    .eq('puuid', puuid)
    .order('match_id', { ascending: false })
    .limit(30)
  
  if (fetchError || !recentMatches) {
    console.error('Error fetching recent matches for pig score calculation:', fetchError)
    return 0
  }
  
  // filter to matches within 30 days that are missing pig scores and not remakes
  const matchesNeedingPigScore = recentMatches.filter((m: any) => {
    const hasPigScore = m.match_data?.pigScore !== null && m.match_data?.pigScore !== undefined
    const isRemake = m.match_data?.isRemake === true
    return !hasPigScore && !isRemake
  })
  
  if (matchesNeedingPigScore.length === 0) {
    console.log('All recent matches have pig scores')
    return 0
  }
  
  console.log(`Calculating pig scores for ${matchesNeedingPigScore.length} matches...`)
  
  let calculated = 0
  for (const match of matchesNeedingPigScore) {
    try {
      // get game_creation from matches table to check if within 30 days
      const { data: matchRecord } = await supabase
        .from('matches')
        .select('game_duration, game_creation')
        .eq('match_id', match.match_id)
        .single()
      
      if (!matchRecord || matchRecord.game_creation < thirtyDaysAgo) {
        continue // skip old matches
      }
      
      // calculate pig score
      const pigScore = await calculatePigScore({
        championName: match.champion_name,
        damage_dealt_to_champions: match.match_data.stats?.damage || 0,
        total_damage_dealt: match.match_data.stats?.totalDamageDealt || 0,
        total_heals_on_teammates: match.match_data.stats?.totalHealsOnTeammates || 0,
        total_damage_shielded_on_teammates: match.match_data.stats?.totalDamageShieldedOnTeammates || 0,
        time_ccing_others: match.match_data.stats?.timeCCingOthers || 0,
        game_duration: matchRecord.game_duration || 0,
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
      
      if (pigScore !== null) {
        // update the match_data with pig score
        const updatedMatchData = {
          ...match.match_data,
          pigScore
        }
        
        await supabase
          .from('summoner_matches')
          .update({ match_data: updatedMatchData })
          .eq('match_id', match.match_id)
          .eq('puuid', match.puuid)
        
        calculated++
      }
    } catch (err) {
      console.error(`Failed to calculate pig score for ${match.match_id}:`, err)
    }
  }
  
  console.log(`Calculated ${calculated} pig scores`)
  return calculated
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

    console.log(`Found ${existingMatchIds.size} existing matches for puuid ${accountData.puuid}`)

    // Quick check: fetch just the most recent match ID to see if there are any new matches
    console.log('Quick check: fetching most recent match ID...')
    const quickCheckIds = await fetchMatchIds(region, accountData.puuid, 1, 'overhead');
    
    if (quickCheckIds.length > 0 && existingMatchIds.has(quickCheckIds[0])) {
      console.log('No new matches found (most recent match already in database)')
      
      // still check for missing pig scores before returning
      console.log('Checking for missing pig scores...')
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
    
    console.log('New matches detected, fetching full match history...')
    const matchIds = await fetchMatchIds(region, accountData.puuid, undefined, 'batch');
    
    console.log(`Fetched ${matchIds.length} total match IDs from Riot API`)
    
    const newMatchIds = matchIds.filter((id: string) => !existingMatchIds.has(id));
    console.log(`Found ${newMatchIds.length} new matches to process`)

    // use batch queue for all profile updates
    const requestType: RequestType = 'batch';

    // calculate initial eta based on actual batch queue limits
    // batch queue: 14 req/sec, 70 req/2min -> effective ~0.58 req/sec sustained
    // each match needs 1 api call, plus timeline fetch (if available)
    // timeline is fetched after match data, so roughly 2x the api calls
    const apiCallsNeeded = newMatchIds.length * 2; // match + timeline
    const etaSeconds = Math.ceil(apiCallsNeeded * 1.2); // ~1.2 sec per api call (conservative estimate)

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
  const updateProgressInterval = 3; // update every 3 matches to keep updated_at fresh
  let fetchedMatches = 0;

  try {
    for (const matchId of newMatchIds) {
      try {
        // Check if match already exists in database (from scraper)
        const { data: existingMatch } = await supabase
          .from('matches')
          .select('match_id, game_creation, game_duration, patch')
          .eq('match_id', matchId)
          .maybeSingle()
        
        if (existingMatch) {
          // Match exists! Fetch match data to insert all 10 players (not just user)
          console.log(`Match ${matchId} already in DB, fetching to add participant records...`)
          const match = await fetchMatch(region, matchId, requestType);
          
          // Check if match is older than 30 days for timeline
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          const isOlderThan30Days = existingMatch.game_creation < thirtyDaysAgo;
          
          // Fetch timeline for recent matches
          let timeline = null
          if (!isOlderThan30Days) {
            try {
              timeline = await getMatchTimeline(matchId, region as any, requestType)
            } catch (err) {
              console.log(`  Could not fetch timeline for ${matchId}`)
            }
          }
          
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
              
              // Calculate pig score only for tracked user
              let pigScore = null
              if (isTrackedUser && !isOlderThan30Days && !p.gameEndedInEarlySurrender) {
                try {
                  pigScore = await calculatePigScore({
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
                  })
                } catch (err) {
                  console.error(`  Failed to calculate PIG score:`, err)
                }
              }
              
              return {
                puuid: p.puuid,
                match_id: matchId,
                champion_name: p.championName,
                riot_id_game_name: p.riotIdGameName || '',
                riot_id_tagline: p.riotIdTagline || '',
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                win: p.win,
                game_ended_in_early_surrender: p.gameEndedInEarlySurrender || false,
                damage_dealt_to_champions: p.totalDamageDealtToChampions || 0,
                total_damage_dealt: p.totalDamageDealt || 0,
                time_ccing_others: p.timeCCingOthers || 0,
                total_minions_killed: p.totalMinionsKilled || 0,
                gold_earned: p.goldEarned || 0,
                total_heals_on_teammates: p.totalHealsOnTeammates || 0,
                total_damage_shielded_on_teammates: p.totalDamageShieldedOnTeammates || 0,
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
                pig_score: pigScore,
                game_creation: existingMatch.game_creation,
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
                ability_order: abilityOrder,
                build_order: buildOrderStr,
                first_buy: firstBuyStr,
                item_purchases: itemPurchasesStr,
              }
            })
          )
          
          // Insert all participant records
          const { error: insertError } = await supabase
            .from('summoner_matches')
            .insert(summonerMatchRecords)
          
          if (insertError) {
            if (insertError.code === '23505') {
              console.log(`  Some/all records already exist for match ${matchId}`)
            } else {
              console.error(`  Error inserting participant records:`, insertError)
            }
          } else {
            console.log(`  ✓ Added ${summonerMatchRecords.length} participant records to existing match ${matchId}`)
            
            // Call increment_champion_stats for ALL participants (like scraper does)
            // Only for patches in the accepted list (latest 3 patches)
            if (await isPatchAccepted(existingMatch.patch)) {
              for (let idx = 0; idx < match.info.participants.length; idx++) {
                const participant = match.info.participants[idx]
                const participantId = idx + 1
              
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
                p_patch: existingMatch.patch,
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
              }
              }
            } // end isPatchAccepted check
          }
          
          fetchedMatches++;
          if (fetchedMatches % updateProgressInterval === 0 || fetchedMatches === newMatchIds.length) {
            const elapsedMs = Date.now() - startTime;
            await updateJobProgress(supabase, jobId, fetchedMatches, elapsedMs, newMatchIds.length);
          }
          continue;
        }
        
        // Match doesn't exist, fetch full match data
        console.log(`Fetching new match ${fetchedMatches + 1}/${newMatchIds.length}: ${matchId}`)
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
            console.log(`  Timeline has ${timeline?.info?.frames?.length || 0} frames`)
          } catch (err) {
            console.error(`  Failed to fetch timeline:`, err)
            // continue without timeline - pig score will use final items instead
          }
        } else {
          console.log(`  Skipping timeline fetch for old match (>30 days)`)
        }

        // extract patch version (with API conversion 15.x -> 25.x)
        const patchVersion = match.info.gameVersion 
          ? extractPatch(match.info.gameVersion)
          : getPatchFromDate(match.info.gameCreation)

        const { error: matchError } = await supabase
          .from('matches')
          .upsert({
            match_id: match.metadata.matchId,
            game_creation: match.info.gameCreation,
            game_duration: match.info.gameDuration,
            patch: patchVersion,
          });

        if (matchError) {
          console.error('Match insert error:', matchError);
          continue;
        }

        console.log(`Match ${matchId} stored in matches table, preparing participant records...`)

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

            // only calculate pig score for tracked user in recent matches
            let pigScore = null
            if (isTrackedUser && !isOlderThan30Days && !p.gameEndedInEarlySurrender) {
              try {
                pigScore = await calculatePigScore({
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
                })
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
                
                // filter to only finished items (legendary/boots) for champion stats consistency
                items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
                  .filter(id => id > 0 && isFinishedItem(id)),
                
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
          console.log(`✓ Inserted ${summonerMatchRecords.length} summoner_match records for match ${matchId}`)
          
          // Call increment_champion_stats for ALL participants (like scraper does)
          // Only for patches in the accepted list (latest 3 patches)
          if (await isPatchAccepted(patchVersion)) {
            for (let idx = 0; idx < match.info.participants.length; idx++) {
              const participant = match.info.participants[idx]
              const participantId = idx + 1
            
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

    // calculate any missing pig scores for recent matches before completing
    console.log('Checking for missing pig scores...')
    const pigScoresCalculated = await calculateMissingPigScores(supabase, puuid)
    
    // mark job as completed
    await completeJob(supabase, jobId);
    console.log(`Job ${jobId} completed - fetched ${fetchedMatches} matches, calculated ${pigScoresCalculated} pig scores`)
  } catch (error: any) {
    console.error('Background processing error:', error);
    await failJob(supabase, jobId, error.message || 'unknown error');
  }
}
