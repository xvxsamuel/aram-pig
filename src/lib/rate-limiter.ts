import { Redis } from '@upstash/redis';

// initialize redis client with supabase redis credentials
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// riot api rate limits per platform/region
// per https://developer.riotgames.com/docs/lol#routing-values_platform-routing-values
// each platform (br1, euw1, na1, etc.) has separate rate limits
// regional endpoints (americas, europe, asia, sea) also have separate rate limits
const SHORT_WINDOW = 1; // 1 second
const SHORT_LIMIT = 20; // 20 requests per second
const LONG_WINDOW = 120; // 2 minutes
const LONG_LIMIT = 100; // 100 requests per 2 minutes

// capacity allocation:
// - overhead (summoner lookups, viewing profiles): 5 req/sec, 25 req/2min (browsing existing data)
// - batch (all profile updates, scraper, bulk operations): 14 req/sec, 70 req/2min (main workload)
// - buffer (safety margin): 1 req/sec, 5 req/2min (never used, prevents 429s)

const OVERHEAD_SHORT = 5;
const OVERHEAD_LONG = 25;

const BATCH_SHORT = 14;
const BATCH_LONG = 70;

const BUFFER_SHORT = 1; // never use
const BUFFER_LONG = 5;

export type RequestType = 'overhead' | 'batch';

interface RateLimitStatus {
  canProceed: boolean;
  waitTime: number; // ms
  shortCount: number;
  longCount: number;
  estimatedRequestsRemaining: number;
}

export async function checkRateLimit(region: string): Promise<RateLimitStatus> {
  const shortKey = `ratelimit:${region}:short`;
  const longKey = `ratelimit:${region}:long`;

  try {
    const [shortCount, longCount] = await Promise.all([
      redis.get(shortKey) || 0,
      redis.get(longKey) || 0,
    ]);

    const shortCountNum = Number(shortCount);
    const longCountNum = Number(longCount);

    let waitTime = 0;

    if (shortCountNum >= SHORT_LIMIT) {
      const ttl = await redis.ttl(shortKey);
      waitTime = Math.max(waitTime, ttl * 1000);
    }

    if (longCountNum >= LONG_LIMIT) {
      const ttl = await redis.ttl(longKey);
      waitTime = Math.max(waitTime, ttl * 1000);
    }

    return {
      canProceed: waitTime === 0,
      waitTime,
      shortCount: shortCountNum,
      longCount: longCountNum,
      estimatedRequestsRemaining: Math.min(
        SHORT_LIMIT - shortCountNum,
        LONG_LIMIT - longCountNum
      ),
    };
  } catch (error) {
    console.error('Redis rate limit check error:', error);
    return {
      canProceed: true,
      waitTime: 0,
      shortCount: 0,
      longCount: 0,
      estimatedRequestsRemaining: SHORT_LIMIT,
    };
  }
}

// accepts either platform code (na1, euw1, etc.) or regional cluster (americas, europe, etc.)
// maxWaitMs: if provided, will throw an error instead of waiting longer than this duration
export async function waitForRateLimit(platformOrRegion: string, requestType: RequestType = 'overhead', maxWaitMs?: number): Promise<void> {
  // each platform has its own rate limits per Riot API docs
  // https://developer.riotgames.com/docs/lol#routing-values_platform-routing-values
  const shortKey = `ratelimit:${platformOrRegion}:${requestType}:short`;
  const longKey = `ratelimit:${platformOrRegion}:${requestType}:long`;

  // get limits based on request type
  let shortLimit: number;
  let longLimit: number;

  switch (requestType) {
    case 'overhead':
      shortLimit = OVERHEAD_SHORT;
      longLimit = OVERHEAD_LONG;
      break;
    case 'batch':
      shortLimit = BATCH_SHORT;
      longLimit = BATCH_LONG;
      break;
  }

  try {
    // check current counts BEFORE incrementing
    const [currentShort, currentLong] = await Promise.all([
      redis.get(shortKey).then(v => Number(v) || 0),
      redis.get(longKey).then(v => Number(v) || 0),
    ]);

    // if we're at or over the limit, wait
    let waitTime = 0;

    if (currentShort >= shortLimit) {
      const ttl = await redis.ttl(shortKey);
      // if TTL is -1 (no expiry) or -2 (key doesn't exist), reset the key
      if (ttl < 0) {
        await redis.del(shortKey);
      } else if (ttl > 0) {
        waitTime = Math.max(waitTime, ttl * 1000);
      }
    }

    if (currentLong >= longLimit) {
      const ttl = await redis.ttl(longKey);
      // if TTL is -1 (no expiry) or -2 (key doesn't exist), reset the key
      if (ttl < 0) {
        await redis.del(longKey);
      } else if (ttl > 0) {
        waitTime = Math.max(waitTime, ttl * 1000);
      }
    }

    // wait if necessary
    if (waitTime > 0) {
      // check if wait time exceeds max wait
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        // silently skip - timeout exceeded is expected behavior for cron jobs
        throw new Error('TIMEOUT_EXCEEDED');
      }
      
      console.log(`Rate limit hit for ${platformOrRegion} (${requestType}), waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // retry after waiting (pass through maxWaitMs)
      return waitForRateLimit(platformOrRegion, requestType, maxWaitMs);
    }

    // NOW increment counters after checking limits
    const [shortCount, longCount] = await Promise.all([
      redis.incr(shortKey),
      redis.incr(longKey),
    ]);

    // set expiry on first request
    if (shortCount === 1) {
      await redis.expire(shortKey, SHORT_WINDOW);
    }
    if (longCount === 1) {
      await redis.expire(longKey, LONG_WINDOW);
    }
  } catch (error) {
    console.error('Redis rate limiter error:', error);
    // fallback: continue without rate limiting if redis fails
  }
}
