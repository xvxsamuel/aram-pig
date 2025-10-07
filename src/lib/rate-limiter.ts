import { Redis } from '@upstash/redis';

// initialize redis client with supabase redis credentials
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// riot api rate limits per region cluster
const SHORT_WINDOW = 1; // 1 second
const SHORT_LIMIT = 20; // 20 requests per second
const LONG_WINDOW = 120; // 2 minutes
const LONG_LIMIT = 100; // 100 requests per 2 minutes

// capacity allocation:
// - overhead (summoner lookups, account data): 5 req/sec, 25 req/2min (browsing + job setup)
// - priority queue (<=10 matches): 2 req/sec, 10 req/2min (fast small updates)
// - batch queue (>10 matches): 12 req/sec, 60 req/2min (bulk fetching)
// - buffer (safety margin): 1 req/sec, 5 req/2min (never used, prevents 429s)

const OVERHEAD_SHORT = 5;
const OVERHEAD_LONG = 25;

const PRIORITY_SHORT = 2;
const PRIORITY_LONG = 10;

const BATCH_SHORT = 12;
const BATCH_LONG = 60;

const BUFFER_SHORT = 1; // never use, keeps us safe from 429s
const BUFFER_LONG = 5;

export type RequestType = 'overhead' | 'priority' | 'batch';

interface RateLimitStatus {
  canProceed: boolean;
  waitTime: number; // milliseconds to wait
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

export async function waitForRateLimit(region: string, requestType: RequestType = 'overhead'): Promise<void> {
  const shortKey = `ratelimit:${region}:${requestType}:short`;
  const longKey = `ratelimit:${region}:${requestType}:long`;

  // get limits based on request type
  let shortLimit: number;
  let longLimit: number;

  switch (requestType) {
    case 'overhead':
      shortLimit = OVERHEAD_SHORT;
      longLimit = OVERHEAD_LONG;
      break;
    case 'priority':
      shortLimit = PRIORITY_SHORT;
      longLimit = PRIORITY_LONG;
      break;
    case 'batch':
      shortLimit = BATCH_SHORT;
      longLimit = BATCH_LONG;
      break;
  }

  try {
    // increment counters for both windows
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

    // check if limits exceeded
    let waitTime = 0;

    if (shortCount > shortLimit) {
      const ttl = await redis.ttl(shortKey);
      waitTime = Math.max(waitTime, ttl * 1000);
    }

    if (longCount > longLimit) {
      const ttl = await redis.ttl(longKey);
      waitTime = Math.max(waitTime, ttl * 1000);
    }

    // wait if necessary
    if (waitTime > 0) {
      console.log(`rate limit hit for ${region} (${requestType}), waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // retry after waiting
      return waitForRateLimit(region, requestType);
    }
  } catch (error) {
    console.error('redis rate limiter error:', error);
    // fallback: continue without rate limiting if redis fails
  }
}
