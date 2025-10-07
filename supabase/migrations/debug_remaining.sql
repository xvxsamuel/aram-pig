-- Debug query to see why 151 rows aren't being updated

-- Check if these summoner_matches have corresponding match data
SELECT 
  COUNT(*) as orphaned_matches,
  'summoner_matches without match_data' as description
FROM summoner_matches sm
LEFT JOIN matches m ON m.match_id = sm.match_id
WHERE (sm.damage_dealt_to_champions = 0 OR sm.game_duration = 0)
  AND m.match_id IS NULL;

-- Check if the puuid exists in the match participants
SELECT 
  sm.match_id,
  sm.puuid,
  CASE 
    WHEN m.match_id IS NULL THEN 'No match data'
    WHEN NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(m.match_data->'info'->'participants') p
      WHERE p->>'puuid' = sm.puuid
    ) THEN 'Puuid not in participants'
    ELSE 'Should be updated'
  END as reason
FROM summoner_matches sm
LEFT JOIN matches m ON m.match_id = sm.match_id
WHERE (sm.damage_dealt_to_champions = 0 OR sm.game_duration = 0)
LIMIT 10;

-- If the issue is that match_data structure is different, let's check one match
SELECT 
  sm.match_id,
  m.match_data->'info'->'participants'
FROM summoner_matches sm
JOIN matches m ON m.match_id = sm.match_id
WHERE (sm.damage_dealt_to_champions = 0 OR sm.game_duration = 0)
LIMIT 1;
