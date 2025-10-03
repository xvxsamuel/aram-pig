class RateLimiter {
  private shortTermRequests: number[] = [];
  private longTermRequests: number[] = [];
  
  private readonly SHORT_TERM_LIMIT = 20;
  private readonly SHORT_TERM_WINDOW = 1000;
  
  private readonly LONG_TERM_LIMIT = 100;
  private readonly LONG_TERM_WINDOW = 120000;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    this.shortTermRequests = this.shortTermRequests.filter(
      time => now - time < this.SHORT_TERM_WINDOW
    );
    this.longTermRequests = this.longTermRequests.filter(
      time => now - time < this.LONG_TERM_WINDOW
    );

    const canMakeRequest = 
      this.shortTermRequests.length < this.SHORT_TERM_LIMIT &&
      this.longTermRequests.length < this.LONG_TERM_LIMIT;

    if (canMakeRequest) {
      this.shortTermRequests.push(now);
      this.longTermRequests.push(now);
      return;
    }

    let waitTime = 100;
    
    if (this.shortTermRequests.length >= this.SHORT_TERM_LIMIT) {
      const oldestShortTerm = this.shortTermRequests[0];
      const timeToWait = this.SHORT_TERM_WINDOW - (now - oldestShortTerm) + 50;
      waitTime = Math.max(waitTime, timeToWait);
      console.log(`Rate limit: waiting ${waitTime}ms (short-term limit reached)`);
    }
    
    if (this.longTermRequests.length >= this.LONG_TERM_LIMIT) {
      const oldestLongTerm = this.longTermRequests[0];
      const timeToWait = this.LONG_TERM_WINDOW - (now - oldestLongTerm) + 50;
      waitTime = Math.max(waitTime, timeToWait);
      console.log(`Rate limit: waiting ${waitTime}ms (long-term limit reached)`);
    }

    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.waitForSlot();
  }

  reset(): void {
    this.shortTermRequests = [];
    this.longTermRequests = [];
  }

  getStatus() {
    const now = Date.now();
    
    this.shortTermRequests = this.shortTermRequests.filter(
      time => now - time < this.SHORT_TERM_WINDOW
    );
    this.longTermRequests = this.longTermRequests.filter(
      time => now - time < this.LONG_TERM_WINDOW
    );

    const shortTermUsed = this.shortTermRequests.length;
    const longTermUsed = this.longTermRequests.length;
    
    const shortTermAvailable = this.SHORT_TERM_LIMIT - shortTermUsed;
    const longTermAvailable = this.LONG_TERM_LIMIT - longTermUsed;
    
    // Calculate current effective rate (requests per second)
    const effectiveRate = Math.min(
      shortTermAvailable, // Can't exceed short-term limit
      longTermAvailable / (this.LONG_TERM_WINDOW / 1000) // Long-term rate per second
    );

    return {
      shortTermUsed,
      shortTermLimit: this.SHORT_TERM_LIMIT,
      shortTermAvailable,
      longTermUsed,
      longTermLimit: this.LONG_TERM_LIMIT,
      longTermAvailable,
      effectiveRatePerSecond: Math.max(1, effectiveRate), // At least 1 req/sec
    };
  }
}

const globalForRateLimiter = globalThis as unknown as {
  rateLimiter: RateLimiter | undefined;
};

export const rateLimiter = globalForRateLimiter.rateLimiter ?? new RateLimiter();

if (process.env.NODE_ENV !== 'production') {
  globalForRateLimiter.rateLimiter = rateLimiter;
}
