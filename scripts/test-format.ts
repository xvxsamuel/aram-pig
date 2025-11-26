// Debug test for upsert_aggregated_champion_stats_batch format
// Run with: npx tsx --import ./scripts/load-env.ts scripts/test-format.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testFormat() {
  console.log('=== Testing RPC format ===\n')

  // Create minimal test data matching the format from stats-aggregator
  const testData = {
    games: 5,
    wins: 3,
    championStats: {
      sumDamageToChampions: 50000,
      sumTotalDamage: 100000,
      sumHealing: 1000,
      sumShielding: 2000,
      sumCCTime: 50,
      sumGameDuration: 1500,
      sumDeaths: 10
    },
    items: {
      "1": { "3153": { games: 2, wins: 1 } },
      "2": {},
      "3": {},
      "4": {},
      "5": {},
      "6": {}
    },
    runes: {
      primary: {},
      secondary: {},
      tertiary: { offense: {}, flex: {}, defense: {} },
      tree: { primary: {}, secondary: {} }
    },
    spells: {},
    starting: {},
    skills: {},
    core: {}
  }

  // Format 1: Array of objects with stringified data (current approach)
  console.log('Test 1: Array with stringified data field...')
  const format1 = [{
    champion_name: 'TestChamp',
    patch: 'test',
    data: JSON.stringify(testData)
  }]
  
  console.log('Sending:', JSON.stringify(format1, null, 2).slice(0, 500) + '...')
  
  const { data: result1, error: error1 } = await supabase.rpc('upsert_aggregated_champion_stats_batch', {
    p_stats_array: format1
  })
  
  if (error1) {
    console.log('Error:', error1.message)
  } else {
    console.log('Result:', result1)
  }

  // Cleanup
  await supabase.from('champion_stats').delete().eq('patch', 'test')
  
  // Format 2: Pass as JSON string instead of array
  console.log('\nTest 2: Pass JSON string directly...')
  const format2 = JSON.stringify([{
    champion_name: 'TestChamp',
    patch: 'test',
    data: JSON.stringify(testData)
  }])
  
  const { data: result2, error: error2 } = await supabase.rpc('upsert_aggregated_champion_stats_batch', {
    p_stats_array: format2
  })
  
  if (error2) {
    console.log('Error:', error2.message)
  } else {
    console.log('Result:', result2)
  }

  // Cleanup
  await supabase.from('champion_stats').delete().eq('patch', 'test')

  console.log('\n=== Done ===')
}

testFormat().catch(console.error)
