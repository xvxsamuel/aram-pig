<p align="center">
  <img src="public/title.svg" alt="ARAM PIG" width="400">
</p>

# ARAM PIG

A stats tracking and analysis tool for the League of Legends ARAM (All Random All Mid) game mode.

## About

ARAM PIG provides detailed statistics, build recommendations, and performance tracking specifically tailored for ARAM players. Unlike other stat sites that focus primarily on Summoner's Rift, this tool serves to provide ARAM sweats valuable and actionable data to take their gameplay to the next level.

## Features

### Summoner Profiles

Search for any summoner to view their ARAM match history, performance metrics, and trends over time. Track win rates, KDA, and overall performance in ARAM, using our PIG Score system.

### PIG Score

A custom performance metric that evaluates player contribution beyond simple KDA. Accounting for many ARAM-specific statistics, the PIG Score compares player performance with comprehensive data about builds, damage, and more. Users can then see their PIG analysis and see which parts of their gameplay could be improved.

### Champion Statistics

ARAMPig also allows users to browse comprehensive statistics for all champions in ARAM, including:

- Win rates and pick rates
- Optimal rune configurations
- Recommended item builds and build orders
- Popular core build and rune combinations
- Ability leveling sequences
- Starter item choices

### Match History

Detailed match breakdowns showing team compositions, item builds, damage graphs, and individual performance ratings for each game.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Supabase (PostgreSQL)
- Riot Games API
- Tailwind CSS

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run the match scraper
npm run scraper

# Refresh static champion/item data
npm run fetch-items
```

## Environment Variables

Required environment variables in `.env.local`:

```bash
RIOT_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
```

## License

This project is not affiliated with Riot Games.

ARAM PIG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
