-- add cached profile data to summoners table to reduce riot api calls
ALTER TABLE summoners
ADD COLUMN IF NOT EXISTS game_name TEXT,
ADD COLUMN IF NOT EXISTS tag_line TEXT,
ADD COLUMN IF NOT EXISTS summoner_level INT,
ADD COLUMN IF NOT EXISTS profile_icon_id INT;

-- index for faster lookups by game_name + tag_line
CREATE INDEX IF NOT EXISTS idx_summoners_name_tag ON summoners(LOWER(game_name), LOWER(tag_line));

-- update existing records to mark them as needing refresh
UPDATE summoners 
SET game_name = NULL 
WHERE game_name IS NULL;
