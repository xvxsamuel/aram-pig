import { Redis } from '@upstash/redis';

// redis off by default
const USE_REDIS = process.env.USE_REDIS_RATE_LIMIT === 'true';

const redis = USE_REDIS ? new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL || '').replace(/^["']|["']$/g, ''),
  token: (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, ''),
}) : null;

if (!USE_REDIS) {
  console.log('Using in-memory rate limiting')
} else {
  console.log('Using Redis for distributed rate limiting')
}

// fallback defaults
const SHORT_WINDOW = 1; //secs
const SHORT_LIMIT = 20; // requests
const LONG_WINDOW = 120;
const LONG_LIMIT = 100;

// reserve small capacity for profile refreshes
const RESERVED_OVERHEAD_SHORT = 2;
const RESERVED_OVERHEAD_LONG = 10;

export type RequestType = 'overhead' | 'batch';

// in-memory rate limiting
const memoryLimits = new Map<string, { short: number; long: number; shortExpiry: number; longExpiry: number }>();

interface RateLimitStatus {
  canProceed: boolean;
  waitTime: number; // ms
  shortCount: number;
  longCount: number;
  estimatedRequestsRemaining: number;
}

export async function checkRateLimit(region: string): Promise<RateLimitStatus> {
  // use in-memory if redis is disabled
  if (!redis) {
    const limits = memoryLimits.get(region) || { short: 0, long: 0, shortExpiry: Date.now(), longExpiry: Date.now() };
    return {
      canProceed: limits.short < SHORT_LIMIT && limits.long < LONG_LIMIT,
      waitTime: 0,
      shortCount: limits.short,
      longCount: limits.long,
      estimatedRequestsRemaining: Math.min(SHORT_LIMIT - limits.short, LONG_LIMIT - limits.long),
    };
  }

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


export async function waitForRateLimit(platformOrRegion: string, requestType: RequestType = 'overhead', maxWaitMs?: number): Promise<void> {
  if (!redis) {
    return waitForRateLimitMemory(platformOrRegion, requestType, maxWaitMs);
  }
  
  return waitForRateLimitRedis(platformOrRegion, requestType, maxWaitMs);
}

// redis rate limiting
async function waitForRateLimitRedis(platformOrRegion: string, requestType: RequestType, maxWaitMs?: number): Promise<void> {
  if (!redis) {
    throw new Error('Redis is not initialized');
  }
  
  const shortKey = `ratelimit:${platformOrRegion}:short`;
  const longKey = `ratelimit:${platformOrRegion}:long`;

  try {
    // use pipelined Redis commands to reduce round trips
    const pipeline = redis.pipeline();
    pipeline.get(shortKey);
    pipeline.get(longKey);
    const results = await pipeline.exec();
    
    const currentShort = Number(results[0] || 0);
    const currentLong = Number(results[1] || 0);

    // calculate effective limits based on request type
    let effectiveShortLimit = SHORT_LIMIT;
    let effectiveLongLimit = LONG_LIMIT;
    
    if (requestType === 'batch') {
      // batch requests cannot use reserved capacity
      effectiveShortLimit = SHORT_LIMIT - RESERVED_OVERHEAD_SHORT;
      effectiveLongLimit = LONG_LIMIT - RESERVED_OVERHEAD_LONG;
    }
    // overhead requests can use full capacity (including reserved)

    // check if we need to wait
    let waitTime = 0;

    if (currentShort >= effectiveShortLimit) {
      const ttl = await redis.ttl(shortKey);
      if (ttl > 0) {
        waitTime = Math.max(waitTime, ttl * 1000);
      } else if (ttl < 0) {
        await redis.del(shortKey);
      }
    }

    if (currentLong >= effectiveLongLimit) {
      const ttl = await redis.ttl(longKey);
      if (ttl > 0) {
        waitTime = Math.max(waitTime, ttl * 1000);
      } else if (ttl < 0) {
        await redis.del(longKey);
      }
    }

    // wait if necessary
    if (waitTime > 0) {
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        throw new Error('TIMEOUT_EXCEEDED');
      }
      
      console.log(`Rate limit hit for ${platformOrRegion} (${requestType}), waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return waitForRateLimitRedis(platformOrRegion, requestType, maxWaitMs);
    }

    // increment counters using pipeline for atomicity and speed
    const incrPipeline = redis.pipeline();
    incrPipeline.incr(shortKey);
    incrPipeline.incr(longKey);
    const incrResults = await incrPipeline.exec();
    
    const shortCount = Number(incrResults[0]);
    const longCount = Number(incrResults[1]);

    // set expiry on first request (use pipeline for efficiency)
    if (shortCount === 1 || longCount === 1) {
      const expirePipeline = redis.pipeline();
      if (shortCount === 1) {
        expirePipeline.expire(shortKey, SHORT_WINDOW);
      }
      if (longCount === 1) {
        expirePipeline.expire(longKey, LONG_WINDOW);
      }
      await expirePipeline.exec();
    }
  } catch (error) {
    console.error('Redis rate limiter error:', error);
    // fallback: continue without rate limiting if redis fails
  }
}

// In-memory rate limiting (for local scraper - no Redis costs)
// Use a lock to prevent race conditions with parallel requests
const rateLimitLocks = new Map<string, Promise<void>>();

async function waitForRateLimitMemory(platformOrRegion: string, requestType: RequestType = 'overhead', maxWaitMs?: number): Promise<void> {
  // Wait for any existing lock for this region
  while (rateLimitLocks.has(platformOrRegion)) {
    await rateLimitLocks.get(platformOrRegion);
  }
  
  // Create our lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>(resolve => { releaseLock = resolve; });
  rateLimitLocks.set(platformOrRegion, lockPromise);
  
  try {
    const now = Date.now();
    
    // Get or initialize limits for this region
    let limits = memoryLimits.get(platformOrRegion);
    if (!limits) {
      limits = { short: 0, long: 0, shortExpiry: now, longExpiry: now };
      memoryLimits.set(platformOrRegion, limits);
    }
    
    // Reset counters if windows have expired
    if (now >= limits.shortExpiry) {
      limits.short = 0;
      limits.shortExpiry = now + (SHORT_WINDOW * 1000);
    }
    if (now >= limits.longExpiry) {
      limits.long = 0;
      limits.longExpiry = now + (LONG_WINDOW * 1000);
    }
    
    // Calculate effective limits based on request type
    let effectiveShortLimit = SHORT_LIMIT;
    let effectiveLongLimit = LONG_LIMIT;
    
    if (requestType === 'batch') {
      effectiveShortLimit = SHORT_LIMIT - RESERVED_OVERHEAD_SHORT;
      effectiveLongLimit = LONG_LIMIT - RESERVED_OVERHEAD_LONG;
    }
    
    // Check if we need to wait
    let waitTime = 0;
    
    if (limits.short >= effectiveShortLimit) {
      waitTime = Math.max(waitTime, limits.shortExpiry - now);
    }
    
    if (limits.long >= effectiveLongLimit) {
      waitTime = Math.max(waitTime, limits.longExpiry - now);
    }
    
    // Wait if necessary (release lock first so others can also wait)
    if (waitTime > 0) {
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        throw new Error('TIMEOUT_EXCEEDED');
      }
      
      // Only log if waiting more than 1 second to reduce spam
      if (waitTime > 1000) {
        console.log(`Rate limit hit for ${platformOrRegion} (${requestType}), waiting ${(waitTime/1000).toFixed(1)}s`);
      }
      
      rateLimitLocks.delete(platformOrRegion);
      releaseLock!();
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return waitForRateLimitMemory(platformOrRegion, requestType, maxWaitMs);
    }
    
    // Increment counters atomically
    limits.short++;
    limits.long++;
  } finally {
    // Always release the lock
    rateLimitLocks.delete(platformOrRegion);
    releaseLock!();
  }
}
