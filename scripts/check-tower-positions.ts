// Analyze all tower and event positions to understand actual ARAM map usage
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface Position { x: number; y: number }

function getLanePosition(pos: Position): number {
  const BLUE_BASE = { x: 400, y: 400 }
  const RED_BASE = { x: 12400, y: 12400 }
  
  const distToBlue = Math.sqrt(Math.pow(pos.x - BLUE_BASE.x, 2) + Math.pow(pos.y - BLUE_BASE.y, 2))
  const distToRed = Math.sqrt(Math.pow(pos.x - RED_BASE.x, 2) + Math.pow(pos.y - RED_BASE.y, 2))
  return distToBlue / (distToBlue + distToRed)
}

async function analyzeMapData() {
  console.log('Fetching all matches with timeline data...\n')
  
  const { data: matches, error } = await supabase
    .from('matches')
    .select('match_id, timeline_data')
    .not('timeline_data', 'is', null)
    .limit(100)

  if (error || !matches || matches.length === 0) {
    console.log('No matches found')
    return
  }

  console.log(`Analyzing ${matches.length} matches...\n`)

  const blueTowers: { [key: string]: number[] } = { OUTER: [], INNER: [], BASE: [], NEXUS: [] }
  const redTowers: { [key: string]: number[] } = { OUTER: [], INNER: [], BASE: [], NEXUS: [] }
  const allKills: number[] = []
  const allDeaths: number[] = []

  for (const match of matches) {
    const timeline = match.timeline_data

    if (!timeline?.info?.frames) continue

    for (const frame of timeline.info.frames) {
      for (const event of frame.events || []) {
        // Tower destructions
        if (event.type === 'BUILDING_KILL' && event.buildingType === 'TOWER_BUILDING' && event.position) {
          const lanePos = getLanePosition(event.position)
          const towerType = event.towerType || 'UNKNOWN'
          
          if (event.teamId === 100) {
            // Blue tower destroyed
            if (towerType === 'OUTER_TURRET') blueTowers.OUTER.push(lanePos)
            else if (towerType === 'INNER_TURRET') blueTowers.INNER.push(lanePos)
            else if (towerType === 'BASE_TURRET') blueTowers.BASE.push(lanePos)
            else if (towerType === 'NEXUS_TURRET') blueTowers.NEXUS.push(lanePos)
          } else if (event.teamId === 200) {
            // Red tower destroyed
            if (towerType === 'OUTER_TURRET') redTowers.OUTER.push(lanePos)
            else if (towerType === 'INNER_TURRET') redTowers.INNER.push(lanePos)
            else if (towerType === 'BASE_TURRET') redTowers.BASE.push(lanePos)
            else if (towerType === 'NEXUS_TURRET') redTowers.NEXUS.push(lanePos)
          }
        }
        
        // Champion kills
        if (event.type === 'CHAMPION_KILL' && event.position) {
          const lanePos = getLanePosition(event.position)
          allKills.push(lanePos)
        }
      }
    }
  }

  // Calculate averages
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const min = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : 0
  const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0

  console.log('=== TOWER POSITIONS ===\n')
  
  console.log('Blue Team Towers:')
  for (const [type, positions] of Object.entries(blueTowers)) {
    if (positions.length > 0) {
      console.log(`  ${type}: avg=${avg(positions).toFixed(3)}, min=${min(positions).toFixed(3)}, max=${max(positions).toFixed(3)}, count=${positions.length}`)
    }
  }
  
  console.log('\nRed Team Towers:')
  for (const [type, positions] of Object.entries(redTowers)) {
    if (positions.length > 0) {
      console.log(`  ${type}: avg=${avg(positions).toFixed(3)}, min=${min(positions).toFixed(3)}, max=${max(positions).toFixed(3)}, count=${positions.length}`)
    }
  }
  
  console.log('\n=== KILL/DEATH POSITIONS ===\n')
  console.log(`Total kills analyzed: ${allKills.length}`)
  if (allKills.length > 0) {
    console.log(`  Lane position range: ${min(allKills).toFixed(3)} - ${max(allKills).toFixed(3)}`)
    console.log(`  Average: ${avg(allKills).toFixed(3)}`)
    
    // Percentiles
    const sorted = allKills.sort((a, b) => a - b)
    const p10 = sorted[Math.floor(sorted.length * 0.1)]
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    console.log(`  10th percentile: ${p10.toFixed(3)}`)
    console.log(`  90th percentile: ${p90.toFixed(3)}`)
  }
}

analyzeMapData().then(() => process.exit(0))
