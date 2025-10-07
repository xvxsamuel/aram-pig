-- Step 2: Backfill data in chunks using optimized CTE (run this AFTER add_columns_only.sql)
-- This will backfill 1000 matches at a time
-- Run multiple times until it returns 0 rows updated

WITH participant_values AS (
  SELECT
    sm.match_id,
    sm.puuid,
    (p->>'totalDamageDealtToChampions')::INTEGER AS damage_dealt_to_champions,
    (p->>'totalDamageDealt')::INTEGER AS damage_dealt_total,
    (p->>'damageDealtToObjectives')::INTEGER AS damage_dealt_to_objectives,
    (p->>'totalDamageTaken')::INTEGER AS damage_taken,
    (m.match_data->'info'->>'gameDuration')::INTEGER AS game_duration,
    (p->>'timeCCingOthers')::INTEGER AS time_ccing_others,
    (p->>'totalTimeSpentDead')::INTEGER AS total_time_spent_dead,
    (p->>'totalMinionsKilled')::INTEGER AS total_minions_killed,
    (p->>'goldEarned')::INTEGER AS gold_earned,
    NULLIF((p->'challenges'->>'damagePerMinute'), '')::NUMERIC(10,2) AS damage_per_minute_from_challenges,
    (p->>'totalHealsOnTeammates')::INTEGER AS total_heals_on_teammates,
    (p->>'totalDamageShieldedOnTeammates')::INTEGER AS total_damage_shielded_on_teammates,
    (p->>'totalTimeCCDealt')::INTEGER AS total_time_cc_dealt
  FROM summoner_matches sm
  JOIN matches m ON m.match_id = sm.match_id
  CROSS JOIN LATERAL jsonb_array_elements(m.match_data->'info'->'participants') AS p
  WHERE p->>'puuid' = sm.puuid
    AND (sm.puuid, sm.match_id) IN (
      SELECT puuid, match_id 
      FROM summoner_matches 
      WHERE damage_dealt_to_champions = 0 OR game_duration = 0
      LIMIT 1000
    )
)
UPDATE summoner_matches sm
SET
  damage_dealt_to_champions = COALESCE(pv.damage_dealt_to_champions, 0),
  damage_dealt_total = COALESCE(pv.damage_dealt_total, 0),
  damage_dealt_to_objectives = COALESCE(pv.damage_dealt_to_objectives, 0),
  damage_taken = COALESCE(pv.damage_taken, 0),
  game_duration = COALESCE(pv.game_duration, 0),
  time_ccing_others = COALESCE(pv.time_ccing_others, 0),
  total_time_spent_dead = COALESCE(pv.total_time_spent_dead, 0),
  total_minions_killed = COALESCE(pv.total_minions_killed, 0),
  gold_earned = COALESCE(pv.gold_earned, 0),
  damage_per_minute = COALESCE(
    pv.damage_per_minute_from_challenges,
    CASE WHEN COALESCE(pv.game_duration, 0) > 0
         THEN ROUND((COALESCE(pv.damage_dealt_to_champions, 0)::NUMERIC / pv.game_duration) * 60, 2)
         ELSE 0 END
  ),
  total_heals_on_teammates = COALESCE(pv.total_heals_on_teammates, 0),
  total_damage_shielded_on_teammates = COALESCE(pv.total_damage_shielded_on_teammates, 0),
  total_time_cc_dealt = COALESCE(pv.total_time_cc_dealt, 0)
FROM participant_values pv
WHERE sm.match_id = pv.match_id
  AND sm.puuid = pv.puuid;

-- Check remaining rows to migrate
SELECT COUNT(*) as remaining_rows
FROM summoner_matches
WHERE damage_dealt_to_champions = 0 OR game_duration = 0;
