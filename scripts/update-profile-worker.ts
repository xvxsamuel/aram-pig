// worker script for GitHub Actions profile updates
// handles large batch updates that would timeout on Vercel

import { createClient } from '@supabase/supabase-js'
import { getMatchById, getMatchTimeline } from '../src/lib/riot/api'
import { calculatePigScoreWithBreakdown } from '../src/lib/scoring'
import { extractAbilityOrder, extractPatch, getPatchFromDate, extractBuildOrder, extractFirstBuy, formatBuildOrder, formatFirstBuy, extractItemPurchases } from '../src/lib/game'
import itemsData from '../src/data/items.json'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

// helper to check if item is a finished item
const _isFinishedItem = (itemId: number): boolean => {
  const item = (itemsData as Record<string, any>)[itemId.toString()]
  if (!item) return false
  const type = item.itemType
  return type === 'legendary' || type === 'boots'
}

// extract skill max order abbreviation
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

async function updateJobProgress(jobId: string, fetchedMatches: number, totalMatches: number) {
  const remainingMatches = totalMatches - fetchedMatches
  const etaSeconds = Math.ceil(remainingMatches * 3) // ~3 sec per match estimate
  
  await supabase
    .from('update_jobs')
    .update({ 
      fetched_matches: fetchedMatches,
      eta_seconds: etaSeconds,
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)
}

async function completeJob(jobId: string) {
  await supabase
    .from('update_jobs')
    .update({
      status: 'completed',
      pending_match_ids: [],
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId)
}

async function failJob(jobId: string, errorMessage: string) {
  await supabase
    .from('update_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId)
}

async function main() {
  const jobId = process.env.JOB_ID
  const puuid = process.env.PUUID
  const region = process.env.REGION
  const matchIdsJson = process.env.MATCH_IDS
  
  if (!jobId || !puuid || !region || !matchIdsJson) {
    console.error('Missing required environment variables')
    process.exit(1)
  }
  
  const matchIds: string[] = JSON.parse(matchIdsJson)
  const startTime = Date.now()
  
  // fetch summoner info for logging
  let summonerName = 'Unknown'
  let summonerTag = ''
  try {
    const { data: summoner } = await supabase
      .from('summoners')
      .select('game_name, tag_line, region')
      .eq('puuid', puuid)
      .single()
    if (summoner) {
      summonerName = summoner.game_name
      summonerTag = summoner.tag_line
    }
  } catch (_e) {
    // ignore - just for logging
  }
  
  console.log(`[Worker] Starting job ${jobId}`)
  console.log(`[Worker] Summoner: ${summonerName}#${summonerTag} (${region})`)
  console.log(`[Worker] Matches to process: ${matchIds.length}`)
  
  // mark job as processing
  await supabase
    .from('update_jobs')
    .update({ status: 'processing' })
    .eq('id', jobId)
  
  try {
    // batch pre-check
    const [existingMatchesResult, existingUserRecordsResult] = await Promise.all([
      supabase
        .from('matches')
        .select('match_id, game_creation, game_duration, patch')
        .in('match_id', matchIds),
      supabase
        .from('summoner_matches')
        .select('match_id')
        .eq('puuid', puuid)
        .in('match_id', matchIds)
    ])
    
    const existingMatchesMap = new Map<string, any>()
    for (const match of existingMatchesResult.data || []) {
      existingMatchesMap.set(match.match_id, match)
    }
    
    const userHasRecord = new Set<string>()
    for (const record of existingUserRecordsResult.data || []) {
      userHasRecord.add(record.match_id)
    }
    
    console.log(`[Worker] Pre-check: ${existingMatchesMap.size} matches in DB, ${userHasRecord.size} user records`)
    
    let fetchedMatches = 0
    
    for (const matchId of matchIds) {
      // skip if user already has record
      if (userHasRecord.has(matchId)) {
        fetchedMatches++
        continue
      }
      
      const existingMatch = existingMatchesMap.get(matchId)
      
      try {
        // fetch match data
        const match = await getMatchById(matchId, region as any, 'batch')
        
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
        const isOlderThan30Days = existingMatch 
          ? existingMatch.game_creation < thirtyDaysAgo
          : match.info.gameCreation < thirtyDaysAgo
        
        // fetch timeline for recent matches
        let timeline = null
        if (!isOlderThan30Days && !existingMatch) {
          try {
            timeline = await getMatchTimeline(matchId, region as any, 'batch')
          } catch (err) {
            console.error(`[Worker] Failed to fetch timeline for ${matchId}:`, err)
          }
        }
        
        // extract patch
        const patchVersion = match.info.gameVersion 
          ? extractPatch(match.info.gameVersion)
          : getPatchFromDate(match.info.gameCreation)
        
        // insert match if new
        if (!existingMatch) {
          await supabase
            .from('matches')
            .upsert({
              match_id: match.metadata.matchId,
              game_creation: match.info.gameCreation,
              game_duration: match.info.gameDuration,
              patch: patchVersion,
            })
        }
        
        // prepare participant records
        const summonerMatchRecords = await Promise.all(
          match.info.participants.map(async (p: any, index: number) => {
            const participantId = index + 1
            const isTrackedUser = p.puuid === puuid
            
            let abilityOrder = null
            let buildOrderStr = null
            let firstBuyStr = null
            let itemPurchases: any[] = []
            
            if (!isOlderThan30Days && timeline) {
              abilityOrder = extractAbilityOrder(timeline, participantId)
              const buildOrder = extractBuildOrder(timeline, participantId)
              const firstBuy = extractFirstBuy(timeline, participantId)
              itemPurchases = extractItemPurchases(timeline, participantId)
              buildOrderStr = buildOrder.length > 0 ? formatBuildOrder(buildOrder) : null
              firstBuyStr = firstBuy.length > 0 ? formatFirstBuy(firstBuy) : null
            }
            
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
                  patch: existingMatch?.patch || patchVersion,
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
                console.error(`[Worker] Failed to calculate PIG score:`, err)
              }
            }
            
            return {
              puuid: p.puuid,
              match_id: matchId,
              champion_name: p.championName,
              riot_id_game_name: p.riotIdGameName || '',
              riot_id_tagline: p.riotIdTagline || '',
              win: p.win,
              game_creation: existingMatch?.game_creation || match.info.gameCreation,
              patch: existingMatch?.patch || patchVersion,
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
                // store ALL items for display; stats filtering happens separately
                items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]
                  .filter((id: number) => id > 0),
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
                pigScore,
                pigScoreBreakdown,
                abilityOrder,
                buildOrder: buildOrderStr,
                firstBuy: firstBuyStr,
                itemPurchases: itemPurchases.length > 0 ? itemPurchases : null
              }
            }
          })
        )
        
        // insert records
        const { error: insertError } = await supabase
          .from('summoner_matches')
          .insert(summonerMatchRecords)
        
        if (insertError && insertError.code !== '23505') {
          console.error(`[Worker] Error inserting records for ${matchId}:`, insertError)
        }
        
        fetchedMatches++
        
        // update progress every 5 matches
        if (fetchedMatches % 5 === 0) {
          await updateJobProgress(jobId, fetchedMatches, matchIds.length)
          console.log(`[Worker] Progress: ${fetchedMatches}/${matchIds.length}`)
        }
        
      } catch (err) {
        console.error(`[Worker] Error processing match ${matchId}:`, err)
        fetchedMatches++
      }
    }
    
    // update summoner last_updated
    await supabase
      .from('summoners')
      .update({ last_updated: new Date().toISOString() })
      .eq('puuid', puuid)
    
    // complete job
    await completeJob(jobId)
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(``)
    console.log(`========================================`)
    console.log(`PROFILE UPDATE COMPLETE`)
    console.log(`========================================`)
    console.log(`Summoner: ${summonerName}#${summonerTag}`)
    console.log(`Region: ${region}`)
    console.log(`Matches processed: ${fetchedMatches}`)
    console.log(`Duration: ${duration}s`)
    console.log(`========================================`)
    
  } catch (error: any) {
    console.error('[Worker] Fatal error:', error)
    await failJob(jobId, error.message || 'unknown error')
    process.exit(1)
  }
}

main()
