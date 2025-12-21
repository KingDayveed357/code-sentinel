// src/utils/rate-limit.ts (IMPROVED - Better free tier handling)

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private requestLog: number[] = []; // Track request timestamps

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire tokens (wait if necessary)
   * @param tokensNeeded Number of tokens to acquire (default 1)
   */
  async acquire(tokensNeeded = 1): Promise<void> {
    this.refillTokens();
    this.cleanRequestLog();

    // Check if we're approaching rate limits too quickly
    const recentRequests = this.requestLog.length;
    if (recentRequests >= this.maxTokens * 0.8) {
      // We're using 80% of our quota in the last minute - slow down
      const extraDelay = 2000; // Extra 2s safety margin
      await new Promise((resolve) => setTimeout(resolve, extraDelay));
      this.refillTokens();
    }

    // Standard token bucket logic
    while (this.tokens < tokensNeeded) {
      const missing = tokensNeeded - this.tokens;
      const waitMs = Math.ceil((missing / this.refillRate) * 1000);

      // Add small buffer to avoid edge cases
      const safeWaitMs = waitMs + 500;

      await new Promise((resolve) => setTimeout(resolve, safeWaitMs));
      this.refillTokens();
    }

    this.tokens -= tokensNeeded;
    this.requestLog.push(Date.now());
  }

  /**
   * Check if we can acquire tokens without waiting
   */
  canAcquire(tokensNeeded = 1): boolean {
    this.refillTokens();
    return this.tokens >= tokensNeeded;
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get time until tokens are available
   */
  getWaitTime(tokensNeeded = 1): number {
    this.refillTokens();
    
    if (this.tokens >= tokensNeeded) {
      return 0;
    }

    const missing = tokensNeeded - this.tokens;
    return Math.ceil((missing / this.refillRate) * 1000);
  }

  /**
   * Get rate limit stats
   */
  getStats() {
    this.cleanRequestLog();
    return {
      availableTokens: this.getAvailableTokens(),
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      requestsLastMinute: this.requestLog.length,
      utilizationPercent: Math.round((this.requestLog.length / this.maxTokens) * 100),
    };
  }

  /**
   * Reset the rate limiter (useful for testing)
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.requestLog = [];
  }

  private refillTokens(): void {
    const now = Date.now();
    const secondsElapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = secondsElapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private cleanRequestLog(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestLog = this.requestLog.filter((timestamp) => timestamp > oneMinuteAgo);
  }
}

/**
 * Pre-configured rate limiters for common API tiers
 */
export const RateLimiterPresets = {
  // Gemini Free Tier: 15 RPM (Requests Per Minute)
  GEMINI_FREE: () => new RateLimiter(15, 0.25), // 15 requests / 60 seconds = 0.25 per second

  // Gemini Paid Tier: 1000 RPM
  GEMINI_PAID: () => new RateLimiter(1000, 16.67),

  // Claude Free Tier: ~5 RPM (conservative estimate)
  CLAUDE_FREE: () => new RateLimiter(5, 0.083), // 5 requests / 60 seconds

  // Claude Paid Tier: 50 RPM (Tier 1)
  CLAUDE_PAID: () => new RateLimiter(50, 0.83),

  // OpenAI Free Tier: 3 RPM
  OPENAI_FREE: () => new RateLimiter(3, 0.05),

  // OpenAI Tier 1: 500 RPM
  OPENAI_TIER1: () => new RateLimiter(500, 8.33),

  // Custom limiter
  CUSTOM: (requestsPerMinute: number) => 
    new RateLimiter(requestsPerMinute, requestsPerMinute / 60),
};

/**
 * Example usage:
 * 
 * const limiter = RateLimiterPresets.GEMINI_FREE();
 * 
 * // Before making API call
 * await limiter.acquire(1);
 * const response = await callGeminiAPI();
 * 
 * // Check stats
 * console.log(limiter.getStats());
 * // { availableTokens: 14, maxTokens: 15, requestsLastMinute: 1, ... }
 */