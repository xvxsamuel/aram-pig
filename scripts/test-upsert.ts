// Test script for upsert_aggregated_champion_stats_batch
// Duplicates Aatrox 25.23 data into patch "test" to verify the merge works
// Run with: npx tsx --import ./scripts/load-env.ts scripts/test-upsert.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testUpsert() {
  console.log('=== Testing upsert_aggregated_champion_stats_batch ===\n')

  // 1. Fetch Aatrox data from patch 25.23
  console.log('1. Fetching Aatrox 25.23 data...')
  const { data: aatroxData, error: fetchError } = await supabase
    .from('champion_stats')
    .select('*')
    .eq('champion_name', 'Aatrox')
    .eq('patch', '25.23')
    .single()

  if (fetchError || !aatroxData) {
    console.error('Failed to fetch Aatrox data:', fetchError)
    process.exit(1)
  }

  console.log(`   Found Aatrox 25.23 with ${aatroxData.data?.games || 0} games\n`)

  // 2. Delete any existing test data
  console.log('2. Cleaning up existing test data (patch "test")...')
  const { error: deleteError } = await supabase
    .from('champion_stats')
    .delete()
    .eq('patch', 'test')

  if (deleteError) {
    console.error('Failed to delete test data:', deleteError)
  } else {
    console.log('   Cleaned up\n')
  }

  // 3. First upsert - should INSERT (no existing row)
  console.log('3. First upsert (should INSERT new row)...')
  const firstUpsertData = [{
    champion_name: 'Aatrox',
    patch: 'test',
    data: JSON.stringify(aatroxData.data)
  }]

  const { data: firstResult, error: firstError } = await supabase.rpc('upsert_aggregated_champion_stats_batch', {
    p_stats_array: firstUpsertData
  })

  if (firstError) {
    console.error('   First upsert FAILED:', firstError)
    process.exit(1)
  }
  console.log(`   Success! Processed ${firstResult} entries\n`)

  // 4. Verify the insert
  console.log('4. Verifying inserted data...')
  const { data: verifyData1 } = await supabase
    .from('champion_stats')
    .select('*')
    .eq('champion_name', 'Aatrox')
    .eq('patch', 'test')
    .single()

  const games1 = verifyData1?.data?.games || 0
  const wins1 = verifyData1?.data?.wins || 0
  console.log(`   Aatrox test patch: ${games1} games, ${wins1} wins\n`)

  // 5. Second upsert - should MERGE (add to existing)
  console.log('5. Second upsert (should MERGE and add values)...')
  const { data: secondResult, error: secondError } = await supabase.rpc('upsert_aggregated_champion_stats_batch', {
    p_stats_array: firstUpsertData
  })

  if (secondError) {
    console.error('   Second upsert FAILED:', secondError)
    process.exit(1)
  }
  console.log(`   Success! Processed ${secondResult} entries\n`)

  // 6. Verify the merge (values should be doubled)
  console.log('6. Verifying merged data (should be doubled)...')
  const { data: verifyData2 } = await supabase
    .from('champion_stats')
    .select('*')
    .eq('champion_name', 'Aatrox')
    .eq('patch', 'test')
    .single()

  const games2 = verifyData2?.data?.games || 0
  const wins2 = verifyData2?.data?.wins || 0
  console.log(`   Aatrox test patch: ${games2} games, ${wins2} wins`)
  
  // Check if values doubled
  const gamesDoubled = games2 === games1 * 2
  const winsDoubled = wins2 === wins1 * 2
  
  if (gamesDoubled && winsDoubled) {
    console.log(`   ✓ Values correctly doubled! (${games1} → ${games2}, ${wins1} → ${wins2})\n`)
  } else {
    console.log(`   ✗ MERGE FAILED! Expected ${games1 * 2} games, got ${games2}\n`)
  }

  // 7. Cleanup
  console.log('7. Cleaning up test data...')
  await supabase.from('champion_stats').delete().eq('patch', 'test')
  console.log('   Cleaned up\n')

  // Summary
  console.log('=== Test Complete ===')
  if (gamesDoubled && winsDoubled) {
    console.log('Result: PASS - upsert_aggregated_champion_stats_batch works correctly!')
  } else {
    console.log('Result: FAIL - merge did not work as expected')
    process.exit(1)
  }
}

testUpsert().catch(console.error)
