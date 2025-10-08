# Pig Score System

## Overview
Pig score is a 0-100 rating system that evaluates player performance in ARAM matches. A score of 50 represents average performance, while 100 indicates perfect play.

## Score Components (Total: 100 points)

### 1. Item Build Score (30 points)
- **With Timeline Data (First 20 matches):**
  - Compares 1st, 2nd, and 3rd item purchases against highest winrate items from `aram_stats` data
  - Each item scored based on winrate difference from optimal choice
  - Lose 2 points per 1% winrate difference
  - Suboptimal items get minimal points (3/10)

- **Without Timeline Data (Older matches):**
  - Compares final 6 items against optimal item pool
  - Scores based on % of items matching optimal builds
  - Less accurate but better than no scoring

### 2. Keystone Score (15 points)
- Compares player's keystone rune against champion's optimal keystones from `aram_keystones` data
- Top keystone: 15 points
- Second/third best keystone: 13-10 points based on winrate difference
- Non-meta keystone: 5 points
- Unknown: 7.5 points (neutral)

### 3. Performance Score (35 points)
- **KDA Score (15 points):** Based on kills/deaths/assists ratio
  - Perfect KDA (0 deaths): Scales with kills+assists up to 15 points
  - Normal KDA: Calculated as (K+A)/D × 2.5, capped at 15
  
- **Damage Per Minute (12 points):** 
  - Typical ARAM: 500-800 DPM
  - Good: 1000+ DPM
  - Excellent: 1500+ DPM
  - Score = (DPM / 1200) × 12, capped at 12
  
- **Gold Efficiency (8 points):**
  - Typical ARAM: 1000-1400 GPM
  - Score = (GPM / 1200) × 8, capped at 8

### 4. Summoner Spell Score (10 points)
- Both optimal spells (Flash, Barrier, Ghost, Heal, Ignite, Exhaust, Cleanse, Mark/Dash): 10 points
- One optimal spell: 6 points
- Neither optimal: 2 points

### 5. Kill Participation Score (10 points)
- Percentage of team kills player participated in
- Score = (Kills + Assists) / Team Kills × 10
- Maximum 10 points for 100% participation
- Neutral 5 points if team got no kills

## Implementation Details

### Database Schema

**summoner_matches table additions:**
```sql
ALTER TABLE summoner_matches 
ADD COLUMN pig_score DECIMAL(5,2),
ADD COLUMN first_item INTEGER,
ADD COLUMN second_item INTEGER,
ADD COLUMN third_item INTEGER;

CREATE INDEX idx_summoner_matches_pig_score ON summoner_matches(pig_score DESC);
```

**aram_stats table:**
```sql
CREATE TABLE aram_stats (
  champion_name TEXT NOT NULL UNIQUE,
  overall_winrate DECIMAL(5,2),
  
  -- item builds by slot - top 5 highest pickrate per slot
  slot_1_items JSONB,  -- array of {id, wr, pr}
  slot_2_items JSONB,
  slot_3_items JSONB,
  
  -- keystones - top 5 highest pickrate
  keystones JSONB,  -- array of {id, name, wr, pr}
);
```

**Data Format:**
All stored as JSONB arrays sorted by pickrate (highest first):
```json
{
  "champion_name": "aatrox",
  "overall_winrate": 53.04,
  "slot_1_items": [
    {"id": 6610, "wr": 54.06, "pr": 41.95},
    {"id": 6692, "wr": 50.3, "pr": 29.01}
  ],
  "keystones": [
    {"id": 8010, "name": "Conqueror", "wr": 53.0, "pr": 96.3},
    {"id": 8437, "name": "Grasp of the Undying", "wr": 55.6, "pr": 1.0}
  ]
}
```

### Timeline Fetching Strategy

- **Timeline data fetched for ALL matches** during profile updates
- Provides exact item purchase order and timing for accurate scoring
- If timeline fetch fails, falls back to final item comparison
- Timeline API call happens for each new match (doubles API calls but ensures accuracy)
- Pig score calculated once during ingestion and stored permanently

### Performance Considerations

- Timeline fetching doubles API calls for all new matches
- Rate limiting handled by existing system (priority vs batch queues)
- Pig score calculation done during match ingestion (calculate once, store forever)
- Database indexes on pig_score for fast sorting/filtering
- Update times will be approximately 2x longer due to timeline fetching, but ensures maximum accuracy

## Usage

### Calculating Pig Score
```typescript
import { calculatePigScore } from '@/lib/pig-score'

const pigScore = await calculatePigScore(
  participant,  // ParticipantData
  match,        // MatchData
  firstItem,    // number | undefined
  secondItem,   // number | undefined
  thirdItem     // number | undefined
)
```

### Querying Pig Scores
```typescript
// get matches sorted by pig score
const { data } = await supabase
  .from('summoner_matches')
  .select('*')
  .eq('puuid', playerPuuid)
  .order('pig_score', { ascending: false })
  .limit(20)

// get average pig score
const { data } = await supabase
  .from('summoner_matches')
  .select('pig_score')
  .eq('puuid', playerPuuid)
  .not('pig_score', 'is', null)
```

## Next Steps

1. Run database migration: `add_pig_score_system.sql`
2. Populate `aram_stats` table from `aram_stats_3_10_25.json` and `aram_champion_keystones.csv`:
   - Transform item data: Extract top 5 items per slot by pickrate
   - Transform keystone data: Extract top 5 keystones per champion by pickrate
   - Format as JSONB arrays: `[{id, wr, pr}, ...]`
   - Keystones include both id and name: `[{id, name, wr, pr}, ...]`
3. Test timeline fetching with sample profiles
4. Display pig scores in UI (MatchHistoryItem, profile stats)
5. Add pig score filtering and sorting options

## Scoring Philosophy

- **Average is 50**: Most players should score between 40-60 on average
- **Good is 65+**: Indicates strong decision-making and execution
- **Excellent is 80+**: Top-tier performance, optimal builds and gameplay
- **Perfect is 100**: Theoretical maximum, rarely achieved

The system prioritizes **objective metrics** (items, keystones) combined with **performance outcomes** (KDA, damage) to create a holistic skill rating that rewards both preparation and execution.
