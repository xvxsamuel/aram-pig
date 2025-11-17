// shared utility for storing match data to database
import { createAdminClient } from './supabase'
import type { MatchData, RegionalCluster } from './riot-api'
import { getMatchTimeline } from './riot-api'
import { extractAbilityOrder } from './ability-leveling'
import { calculatePigScore } from './pig-score-v2'
import { extractPatch, getPatchFromDate } from './patch-utils'

export async function storeMatchData(
  matchData: MatchData,
  region?: RegionalCluster,
  source: 'user' | 'scraper' = 'scraper'
): Promise<boolean> {
  const supabase = createAdminClient()
  
  try {
    // extract patch version (fallback to date-based if gameVersion not available)
    const patchVersion = matchData.info.gameVersion 
      ? extractPatch(matchData.info.gameVersion)
      : getPatchFromDate(matchData.info.gameCreation)

    // check if match already exists
    const { data: existingMatch, error: checkError } = await supabase
      .from('matches')
      .select('match_id')
      .eq('match_id', matchData.metadata.matchId)
      .maybeSingle()

    if (existingMatch) {
      // match already exists, skip silently
      return false
    }

    // store match metadata
    const { error: matchError } = await supabase
      .from('matches')
      .insert({
        match_id: matchData.metadata.matchId,
        game_creation: matchData.info.gameCreation,
        game_duration: matchData.info.gameDuration,
        patch: patchVersion,
        source: source,
      })

    if (matchError) {
      // ignore duplicate key errors (race condition between scrapers)
      if (matchError.code === '23505') {
        return false
      }
      console.error('error storing match:', matchError)
      return false
    }

    // fetch timeline data for ability leveling (only if region is provided)
    let timeline = null
    if (region) {
      try {
        timeline = await getMatchTimeline(matchData.metadata.matchId, region, 'batch')
      } catch (error) {
        console.log('could not fetch timeline (ability order will be null):', error)
      }
    }

    // store participant data with pig scores
    const participantRows = await Promise.all(matchData.info.participants.map(async (p, index) => {
      // extract ability order from timeline (participantId is 1-indexed)
      const participantId = index + 1
      const abilityOrder = timeline ? extractAbilityOrder(timeline, participantId) : null

      // calculate pig score for this participant
      const pigScore = await calculatePigScore({
        championName: p.championName,
        damage_dealt_to_champions: p.totalDamageDealtToChampions,
        total_damage_dealt: (p as any).totalDamageDealt || 0,
        total_heals_on_teammates: (p as any).totalHealsOnTeammates || 0,
        total_damage_shielded_on_teammates: (p as any).totalDamageShieldedOnTeammates || 0,
        time_ccing_others: (p as any).timeCCingOthers || 0,
        game_duration: matchData.info.gameDuration,
        item0: p.item0,
        item1: p.item1,
        item2: p.item2,
        item3: p.item3,
        item4: p.item4,
        item5: p.item5,
        perk0: p.perks?.styles[0]?.selections[0]?.perk || 0,
        patch: patchVersion,
      })

      return {
        match_id: matchData.metadata.matchId,
        puuid: p.puuid,
        summoner_name: p.summonerName || p.riotIdGameName || '',
        riot_id_game_name: p.riotIdGameName || '',
        riot_id_tagline: p.riotIdTagline || '',
        champion_name: p.championName,
        team_id: p.teamId,
        win: p.win,
        game_ended_in_early_surrender: p.gameEndedInEarlySurrender || false,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        champ_level: p.champLevel,
        damage_dealt_to_champions: p.totalDamageDealtToChampions,
        total_damage_dealt: (p as any).totalDamageDealt || 0,
        total_damage_taken: (p as any).totalDamageTaken || 0,
        total_heal: (p as any).totalHeal || 0,
        total_heals_on_teammates: (p as any).totalHealsOnTeammates || 0,
        total_damage_shielded_on_teammates: (p as any).totalDamageShieldedOnTeammates || 0,
        damage_self_mitigated: (p as any).damageSelfMitigated || 0,
        gold_earned: p.goldEarned,
        total_minions_killed: p.totalMinionsKilled,
        summoner1_id: p.summoner1Id,
        summoner2_id: p.summoner2Id,
        item0: p.item0,
        item1: p.item1,
        item2: p.item2,
        item3: p.item3,
        item4: p.item4,
        item5: p.item5,
        perk_primary_style: p.perks?.styles[0]?.style || 0,
        perk_sub_style: p.perks?.styles[1]?.style || 0,
        perk0: p.perks?.styles[0]?.selections[0]?.perk || 0,
        perk1: p.perks?.styles[0]?.selections[1]?.perk || 0,
        perk2: p.perks?.styles[0]?.selections[2]?.perk || 0,
        perk3: p.perks?.styles[0]?.selections[3]?.perk || 0,
        perk4: p.perks?.styles[1]?.selections[0]?.perk || 0,
        perk5: p.perks?.styles[1]?.selections[1]?.perk || 0,
        stat_perk0: p.perks?.statPerks.offense || 0,
        stat_perk1: p.perks?.statPerks.flex || 0,
        stat_perk2: p.perks?.statPerks.defense || 0,
        double_kills: (p as any).doubleKills || 0,
        triple_kills: (p as any).tripleKills || 0,
        quadra_kills: (p as any).quadraKills || 0,
        penta_kills: (p as any).pentaKills || 0,
        pig_score: pigScore,
        game_creation: matchData.info.gameCreation,
        ability_order: abilityOrder,
      }
    }))

    const { error: participantsError } = await supabase
      .from('summoner_matches')
      .insert(participantRows)

    if (participantsError) {
      console.error('error storing participants:', participantsError)
      return false
    }

    // stats are now computed via materialized views, no incremental updates needed
    return true
  } catch (error) {
    console.error('error in storeMatchData:', error)
    return false
  }
}
