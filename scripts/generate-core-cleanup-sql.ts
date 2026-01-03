// Script to generate SQL for cleaning up invalid core builds containing component items
import itemsData from '../src/data/items.json'

const items = itemsData as Record<string, { itemType?: string; name?: string }>

// Get all component item IDs
const componentIds: string[] = []

for (const [id, item] of Object.entries(items)) {
  if (item.itemType === 'component' || item.itemType === 'starter' || item.itemType === 'consumable') {
    componentIds.push(id)
  }
}

console.log(`Found ${componentIds.length} component/starter/consumable items to filter out:`)
console.log(componentIds.map(id => `${id} (${items[id].name})`).join(', '))

// Generate SQL conditions to match any core key containing these IDs
// Core keys are formatted as "id1_id2_id3" (sorted)
const conditions = componentIds.map(id => {
  // Match at start, middle, or end of the underscore-separated key
  return `key ~ '^${id}_' OR key ~ '_${id}_' OR key ~ '_${id}$' OR key = '${id}'`
}).join(' OR ')

console.log('\n\n--- SQL Migration ---\n')

const sql = `-- Migration: Clean up invalid core builds containing component items
-- Generated: ${new Date().toISOString()}
-- 
-- This removes core build entries that incorrectly include component items
-- (e.g., Tiamat, Long Sword, Amplifying Tome, etc.)

-- Component item IDs to remove from cores:
-- ${componentIds.slice(0, 20).join(', ')}... (${componentIds.length} total)

DO $$
DECLARE
  component_ids TEXT[] := ARRAY[${componentIds.map(id => `'${id}'`).join(', ')}];
  updated_count INT := 0;
  r RECORD;
  core_data JSONB;
  new_core JSONB;
  core_key TEXT;
  should_remove BOOLEAN;
  id_part TEXT;
BEGIN
  -- Loop through all champion_stats rows
  FOR r IN SELECT id, champion_name, patch, data FROM champion_stats WHERE data->'core' IS NOT NULL
  LOOP
    core_data := r.data->'core';
    new_core := '{}'::JSONB;
    
    -- Check each core key
    FOR core_key IN SELECT jsonb_object_keys(core_data)
    LOOP
      should_remove := FALSE;
      
      -- Check if any part of the key (split by _) is a component
      FOREACH id_part IN ARRAY string_to_array(core_key, '_')
      LOOP
        IF id_part = ANY(component_ids) THEN
          should_remove := TRUE;
          EXIT;
        END IF;
      END LOOP;
      
      -- Keep the core if it doesn't contain components
      IF NOT should_remove THEN
        new_core := new_core || jsonb_build_object(core_key, core_data->core_key);
      END IF;
    END LOOP;
    
    -- Update if we removed any cores
    IF new_core != core_data THEN
      UPDATE champion_stats 
      SET data = jsonb_set(data, '{core}', new_core)
      WHERE id = r.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Updated % champion_stats rows', updated_count;
END $$;
`

console.log(sql)
