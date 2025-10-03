CREATE TABLE IF NOT EXISTS summoners (
  puuid VARCHAR(78) PRIMARY KEY,
  game_name VARCHAR(255),
  tag_line VARCHAR(255),
  summoner_level INTEGER,
  profile_icon_id INTEGER,
  region VARCHAR(10),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  match_id VARCHAR(255) PRIMARY KEY,
  game_creation BIGINT NOT NULL,
  game_duration INTEGER NOT NULL,
  game_mode VARCHAR(50) NOT NULL,
  queue_id INTEGER NOT NULL,
  match_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS summoner_matches (
  puuid VARCHAR(78) NOT NULL,
  match_id VARCHAR(255) NOT NULL,
  champion_name VARCHAR(100),
  kills INTEGER,
  deaths INTEGER,
  assists INTEGER,
  win BOOLEAN,
  PRIMARY KEY (puuid, match_id),
  FOREIGN KEY (puuid) REFERENCES summoners(puuid) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summoner_matches_puuid ON summoner_matches(puuid);
CREATE INDEX IF NOT EXISTS idx_summoner_matches_match_id ON summoner_matches(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_game_creation ON matches(game_creation);
CREATE INDEX IF NOT EXISTS idx_summoners_last_updated ON summoners(last_updated);

-- Enable Row Level Security (RLS) - required by Supabase
ALTER TABLE summoners ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE summoner_matches ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public read access (no auth required)
CREATE POLICY "Allow public read access" ON summoners FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON matches FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON summoner_matches FOR SELECT USING (true);

-- Create policies to allow public insert access (for your app to store data)
CREATE POLICY "Allow public insert" ON summoners FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON summoner_matches FOR INSERT WITH CHECK (true);

-- Create policies to allow public update access
CREATE POLICY "Allow public update" ON summoners FOR UPDATE USING (true);
