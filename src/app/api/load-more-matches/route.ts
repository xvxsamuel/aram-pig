// load more matches API - uses shared query functions
import { NextResponse } from "next/server"
import { getMatches } from "@/lib/profile-queries"

export async function POST(request: Request) {
  try {
    const { puuid, offset, limit = 20 } = await request.json()
    
    if (!puuid) {
      return NextResponse.json(
        { error: "PUUID is required" },
        { status: 400 }
      )
    }

    const { matches, hasMore } = await getMatches(puuid, limit, offset)

    return NextResponse.json({ matches, hasMore })

  } catch (error: any) {
    console.error("Load more matches error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to load matches" },
      { status: 500 }
    )
  }
}
