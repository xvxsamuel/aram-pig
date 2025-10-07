-- Step 1: Just add the columns first (fast)
ALTER TABLE summoner_matches 
ADD COLUMN IF NOT EXISTS damage_dealt_to_champions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_dealt_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_dealt_to_objectives INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_taken INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS game_duration INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_ccing_others INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_time_spent_dead INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_minions_killed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS gold_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_per_minute NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_heals_on_teammates INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_damage_shielded_on_teammates INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_time_cc_dealt INTEGER DEFAULT 0;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_summoner_matches_puuid_match_id ON summoner_matches(puuid, match_id);
