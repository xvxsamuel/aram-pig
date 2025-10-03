-- Update summoners table to make fields nullable (except puuid)
-- This allows us to insert placeholder records for players we haven't fully fetched yet

ALTER TABLE summoners 
  ALTER COLUMN game_name DROP NOT NULL,
  ALTER COLUMN tag_line DROP NOT NULL,
  ALTER COLUMN summoner_level DROP NOT NULL,
  ALTER COLUMN profile_icon_id DROP NOT NULL,
  ALTER COLUMN region DROP NOT NULL;
