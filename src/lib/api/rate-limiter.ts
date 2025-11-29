// Redis/memory rate limiter for Riot API calls
import { Redis } from '@upstash/redis'

// redis off by default locally, enabled in production/CI
const USE_REDIS = process.env.USE_REDIS_RATE_LIMIT === 'true'

const redis = USE_REDIS ? new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL || '').replace(/^["']|["']$/g, ''),
  token: (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, ''),
}) : null

// rate limit windows
const SHORT_WINDOW = 1 // seconds
const SHORT_LIMIT = 20 // requests per second
const LONG_WINDOW = 120 // seconds (2 minutes)
const LONG_LIMIT = 100 // requests per 2 minutes

// throttle percentage (0-100)
const THROTTLE_PERCENT = Math.min(100, Math.max(10, parseInt(process.env.SCRAPER_THROTTLE || '100', 10)))
const THROTTLED_LONG_LIMIT = Math.floor(LONG_LIMIT * THROTTLE_PERCENT / 100)

console.log(`[RATE LIMIT] Mode: ${USE_REDIS ? 'Redis (shared)' : 'In-memory (local)'}`)
console.log(`[RATE LIMIT] Throttle: ${THROTTLE_PERCENT}% (${THROTTLED_LONG_LIMIT} batch / ${LONG_LIMIT} total per 2min)`)

// reserve capacity for profile refreshes
const RESERVED_OVERHEAD_SHORT = 2
const RESERVED_OVERHEAD_LONG = 10

export type RequestType = 'overhead' | 'batch'

// ============================================================================
// LOCAL CACHE - reduces Redis calls
// ============================================================================

interface LocalCache {
  shortCount: number
  longCount: number
  shortExpiry: number
  longExpiry: number
  pendingIncrement: number
  lastSync: number
}

const localCache = new Map<string, LocalCache>()

const SYNC_EVERY_REQUESTS = 5
const SYNC_EVERY_MS = 2000

function getOrCreateCache(region: string): LocalCache {
  let cache = localCache.get(region)
  if (!cache) {
    cache = {
      shortCount: 0,
      longCount: 0,
      shortExpiry: Date.now() + SHORT_WINDOW * 1000,
      longExpiry: Date.now() + LONG_WINDOW * 1000,
      pendingIncrement: 0,
      lastSync: Date.now()
    }
    localCache.set(region, cache)
  }
  return cache
}

function resetExpiredWindows(cache: LocalCache): void {
  const now = Date.now()
  if (now >= cache.shortExpiry) {
    cache.shortCount = 0
    cache.shortExpiry = now + SHORT_WINDOW * 1000
  }
  if (now >= cache.longExpiry) {
    cache.longCount = 0
    cache.longExpiry = now + LONG_WINDOW * 1000
    cache.pendingIncrement = 0
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface RateLimitStatus {
  canProceed: boolean
  waitTime: number
  shortCount: number
  longCount: number
  estimatedRequestsRemaining: number
}

export async function checkRateLimit(region: string): Promise<RateLimitStatus> {
  if (!redis) {
    const cache = getOrCreateCache(region)
    resetExpiredWindows(cache)
    return {
      canProceed: cache.shortCount < SHORT_LIMIT && cache.longCount < LONG_LIMIT,
      waitTime: 0,
      shortCount: cache.shortCount,
      longCount: cache.longCount,
      estimatedRequestsRemaining: LONG_LIMIT - cache.longCount,
    }
  }

  const shortKey = `ratelimit:${region}:short`
  const longKey = `ratelimit:${region}:long`

  try {
    const pipeline = redis.pipeline()
    pipeline.get(shortKey)
    pipeline.get(longKey)
    const results = await pipeline.exec()
    
    const shortCount = Number(results[0] || 0)
    const longCount = Number(results[1] || 0)

    const cache = getOrCreateCache(region)
    cache.shortCount = shortCount
    cache.longCount = longCount
    cache.lastSync = Date.now()

    return {
      canProceed: shortCount < SHORT_LIMIT && longCount < LONG_LIMIT,
      waitTime: 0,
      shortCount,
      longCount,
      estimatedRequestsRemaining: LONG_LIMIT - longCount,
    }
  } catch (error) {
    console.error('[RATE LIMIT] Redis check error:', error)
    return {
      canProceed: true,
      waitTime: 0,
      shortCount: 0,
      longCount: 0,
      estimatedRequestsRemaining: LONG_LIMIT,
    }
  }
}

export async function waitForRateLimit(
  platformOrRegion: string, 
  requestType: RequestType = 'overhead', 
  maxWaitMs?: number
): Promise<void> {
  if (!redis) {
    return waitForRateLimitMemory(platformOrRegion, requestType, maxWaitMs)
  }
  return waitForRateLimitRedisOptimized(platformOrRegion, requestType, maxWaitMs)
}

// ============================================================================
// OPTIMIZED REDIS RATE LIMITING
// ============================================================================

async function waitForRateLimitRedisOptimized(
  region: string, 
  requestType: RequestType, 
  maxWaitMs?: number
): Promise<void> {
  if (!redis) throw new Error('Redis not initialized')

  const cache = getOrCreateCache(region)
  const now = Date.now()
  
  let effectiveShortLimit = SHORT_LIMIT
  let effectiveLongLimit = LONG_LIMIT
  if (requestType === 'batch') {
    effectiveShortLimit = SHORT_LIMIT - RESERVED_OVERHEAD_SHORT
    effectiveLongLimit = Math.min(THROTTLED_LONG_LIMIT, LONG_LIMIT - RESERVED_OVERHEAD_LONG)
  }

  const shouldSync = cache.pendingIncrement >= SYNC_EVERY_REQUESTS || 
                     (now - cache.lastSync) > SYNC_EVERY_MS ||
                     cache.longCount === 0

  if (shouldSync) {
    await syncWithRedis(region, cache)
  }

  resetExpiredWindows(cache)

  let waitTime = 0
  
  if (cache.shortCount >= effectiveShortLimit) {
    waitTime = Math.max(waitTime, cache.shortExpiry - now)
  }
  
  if (cache.longCount >= effectiveLongLimit) {
    waitTime = Math.max(waitTime, cache.longExpiry - now)
  }

  if (waitTime > 0) {
    await syncWithRedis(region, cache)
    resetExpiredWindows(cache)
    
    waitTime = 0
    if (cache.shortCount >= effectiveShortLimit) {
      waitTime = Math.max(waitTime, cache.shortExpiry - now)
    }
    if (cache.longCount >= effectiveLongLimit) {
      waitTime = Math.max(waitTime, cache.longExpiry - now)
    }
    
    if (waitTime > 0) {
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        throw new Error('TIMEOUT_EXCEEDED')
      }
      
      console.log(`[RATE LIMIT] Limit reached for ${region} (${cache.longCount}/${effectiveLongLimit}), waiting ${(waitTime/1000).toFixed(1)}s`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return waitForRateLimitRedisOptimized(region, requestType, maxWaitMs)
    }
  }

  cache.shortCount++
  cache.longCount++
  cache.pendingIncrement++

  if (cache.pendingIncrement >= SYNC_EVERY_REQUESTS) {
    syncWithRedis(region, cache).catch(err => {
      console.error('[RATE LIMIT] Background sync error:', err)
    })
  }
}

async function syncWithRedis(region: string, cache: LocalCache): Promise<void> {
  if (!redis) return

  const shortKey = `ratelimit:${region}:short`
  const longKey = `ratelimit:${region}:long`
  const pendingToSync = cache.pendingIncrement

  try {
    if (pendingToSync > 0) {
      const pipeline = redis.pipeline()
      pipeline.incrby(shortKey, pendingToSync)
      pipeline.incrby(longKey, pendingToSync)
      pipeline.ttl(shortKey)
      pipeline.ttl(longKey)
      const results = await pipeline.exec()
      
      cache.shortCount = Number(results[0] || 0)
      cache.longCount = Number(results[1] || 0)
      
      const shortTtl = Number(results[2])
      const longTtl = Number(results[3])
      
      if (shortTtl < 0) {
        await redis.expire(shortKey, SHORT_WINDOW)
        cache.shortExpiry = Date.now() + SHORT_WINDOW * 1000
      } else if (shortTtl > 0) {
        cache.shortExpiry = Date.now() + shortTtl * 1000
      }
      
      if (longTtl < 0) {
        await redis.expire(longKey, LONG_WINDOW)
        cache.longExpiry = Date.now() + LONG_WINDOW * 1000
      } else if (longTtl > 0) {
        cache.longExpiry = Date.now() + longTtl * 1000
      }
    } else {
      const pipeline = redis.pipeline()
      pipeline.get(shortKey)
      pipeline.get(longKey)
      pipeline.ttl(shortKey)
      pipeline.ttl(longKey)
      const results = await pipeline.exec()
      
      cache.shortCount = Number(results[0] || 0)
      cache.longCount = Number(results[1] || 0)
      
      const shortTtl = Number(results[2])
      const longTtl = Number(results[3])
      
      if (shortTtl > 0) {
        cache.shortExpiry = Date.now() + shortTtl * 1000
      }
      if (longTtl > 0) {
        cache.longExpiry = Date.now() + longTtl * 1000
      }
    }
    
    cache.pendingIncrement = 0
    cache.lastSync = Date.now()
  } catch (error) {
    console.error('[RATE LIMIT] Redis sync error:', error)
  }
}

// ============================================================================
// IN-MEMORY RATE LIMITING
// ============================================================================

const rateLimitLocks = new Map<string, Promise<void>>()

async function waitForRateLimitMemory(
  region: string, 
  requestType: RequestType, 
  maxWaitMs?: number
): Promise<void> {
  while (rateLimitLocks.has(region)) {
    await rateLimitLocks.get(region)
  }
  
  let releaseLock: () => void
  const lockPromise = new Promise<void>(resolve => { releaseLock = resolve })
  rateLimitLocks.set(region, lockPromise)
  
  try {
    const cache = getOrCreateCache(region)
    resetExpiredWindows(cache)
    
    let effectiveShortLimit = SHORT_LIMIT
    let effectiveLongLimit = LONG_LIMIT
    if (requestType === 'batch') {
      effectiveShortLimit = SHORT_LIMIT - RESERVED_OVERHEAD_SHORT
      effectiveLongLimit = Math.min(THROTTLED_LONG_LIMIT, LONG_LIMIT - RESERVED_OVERHEAD_LONG)
    }
    
    const now = Date.now()
    let waitTime = 0
    
    if (cache.shortCount >= effectiveShortLimit) {
      waitTime = Math.max(waitTime, cache.shortExpiry - now)
    }
    if (cache.longCount >= effectiveLongLimit) {
      waitTime = Math.max(waitTime, cache.longExpiry - now)
    }
    
    if (waitTime > 0) {
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        throw new Error('TIMEOUT_EXCEEDED')
      }
      
      if (waitTime > 1000) {
        console.log(`[RATE LIMIT] Limit reached for ${region} (${cache.longCount}/${effectiveLongLimit}), waiting ${(waitTime/1000).toFixed(1)}s`)
      }
      
      rateLimitLocks.delete(region)
      releaseLock!()
      
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return waitForRateLimitMemory(region, requestType, maxWaitMs)
    }
    
    cache.shortCount++
    cache.longCount++
  } finally {
    rateLimitLocks.delete(region)
    releaseLock!()
  }
}

// ============================================================================
// FLUSH PENDING
// ============================================================================

export async function flushRateLimits(): Promise<void> {
  if (!redis) return
  
  const flushPromises: Promise<void>[] = []
  for (const [region, cache] of localCache.entries()) {
    if (cache.pendingIncrement > 0) {
      flushPromises.push(syncWithRedis(region, cache))
    }
  }
  
  if (flushPromises.length > 0) {
    await Promise.all(flushPromises)
    console.log(`[RATE LIMIT] Flushed pending increments for ${flushPromises.length} regions`)
  }
}
