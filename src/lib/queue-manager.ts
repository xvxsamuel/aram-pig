import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// queue types
export type QueueType = 'priority' | 'batch';

interface QueueJob {
  jobId: string;
  puuid: string;
  region: string;
  matchCount: number;
  addedAt: number;
}

// add job to appropriate queue
export async function addToQueue(
  jobId: string,
  puuid: string,
  region: string,
  matchCount: number
): Promise<QueueType> {
  const queueType: QueueType = matchCount > 10 ? 'batch' : 'priority';
  const queueKey = `queue:${region}:${queueType}`;
  
  const job: QueueJob = {
    jobId,
    puuid,
    region,
    matchCount,
    addedAt: Date.now(),
  };

  await redis.rpush(queueKey, JSON.stringify(job));
  
  console.log(`added job ${jobId} to ${queueType} queue (${matchCount} matches)`);
  
  return queueType;
}

// get next job from queue (priority first, then batch)
export async function getNextJob(region: string): Promise<QueueJob | null> {
  try {
    // check priority queue first
    const priorityKey = `queue:${region}:priority`;
    const priorityJob = await redis.lpop(priorityKey);
    
    if (priorityJob) {
      return JSON.parse(priorityJob as string);
    }

    // if no priority jobs, check batch queue
    const batchKey = `queue:${region}:batch`;
    const batchJob = await redis.lpop(batchKey);
    
    if (batchJob) {
      return JSON.parse(batchJob as string);
    }

    return null;
  } catch (error) {
    console.error('failed to get next job from queue:', error);
    return null;
  }
}

// get queue position for a job
export async function getQueuePosition(
  jobId: string,
  region: string,
  queueType: QueueType
): Promise<number> {
  try {
    const queueKey = `queue:${region}:${queueType}`;
    const queue = await redis.lrange(queueKey, 0, -1);
    
    const position = queue.findIndex((item: any) => {
      const job = JSON.parse(item as string);
      return job.jobId === jobId;
    });

    // if in batch queue, add priority queue length
    if (queueType === 'batch') {
      const priorityKey = `queue:${region}:priority`;
      const priorityLength = await redis.llen(priorityKey);
      return position >= 0 ? position + priorityLength : -1;
    }

    return position;
  } catch (error) {
    console.error('failed to get queue position:', error);
    return -1;
  }
}

// get total pending requests across all queues
export async function getTotalPendingRequests(region: string): Promise<number> {
  try {
    const priorityKey = `queue:${region}:priority`;
    const batchKey = `queue:${region}:batch`;
    
    const [priorityQueue, batchQueue] = await Promise.all([
      redis.lrange(priorityKey, 0, -1),
      redis.lrange(batchKey, 0, -1),
    ]);

    let total = 0;
    
    for (const item of priorityQueue) {
      const job = JSON.parse(item as string);
      total += job.matchCount;
    }
    
    for (const item of batchQueue) {
      const job = JSON.parse(item as string);
      total += job.matchCount;
    }

    return total;
  } catch (error) {
    console.error('failed to get total pending requests:', error);
    return 0;
  }
}

// remove job from queue (if user cancels or job fails)
export async function removeFromQueue(
  jobId: string,
  region: string,
  queueType: QueueType
): Promise<void> {
  try {
    const queueKey = `queue:${region}:${queueType}`;
    const queue = await redis.lrange(queueKey, 0, -1);
    
    for (const item of queue) {
      const job = JSON.parse(item as string);
      if (job.jobId === jobId) {
        await redis.lrem(queueKey, 1, item as string);
        console.log(`removed job ${jobId} from ${queueType} queue`);
        break;
      }
    }
  } catch (error) {
    console.error('failed to remove job from queue:', error);
  }
}
