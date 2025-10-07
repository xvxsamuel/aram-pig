import { NextResponse } from "next/server"
import { supabase } from "../../../lib/supabase"

export async function POST(request: Request) {
  try {
    const { puuid, offset, limit = 20 } = await request.json()
    
    if (!puuid) {
      return NextResponse.json(
        { error: "puuid is required" },
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
    
    // fetch full match data
    const { data: matchesData, error } = await supabase
      .from("matches")
      .select("match_data")
      .in("match_id", matchIds)

    if (error) {
      console.error("Error loading matches:", error)
      return NextResponse.json(
        { error: "failed to load matches" },
        { status: 500 }
      )
    }

    // sort to maintain order
    const matchMap = new Map(matchesData.map((m: any) => [m.match_data.metadata.matchId, m.match_data]))
    const matches = matchIds
      .map(id => matchMap.get(id))
      .filter(m => m !== null)

    return NextResponse.json({
      matches,
      hasMore: matches.length === limit
    })

  } catch (error: any) {
    console.error("Load more matches error:", error)
    return NextResponse.json(
      { error: error.message || "failed to load matches" },
      { status: 500 }
    )
  }
}
