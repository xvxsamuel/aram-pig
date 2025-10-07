import { Redis } from '@upstash/redis';

// initialize redis client with supabase redis credentials
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// riot api rate limits per region
const SHORT_WINDOW = 1; // 1 second
const SHORT_LIMIT = 20; // 20 requests per second
const LONG_WINDOW = 120; // 2 minutes
const LONG_LIMIT = 100; // 100 requests per 2 minutes

export async function waitForRateLimit(region: string): Promise<void> {
  const now = Date.now();
  const shortKey = `ratelimit:${region}:short`;
  const longKey = `ratelimit:${region}:long`;

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

    if (shortCount > SHORT_LIMIT) {
      const ttl = await redis.ttl(shortKey);
      waitTime = Math.max(waitTime, ttl * 1000);
    }

    if (longCount > LONG_LIMIT) {
      const ttl = await redis.ttl(longKey);
      waitTime = Math.max(waitTime, ttl * 1000);
    }

    // wait if necessary
    if (waitTime > 0) {
      console.log(`Rate limit hit for ${region}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // retry after waiting
      return waitForRateLimit(region);
    }
  } catch (error) {
    console.error('Redis rate limiter error:', error);
    // fallback: continue without rate limiting if redis fails
  }
}
