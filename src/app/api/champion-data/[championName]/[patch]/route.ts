import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchChampionNames, getApiNameFromUrl } from '@/lib/champion-names'
import { getLatestVersion } from '@/lib/ddragon-client'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ championName: string; patch: string }> }
) {
  const { championName, patch } = await params
  
  // convert URL name to API name (e.g., "jinx" -> "Jinx", "leesin" -> "LeeSin")
  const ddragonVersion = await getLatestVersion()
  const championNames = await fetchChampionNames(ddragonVersion)
  const apiName = getApiNameFromUrl(championName, championNames) || championName
  
  // fetch champion stats data - use maybeSingle to handle no results gracefully
  const { data, error } = await supabase
    .from('champion_stats')
    .select('*')
    .eq('champion_name', apiName)
    .eq('patch', patch)
    .maybeSingle()
  
  if (error) {
    return NextResponse.json({ error: error.message, championName, patch }, { status: 500 })
  }
  
  if (!data) {
    // list available patches for this champion
    const { data: availablePatches } = await supabase
      .from('champion_stats')
      .select('patch')
      .eq('champion_name', apiName)
    
    return NextResponse.json({ 
      error: 'No data found', 
      championName,
      apiName,
      patch,
      availablePatches: availablePatches?.map(p => p.patch) || []
    }, { status: 404 })
  }
  
  return NextResponse.json({
    championName,
    apiName,
    patch,
    games: data?.data?.games,
    wins: data?.data?.wins,
    // show first 20 starting item builds sorted by games
    topStarterBuilds: data?.data?.starting 
      ? Object.entries(data.data.starting)
          .map(([key, val]: [string, any]) => ({ 
            build: key, 
            items: key.split(','),
            games: val.games, 
            wins: val.wins,
            winrate: val.games > 0 ? ((val.wins / val.games) * 100).toFixed(1) + '%' : '0%'
          }))
          .sort((a, b) => b.games - a.games)
          .slice(0, 20)
      : [],
    rawStarting: data?.data?.starting,
    rawData: data?.data
  })
}
