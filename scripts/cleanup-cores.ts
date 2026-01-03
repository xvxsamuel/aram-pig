// Script to clean invalid core builds - runs locally with batching
// 
// SAFE: Only removes individual bad core KEYS from the core object
// Does NOT delete: games, wins, items, runes, spells, starting, skills, or anything else
//
// Run with:
//   npx tsx scripts/cleanup-cores.ts --dry-run   (preview changes, no writes)
//   npx tsx scripts/cleanup-cores.ts             (actually apply changes)

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

if (DRY_RUN) {
  console.log('=== DRY RUN MODE - NO CHANGES WILL BE MADE ===\n')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

console.log('Connecting to:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  db: { schema: 'public' },
  auth: { persistSession: false, autoRefreshToken: false },
})

// Component item IDs that should NOT be in cores
const BAD_IDS = new Set([
  '1004','1006','1011','1018','1026','1027','1028','1029','1031','1033',
  '1036','1037','1038','1042','1043','1052','1053','1054','1055','1056',
  '1057','1058','1082','1083','1101','1102','1103','2003','2019','2020',
  '2021','2022','2031','2049','2050','2051','2055','2138','2139','2140',
  '2141','2142','2143','2144','2150','2151','2152','2420','2421','2508',
  '3024','3035','3044','3051','3057','3066','3067','3070','3076','3077',
  '3082','3086','3105','3108','3112','3113','3114','3123','3133','3134',
  '3140','3144','3145','3147','3155','3177','3184','3211','3599','3801',
  '3802','3803','3865','3866','3916','4003','4630','4632','4638','4642',
  '6660','6670','6690'
])

function filterValidCores(coreData: Record<string, any>): { filtered: Record<string, any>, removed: string[] } {
  const filtered: Record<string, any> = {}
  const removed: string[] = []
  
  for (const [key, value] of Object.entries(coreData)) {
    const parts = key.split('_')
    const hasBadId = parts.some(p => BAD_IDS.has(p))
    if (hasBadId) {
      removed.push(key)
    } else {
      filtered[key] = value
    }
  }
  
  return { filtered, removed }
}

async function main() {
  console.log('Fetching champion_stats rows...')
  
  const { data: rows, error } = await supabase
    .from('champion_stats')
    .select('id, champion_name, patch, data')
  
  if (error) {
    console.error('Error fetching:', error)
    return
  }
  
  console.log(`Found ${rows.length} rows to check\n`)
  
  let updated = 0
  let skipped = 0
  let totalCoresRemoved = 0
  let totalCoresKept = 0
  
  for (const row of rows) {
    const core = row.data?.core
    if (!core || typeof core !== 'object') {
      skipped++
      continue
    }
    
    const { filtered, removed } = filterValidCores(core)
    
    if (removed.length === 0) {
      skipped++
      totalCoresKept += Object.keys(core).length
      continue
    }
    
    totalCoresRemoved += removed.length
    totalCoresKept += Object.keys(filtered).length
    
    if (DRY_RUN) {
      console.log(`[DRY RUN] ${row.champion_name}/${row.patch}:`)
      console.log(`  Would remove ${removed.length} bad cores: ${removed.slice(0, 3).join(', ')}${removed.length > 3 ? '...' : ''}`)
      console.log(`  Would keep ${Object.keys(filtered).length} valid cores`)
      updated++
    } else {
      // SAFE: Only modifying the 'core' key, everything else stays intact
      const newData = { ...row.data, core: filtered }
      
      const { error: updateError } = await supabase
        .from('champion_stats')
        .update({ data: newData })
        .eq('id', row.id)
      
      if (updateError) {
        console.error(`Error updating ${row.champion_name}/${row.patch}:`, updateError)
      } else {
        updated++
        console.log(`✓ ${row.champion_name}/${row.patch}: removed ${removed.length} bad cores (${Object.keys(filtered).length} remaining)`)
      }
      
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 50))
    }
  }
  
  console.log('\n--- Summary ---')
  console.log(`Rows that would be/were updated: ${updated}`)
  console.log(`Rows skipped (no bad cores): ${skipped}`)
  console.log(`Total bad cores to remove/removed: ${totalCoresRemoved}`)
  console.log(`Total valid cores kept: ${totalCoresKept}`)
  
  if (DRY_RUN) {
    console.log('\n=== This was a DRY RUN - no changes were made ===')
    console.log('Run without --dry-run to apply changes')
  }
}

main()
