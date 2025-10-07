import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../lib/rate-limiter';
import { createAdminClient } from '../../../lib/supabase';

// capacity per region cluster (req/sec, req/2min)
// priority (<=10 matches): 2 req/sec, 10 req/2min
// batch (>10 matches): 12 req/sec, 60 req/2min
const PRIORITY_CAPACITY = { short: 2, long: 10 };
const BATCH_CAPACITY = { short: 12, long: 60 };

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

    // separate jobs by queue type (threshold is 10 matches)
    let priorityPending = 0;
    let batchPending = 0;
    
    activeJobs?.forEach(job => {
      const remaining = job.total_matches - job.fetched_matches;
      if (job.total_matches <= 10) {
        priorityPending += remaining;
      } else {
        batchPending += remaining;
      }
    });

    // calculate eta based on queue assignment and capacity
    let etaSeconds = 0;
    if (matchCount > 0) {
      const requestsNeeded = matchCount + 1; // +1 for initial match list fetch
      const isPriority = matchCount <= 10;
      
      // determine which queue this request goes to
      const queueCapacity = isPriority ? PRIORITY_CAPACITY : BATCH_CAPACITY;
      const queuePending = isPriority ? priorityPending : batchPending;
      
      // total requests for this queue
      const totalRequests = queuePending + requestsNeeded;
      
      // calculate eta based on queue-specific capacity
      // use the more restrictive of short/long limits
      const shortLimitTime = Math.ceil(totalRequests / queueCapacity.short); // seconds
      const longLimitTime = Math.ceil(totalRequests / queueCapacity.long) * 120; // seconds
      
      etaSeconds = Math.max(shortLimitTime, longLimitTime);
      
      // add current wait time if rate limited
      if (!status.canProceed) {
        etaSeconds += Math.ceil(status.waitTime / 1000);
      }
    }

    const totalPending = priorityPending + batchPending;
    const queueType = matchCount <= 10 ? 'priority' : 'batch';

    return NextResponse.json({
      canProceed: status.canProceed,
      waitTime: status.waitTime,
      shortCount: status.shortCount,
      longCount: status.longCount,
      estimatedRequestsRemaining: status.estimatedRequestsRemaining,
      priorityPending,
      batchPending,
      totalPending,
      etaSeconds,
      message: status.canProceed 
        ? totalPending > 0 
          ? `${totalPending} requests ahead`
          : 'ready to process'
        : `rate limit hit, wait ${Math.ceil(status.waitTime / 1000)}s`
    });
  } catch (error) {
    console.error('rate limit status error:', error);
    return NextResponse.json(
      { error: 'failed to check rate limit status' },
      { status: 500 }
    );
  }
}
