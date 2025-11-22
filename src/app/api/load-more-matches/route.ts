import { NextResponse } from "next/server"
import { supabase } from "../../../lib/supabase"

export async function POST(request: Request) {
  try {
    const { puuid, offset, limit = 20 } = await request.json()
    
    if (!puuid) {
      return NextResponse.json(
        { error: "PUUID is required" },
        { status: 400 }
      )
    }

    // get match ids with offset
    const { data: matchStats } = await supabase
      .from("summoner_matches")
      .select("match_id")
      .eq("puuid", puuid)
      .order("match_id", { ascending: false })
      .range(offset, offset + limit - 1)

    if (!matchStats || matchStats.length === 0) {
      return NextResponse.json({ matches: [], hasMore: false })
    }

    const matchIds = matchStats.map(m => m.match_id)
    
    // get match metadata
    const { data: matchRecords, error: matchError } = await supabase
      .from("matches")
      .select("match_id, game_creation, game_duration")
      .in("match_id", matchIds)

    // get all participants for these matches
    const { data: participants, error: participantsError } = await supabase
      .from("summoner_matches")
      .select("*")
      .in("match_id", matchIds)

    if (matchError || participantsError) {
      console.error("Error loading matches:", matchError || participantsError)
      return NextResponse.json(
        { error: "Failed to load matches" },
        { status: 500 }
      )
    }

    // reconstruct match data structure
    const matches = matchIds.map(matchId => {
      const match = matchRecords?.find(m => m.match_id === matchId)
      const matchParticipants = participants?.filter(p => p.match_id === matchId) || []
      
      if (!match || matchParticipants.length === 0) return null

      return {
        metadata: {
          matchId: match.match_id,
          participants: matchParticipants.map(p => p.puuid)
        },
        info: {
          gameCreation: match.game_creation,
          gameDuration: match.game_duration,
          gameEndTimestamp: match.game_creation + (match.game_duration * 1000),
          gameMode: "ARAM",
          queueId: 450,
          participants: matchParticipants.map(p => ({
            puuid: p.puuid,
            summonerName: "",
            riotIdGameName: p.riot_id_game_name || "",
            riotIdTagline: p.riot_id_tagline || "",
            championName: p.champion_name,
            championId: 0,
            teamId: p.match_data?.teamId || 100,
            win: p.win,
            gameEndedInEarlySurrender: p.match_data?.isRemake || false,
            kills: p.match_data?.kills || 0,
            deaths: p.match_data?.deaths || 0,
            assists: p.match_data?.assists || 0,
            champLevel: p.match_data?.level || 18,
            totalDamageDealtToChampions: p.match_data?.stats?.damage || 0,
            goldEarned: p.match_data?.stats?.gold || 0,
            totalMinionsKilled: p.match_data?.stats?.cs || 0,
            neutralMinionsKilled: 0,
            summoner1Id: p.match_data?.spells?.[0] || 0,
            summoner2Id: p.match_data?.spells?.[1] || 0,
            item0: p.match_data?.items?.[0] || 0,
            item1: p.match_data?.items?.[1] || 0,
            item2: p.match_data?.items?.[2] || 0,
            item3: p.match_data?.items?.[3] || 0,
            item4: p.match_data?.items?.[4] || 0,
            item5: p.match_data?.items?.[5] || 0,
            pigScore: null,
            perks: {
              styles: [
                {
                  style: p.match_data?.runes?.primary?.style || 0,
                  selections: [
                    { perk: p.match_data?.runes?.primary?.perks?.[0] || 0 },
                    { perk: p.match_data?.runes?.primary?.perks?.[1] || 0 },
                    { perk: p.match_data?.runes?.primary?.perks?.[2] || 0 },
                    { perk: p.match_data?.runes?.primary?.perks?.[3] || 0 },
                  ]
                },
                {
                  style: p.match_data?.runes?.secondary?.style || 0,
                  selections: [
                    { perk: p.match_data?.runes?.secondary?.perks?.[0] || 0 },
                    { perk: p.match_data?.runes?.secondary?.perks?.[1] || 0 },
                  ]
                }
              ],
              statPerks: {
                offense: p.match_data?.runes?.statPerks?.[0] || 0,
                flex: p.match_data?.runes?.statPerks?.[1] || 0,
                defense: p.match_data?.runes?.statPerks?.[2] || 0,
              }
            }
          }))
        }
      }
    }).filter(m => m !== null)

    return NextResponse.json({
      matches,
      hasMore: matches.length === limit
    })

  } catch (error: any) {
    console.error("Load more matches error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to load matches" },
      { status: 500 }
    )
  }
}
