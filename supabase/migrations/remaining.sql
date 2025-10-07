-- Create summoners table
CREATE TABLE IF NOT EXISTS summoners (
  puuid VARCHAR(78) PRIMARY KEY,
  game_name VARCHAR(255) NOT NULL,
  tag_line VARCHAR(255) NOT NULL,
  summoner_level INTEGER NOT NULL,
  profile_icon_id INTEGER NOT NULL,
  region VARCHAR(10) NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  match_id VARCHAR(255) PRIMARY KEY,
  game_creation BIGINT NOT NULL,
  game_duration INTEGER NOT NULL,
  game_mode VARCHAR(50) NOT NULL,
  queue_id INTEGER NOT NULL,
  match_data JSONB NOT NULL, -- Store full match JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create summoner_matches junction table
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

-- Create indexes for better query performance
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

ALTER TABLE summoners 
  ALTER COLUMN game_name DROP NOT NULL,
  ALTER COLUMN tag_line DROP NOT NULL,
  ALTER COLUMN summoner_level DROP NOT NULL,
  ALTER COLUMN profile_icon_id DROP NOT NULL,
  ALTER COLUMN region DROP NOT NULL;

  -- drop the update_jobs table and related functions
DROP TRIGGER IF EXISTS update_update_jobs_updated_at ON update_jobs;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS cleanup_old_update_jobs();
DROP TABLE IF EXISTS update_jobs;

-- create update_jobs table to track profile update progress
CREATE TABLE IF NOT EXISTS update_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puuid TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_matches INT NOT NULL DEFAULT 0,
  fetched_matches INT NOT NULL DEFAULT 0,
  eta_seconds INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- indexes for performance
CREATE INDEX IF NOT EXISTS idx_update_jobs_puuid ON update_jobs(puuid);
CREATE INDEX IF NOT EXISTS idx_update_jobs_status ON update_jobs(status);
CREATE INDEX IF NOT EXISTS idx_update_jobs_created_at ON update_jobs(created_at DESC);

-- composite index for finding active jobs by puuid
CREATE INDEX IF NOT EXISTS idx_update_jobs_puuid_status ON update_jobs(puuid, status) WHERE status IN ('pending', 'processing');

-- function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- trigger to auto-update updated_at
CREATE TRIGGER update_update_jobs_updated_at
  BEFORE UPDATE ON update_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- add row level security
ALTER TABLE update_jobs ENABLE ROW LEVEL SECURITY;

-- policy: allow service role full access
CREATE POLICY "Service role has full access to update_jobs"
  ON update_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- policy: allow read access to all authenticated users
CREATE POLICY "Anyone can read update_jobs"
  ON update_jobs
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- cleanup function for stale jobs (older than 15 minutes in processing state)
CREATE OR REPLACE FUNCTION cleanup_stale_jobs()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE update_jobs
  SET 
    status = 'failed',
    error_message = 'Job timed out after 15 minutes',
    completed_at = NOW()
  WHERE 
    status IN ('pending', 'processing')
    AND started_at < NOW() - INTERVAL '15 minutes';
END;
$$;
