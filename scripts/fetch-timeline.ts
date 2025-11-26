// script to fetch and inspect timeline data for a specific match ID
// usage: tsx --import ./scripts/load-env.ts scripts/fetch-timeline.ts <matchId> [region]
// example: tsx --import ./scripts/load-env.ts scripts/fetch-timeline.ts EUW1_7610433536 europe

import { getMatchTimelineNoWait } from '../src/lib/riot-api'
import { RegionalCluster } from '../src/lib/regions'

const matchId = process.argv[2]
const region = (process.argv[3] || 'europe') as RegionalCluster

if (!matchId) {
  console.error('Usage: tsx --import ./scripts/load-env.ts scripts/fetch-timeline.ts <matchId> [region]')
  console.error('Example: tsx --import ./scripts/load-env.ts scripts/fetch-timeline.ts EUW1_7610433536 europe')
  console.error('Regions: europe, americas, asia, sea')
  process.exit(1)
}

console.log(`Fetching timeline for match ${matchId} in region ${region}...`)

getMatchTimelineNoWait(matchId, region)
  .then(timeline => {
    console.log('\n=== TIMELINE STRUCTURE ===')
    console.log(`Match ID: ${timeline.metadata.matchId}`)
    console.log(`Frame interval: ${timeline.info.frameInterval}ms`)
    console.log(`Total frames: ${timeline.info.frames.length}`)
    
    // Find first ITEM_PURCHASED events
    console.log('\n=== FIRST ITEM PURCHASES (first 2 minutes) ===')
    let foundCount = 0
    
    for (const frame of timeline.info.frames) {
      if (frame.timestamp > 120000) break // stop after 2 minutes
      
      if (!frame.events) continue
      
      for (const event of frame.events) {
        if (event.type === 'ITEM_PURCHASED' && foundCount < 20) {
          console.log(`[${event.timestamp}ms] Participant ${event.participantId}: Item ${event.itemId}`)
          foundCount++
        }
      }
    }
    
    // Show frame timestamps
    console.log('\n=== FRAME TIMESTAMPS (first 10 frames) ===')
    timeline.info.frames.slice(0, 10).forEach((frame, idx) => {
      const eventCount = frame.events?.length || 0
      console.log(`Frame ${idx}: ${frame.timestamp}ms (${eventCount} events)`)
    })
    
    console.log('\n✓ Timeline fetched successfully')
  })
  .catch(error => {
    console.error('Error fetching timeline:', error.message)
    process.exit(1)
  })
