// script to wipe all pig scores from summoner_matches
// run with: npm run wipe-pig-scores

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function wipePigScores() {
  console.log('Wiping all pig scores from summoner_matches...')
  
  // get count of matches with pig scores using raw SQL since JSONB queries are tricky
  const { data: countData, error: countError } = await supabase.rpc('count_matches_with_pig_scores')
  
  // fallback: just fetch and filter
  if (countError) {
    console.log('Using fallback method to count matches with pig scores...')
  }
  
  // process in batches - fetch all and filter for pigScore
  const batchSize = 1000
  let processed = 0
  let hasMore = true
  
  while (hasMore) {
    // get batch of matches
    const { data: matches, error: fetchError } = await supabase
      .from('summoner_matches')
      .select('match_id, puuid, match_data')
      .range(processed, processed + batchSize - 1)
    
    if (fetchError) {
      console.error('Error fetching matches:', fetchError)
      break
    }
    
    if (!matches || matches.length === 0) {
      hasMore = false
      break
    }
    
    // filter for matches with pigScore
    const matchesWithPigScore = matches.filter(m => 
      m.match_data?.pigScore !== null && m.match_data?.pigScore !== undefined
    )
    
    if (matchesWithPigScore.length > 0) {
      console.log(`Found ${matchesWithPigScore.length} matches with pig scores in this batch`)
      
      // update each match to remove pigScore
      for (const match of matchesWithPigScore) {
        const updatedMatchData = { ...match.match_data }
        delete updatedMatchData.pigScore
        
        const { error: updateError } = await supabase
          .from('summoner_matches')
          .update({ match_data: updatedMatchData })
          .eq('match_id', match.match_id)
          .eq('puuid', match.puuid)
        
        if (updateError) {
          console.error(`Error updating ${match.match_id}:`, updateError)
        }
      }
      
      console.log(`Wiped ${matchesWithPigScore.length} pig scores`)
    }
    
    processed += matches.length
    console.log(`Processed ${processed} total matches...`)
    
    if (matches.length < batchSize) {
      hasMore = false
    }
  }
  
  console.log('Done wiping pig scores')
}

wipePigScores().catch(console.error)
