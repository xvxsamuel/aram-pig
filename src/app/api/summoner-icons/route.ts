import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getSummonerByPuuid } from "@/lib/riot-api"
import { LABEL_TO_PLATFORM } from "@/lib/regions"

// get summoner profile icons by puuids
export async function POST(request: NextRequest) {
  try {
    const { puuids, region } = await request.json()

    if (!puuids || !Array.isArray(puuids) || puuids.length === 0) {
      return NextResponse.json({ error: "puuids array required" }, { status: 400 })
    }

    // limit to 20 puuids per request (rate limit friendly)
    const limitedPuuids = puuids.slice(0, 20)

    // first check database
    const { data, error } = await supabase
      .from("summoners")
      .select("puuid, profile_icon_id")
      .in("puuid", limitedPuuids)

    if (error) {
      console.error("Failed to fetch summoner icons:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // convert to map for easy lookup
    const iconMap: Record<string, number> = {}
    for (const summoner of data || []) {
      iconMap[summoner.puuid] = summoner.profile_icon_id
    }

    // find missing puuids
    const missingPuuids = limitedPuuids.filter(puuid => !(puuid in iconMap))

    // fetch missing from riot api if region is provided
    if (missingPuuids.length > 0 && region) {
      // convert url region (like "euw") to platform code (like "euw1")
      const platform = LABEL_TO_PLATFORM[region.toUpperCase()]
      
      if (platform) {
        // fetch in parallel but limit to 5 concurrent to respect rate limits
        const batchSize = 5
        for (let i = 0; i < missingPuuids.length; i += batchSize) {
          const batch = missingPuuids.slice(i, i + batchSize)
          const results = await Promise.allSettled(
            batch.map(puuid => getSummonerByPuuid(puuid, platform, 'overhead'))
          )

          for (let j = 0; j < results.length; j++) {
            const result = results[j]
            if (result.status === 'fulfilled' && result.value) {
              iconMap[batch[j]] = result.value.profileIconId
            }
          }
        }
      }
    }

    return NextResponse.json(iconMap)
  } catch (error) {
    console.error("Error in summoner-icons API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
