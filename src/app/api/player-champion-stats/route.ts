// fetch player champion stats - uses shared query functions
import { NextResponse } from 'next/server'
import { getSummonerInfo, getChampionStats } from '@/lib/profile-queries'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const puuid = searchParams.get('puuid')
  
  if (!puuid) {
    return NextResponse.json({ error: 'puuid required' }, { status: 400 })
  }
  
  try {
    // get summoner info (includes cached profile_data)
    const summonerInfo = await getSummonerInfo(puuid)
    
    // get champion stats (uses cache if available)
    const championStats = await getChampionStats(puuid, summonerInfo?.profileData)
    
    return NextResponse.json(championStats)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
