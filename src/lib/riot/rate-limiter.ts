// Redis/memory rate limiter for Riot API calls (server-only)
import { Redis } from '@upstash/redis'

// redis off by default locally, enabled in production/CI
const USE_REDIS = process.env.USE_REDIS_RATE_LIMIT === 'true'

const redis = USE_REDIS
  ? new Redis({
      url: (process.env.UPSTASH_REDIS_REST_URL || '').replace(/^["']|["']$/g, ''),
      token: (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, ''),
    })
  : null

// Riot API Rate Limits (per region per application)
// Source: https://hextechdocs.dev/rate-limiting/
// Application rate limits apply PER REGION - each region has independent counters
// Method rate limits also apply PER REGION and PER METHOD
// A single request counts against BOTH application and method limits simultaneously
const SHORT_WINDOW = 1 // seconds
const SHORT_LIMIT = 20 // requests per second (application-wide per region)
const LONG_WINDOW = 120 // seconds (2 minutes)
const LONG_LIMIT = 100 // requests per 2 minutes (application-wide per region)

// throttle percentage (0-100)
const THROTTLE_PERCENT = Math.min(100, Math.max(10, parseInt(process.env.SCRAPER_THROTTLE || '100', 10)))
const THROTTLED_LONG_LIMIT = Math.floor((LONG_LIMIT * THROTTLE_PERCENT) / 100)

console.log(`[RATE LIMIT] Mode: ${USE_REDIS ? 'Redis (shared)' : 'In-memory (local)'}`)
console.log(
  `[RATE LIMIT] Throttle: ${THROTTLE_PERCENT}% (${THROTTLED_LONG_LIMIT} batch / ${LONG_LIMIT} total per 2min)`
)

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
      lastSync: Date.now(),
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
  maxWaitMs?: number,
  method?: 'account' | 'summoner' | 'match-list' | 'match-detail' | 'timeline'
): Promise<void> {
  // Riot API has TWO types of rate limits:
  // 1. Application rate limit: PER REGION, shared across ALL methods (20/sec, 100/2min)
  // 2. Method rate limit: PER REGION PER METHOD (varies by endpoint)
  //
  // IMPORTANT: Rate limits are COMPLETELY INDEPENDENT per region!
  // - na1 has its own 100/2min limit
  // - euw1 has its own separate 100/2min limit
  // - Each method (summoner, match-list, etc.) also has per-region limits
  //
  // A single request counts against BOTH app + method limits simultaneously
  // We track both limits and wait for whichever is more restrictive
  
  const appKey = platformOrRegion // e.g., 'na1', 'euw1', 'americas', 'europe'
  const methodKey = method ? `${platformOrRegion}:${method}` : null // e.g., 'na1:match-list'
  
  if (!redis) {
    await waitForRateLimitMemoryDual(appKey, methodKey, requestType, maxWaitMs)
  } else {
    await waitForRateLimitRedisDual(appKey, methodKey, requestType, maxWaitMs)
  }
}

// ============================================================================
// OPTIMIZED REDIS RATE LIMITING (DUAL-TRACKING)
// ============================================================================

async function waitForRateLimitRedisDual(
  appKey: string,
  methodKey: string | null,
  requestType: RequestType,
  maxWaitMs?: number
): Promise<void> {
  if (!redis) throw new Error('Redis not initialized')

  const appCache = getOrCreateCache(appKey)
  const methodCache = methodKey ? getOrCreateCache(methodKey) : null
  const now = Date.now()

  let effectiveShortLimit = SHORT_LIMIT
  let effectiveLongLimit = LONG_LIMIT
  if (requestType === 'batch') {
    effectiveShortLimit = SHORT_LIMIT - RESERVED_OVERHEAD_SHORT
    effectiveLongLimit = Math.min(THROTTLED_LONG_LIMIT, LONG_LIMIT - RESERVED_OVERHEAD_LONG)
  }

  // Sync both caches if needed
  const shouldSyncApp =
    appCache.pendingIncrement >= SYNC_EVERY_REQUESTS || now - appCache.lastSync > SYNC_EVERY_MS || appCache.longCount === 0
  const shouldSyncMethod =
    methodCache && (methodCache.pendingIncrement >= SYNC_EVERY_REQUESTS || now - methodCache.lastSync > SYNC_EVERY_MS || methodCache.longCount === 0)

  if (shouldSyncApp) await syncWithRedis(appKey, appCache)
  if (shouldSyncMethod) await syncWithRedis(methodKey!, methodCache!)

  resetExpiredWindows(appCache)
  if (methodCache) resetExpiredWindows(methodCache)

  // Calculate wait time for BOTH limits (take the maximum)
  let waitTime = 0

  if (appCache.shortCount >= effectiveShortLimit) {
    waitTime = Math.max(waitTime, appCache.shortExpiry - now)
  }
  if (appCache.longCount >= effectiveLongLimit) {
    waitTime = Math.max(waitTime, appCache.longExpiry - now)
  }

  if (methodCache) {
    if (methodCache.shortCount >= effectiveShortLimit) {
      waitTime = Math.max(waitTime, methodCache.shortExpiry - now)
    }
    if (methodCache.longCount >= effectiveLongLimit) {
      waitTime = Math.max(waitTime, methodCache.longExpiry - now)
    }
  }

  if (waitTime > 0) {
    // Re-sync to get latest counts
    await syncWithRedis(appKey, appCache)
    if (methodCache) await syncWithRedis(methodKey!, methodCache!)
    
    resetExpiredWindows(appCache)
    if (methodCache) resetExpiredWindows(methodCache)

    // Recalculate wait time
    waitTime = 0
    if (appCache.shortCount >= effectiveShortLimit) {
      waitTime = Math.max(waitTime, appCache.shortExpiry - now)
    }
    if (appCache.longCount >= effectiveLongLimit) {
      waitTime = Math.max(waitTime, appCache.longExpiry - now)
    }
    if (methodCache) {
      if (methodCache.shortCount >= effectiveShortLimit) {
        waitTime = Math.max(waitTime, methodCache.shortExpiry - now)
      }
      if (methodCache.longCount >= effectiveLongLimit) {
        waitTime = Math.max(waitTime, methodCache.longExpiry - now)
      }
    }

    if (waitTime > 0) {
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        throw new Error('TIMEOUT_EXCEEDED')
      }

      const limitLabel = methodKey || appKey
      console.log(
        `[RATE LIMIT] Limit reached for ${limitLabel} (app:${appCache.longCount}/${effectiveLongLimit}${methodCache ? `, method:${methodCache.longCount}/${effectiveLongLimit}` : ''}), waiting ${(waitTime / 1000).toFixed(1)}s`
      )
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return waitForRateLimitRedisDual(appKey, methodKey, requestType, maxWaitMs)
    }
  }

  // Increment BOTH counters (same request counts against both limits)
  appCache.shortCount++
  appCache.longCount++
  appCache.pendingIncrement++

  if (methodCache) {
    methodCache.shortCount++
    methodCache.longCount++
    methodCache.pendingIncrement++
  }

  // Background sync if needed
  if (appCache.pendingIncrement >= SYNC_EVERY_REQUESTS) {
    syncWithRedis(appKey, appCache).catch(err => {
      console.error('[RATE LIMIT] Background sync error (app):', err)
    })
  }
  if (methodCache && methodCache.pendingIncrement >= SYNC_EVERY_REQUESTS) {
    syncWithRedis(methodKey!, methodCache).catch(err => {
      console.error('[RATE LIMIT] Background sync error (method):', err)
    })
  }
}

// ============================================================================
// OPTIMIZED REDIS RATE LIMITING (SINGLE KEY - LEGACY)
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

  const shouldSync =
    cache.pendingIncrement >= SYNC_EVERY_REQUESTS || now - cache.lastSync > SYNC_EVERY_MS || cache.longCount === 0

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

      console.log(
        `[RATE LIMIT] Limit reached for ${region} (${cache.longCount}/${effectiveLongLimit}), waiting ${(waitTime / 1000).toFixed(1)}s`
      )
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
// IN-MEMORY RATE LIMITING (DUAL-TRACKING)
// ============================================================================

const rateLimitLocks = new Map<string, Promise<void>>()

async function waitForRateLimitMemoryDual(
  appKey: string,
  methodKey: string | null,
  requestType: RequestType,
  maxWaitMs?: number
): Promise<void> {
  // Lock on the app key to prevent race conditions
  while (rateLimitLocks.has(appKey)) {
    await rateLimitLocks.get(appKey)
  }

  let releaseLock: () => void
  const lockPromise = new Promise<void>(resolve => {
    releaseLock = resolve
  })
  rateLimitLocks.set(appKey, lockPromise)

  try {
    const appCache = getOrCreateCache(appKey)
    const methodCache = methodKey ? getOrCreateCache(methodKey) : null
    
    resetExpiredWindows(appCache)
    if (methodCache) resetExpiredWindows(methodCache)

    let effectiveShortLimit = SHORT_LIMIT
    let effectiveLongLimit = LONG_LIMIT
    if (requestType === 'batch') {
      effectiveShortLimit = SHORT_LIMIT - RESERVED_OVERHEAD_SHORT
      effectiveLongLimit = Math.min(THROTTLED_LONG_LIMIT, LONG_LIMIT - RESERVED_OVERHEAD_LONG)
    }

    const now = Date.now()
    let waitTime = 0

    // Check BOTH limits, take the maximum wait time
    if (appCache.shortCount >= effectiveShortLimit) {
      waitTime = Math.max(waitTime, appCache.shortExpiry - now)
    }
    if (appCache.longCount >= effectiveLongLimit) {
      waitTime = Math.max(waitTime, appCache.longExpiry - now)
    }

    if (methodCache) {
      if (methodCache.shortCount >= effectiveShortLimit) {
        waitTime = Math.max(waitTime, methodCache.shortExpiry - now)
      }
      if (methodCache.longCount >= effectiveLongLimit) {
        waitTime = Math.max(waitTime, methodCache.longExpiry - now)
      }
    }

    if (waitTime > 0) {
      if (maxWaitMs !== undefined && waitTime > maxWaitMs) {
        throw new Error('TIMEOUT_EXCEEDED')
      }

      if (waitTime > 1000) {
        const limitLabel = methodKey || appKey
        console.log(
          `[RATE LIMIT] Limit reached for ${limitLabel} (app:${appCache.longCount}/${effectiveLongLimit}${methodCache ? `, method:${methodCache.longCount}/${effectiveLongLimit}` : ''}), waiting ${(waitTime / 1000).toFixed(1)}s`
        )
      }

      rateLimitLocks.delete(appKey)
      releaseLock!()

      await new Promise(resolve => setTimeout(resolve, waitTime))
      return waitForRateLimitMemoryDual(appKey, methodKey, requestType, maxWaitMs)
    }

    // Increment BOTH counters
    appCache.shortCount++
    appCache.longCount++

    if (methodCache) {
      methodCache.shortCount++
      methodCache.longCount++
    }
  } finally {
    rateLimitLocks.delete(appKey)
    releaseLock!()
  }
}

// ============================================================================
// IN-MEMORY RATE LIMITING (SINGLE KEY - LEGACY)
// ============================================================================

async function waitForRateLimitMemory(region: string, requestType: RequestType, maxWaitMs?: number): Promise<void> {
  while (rateLimitLocks.has(region)) {
    await rateLimitLocks.get(region)
  }

  let releaseLock: () => void
  const lockPromise = new Promise<void>(resolve => {
    releaseLock = resolve
  })
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
        console.log(
          `[RATE LIMIT] Limit reached for ${region} (${cache.longCount}/${effectiveLongLimit}), waiting ${(waitTime / 1000).toFixed(1)}s`
        )
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
