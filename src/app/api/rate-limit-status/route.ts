import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/riot/rate-limiter';
import { createAdminClient } from '@/lib/db';

// batch: 14 req/sec, 70 req/2min (all profile updates)
const BATCH_CAPACITY = { short: 14, long: 70 };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'americas';
    const matchCount = parseInt(searchParams.get('matchCount') || '0');

    const status = await checkRateLimit(region);

    // check for active jobs to determine queue load
    const supabase = createAdminClient();
    const { data: activeJobs } = await supabase
      .from('update_jobs')
      .select('total_matches, fetched_matches')
      .in('status', ['pending', 'processing']);

    // all jobs use batch queue
    let batchPending = 0;
    
    activeJobs?.forEach(job => {
      const remaining = job.total_matches - job.fetched_matches;
      batchPending += remaining;
    });

    // calculate eta based on batch queue capacity
    let etaSeconds = 0;
    if (matchCount > 0) {
      const requestsNeeded = matchCount + 1; // +1 for initial match list fetch
      
      // total requests for batch queue
      const totalRequests = batchPending + requestsNeeded;
      
      // calculate eta based on queue-specific capacity
      // use the more restrictive of short/long limits
      const shortLimitTime = Math.ceil(totalRequests / BATCH_CAPACITY.short); // seconds
      const longLimitTime = Math.ceil(totalRequests / BATCH_CAPACITY.long) * 120; // seconds
      
      etaSeconds = Math.max(shortLimitTime, longLimitTime);
      
      // add current wait time if rate limited
      if (!status.canProceed) {
        etaSeconds += Math.ceil(status.waitTime / 1000);
      }
    }

    const totalPending = batchPending;
    const _queueType = 'batch';

    return NextResponse.json({
      canProceed: status.canProceed,
      waitTime: status.waitTime,
      shortCount: status.shortCount,
      longCount: status.longCount,
      estimatedRequestsRemaining: status.estimatedRequestsRemaining,
      priorityPending: 0,
      batchPending,
      totalPending,
      etaSeconds,
      message: status.canProceed 
        ? totalPending > 0 
          ? `${totalPending} requests ahead`
          : 'Ready to process'
        : `Rate limit hit, wait ${Math.ceil(status.waitTime / 1000)}s`
    });
  } catch (error) {
    console.error('Rate limit status error:', error);
    return NextResponse.json(
      { error: 'Failed to check rate limit status' },
      { status: 500 }
    );
  }
}
