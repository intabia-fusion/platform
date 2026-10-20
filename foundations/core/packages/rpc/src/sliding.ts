import type { RateLimitInfo } from './rpc'

// Callers key by client address or a hash of a presented key, so the keys come from outside.
const MAX_TRACKED_KEYS = 10000

export class SlidingWindowRateLimitter {
  private readonly rateLimits = new Map<
    string,
    {
      requests: number[]
      rejectedRequests: number // Counter for rejected requests
      resetTime: number
    }
  >()

  private lastSweep = 0

  constructor (
    readonly rateLimitMax: number,
    readonly rateLimitWindow: number,
    readonly now: () => number = Date.now
  ) {
    this.rateLimitMax = rateLimitMax
    this.rateLimitWindow = rateLimitWindow
  }

  public checkRateLimit (groupId: string): RateLimitInfo {
    const now = this.now()
    const windowStart = now - this.rateLimitWindow

    let rateLimit = this.rateLimits.get(groupId)
    if (rateLimit == null) {
      if (this.rateLimits.size > MAX_TRACKED_KEYS && now - this.lastSweep >= this.rateLimitWindow) {
        this.dropIdleKeys(now, windowStart)
      }
      rateLimit = { requests: [], resetTime: now + this.rateLimitWindow, rejectedRequests: 0 }
      this.rateLimits.set(groupId, rateLimit)
    }

    // Remove requests outside the current window
    rateLimit.requests = rateLimit.requests.filter((time) => time > windowStart)

    // Reset rejected requests counter when window changes
    if (rateLimit.requests.length === 0) {
      rateLimit.rejectedRequests = 0
    }

    // Update reset time
    rateLimit.resetTime = now + this.rateLimitWindow

    if (rateLimit.requests.length <= this.rateLimitMax) {
      rateLimit.requests.push(now + (rateLimit.rejectedRequests > this.rateLimitMax * 2 ? this.rateLimitWindow * 5 : 0))
    }

    if (rateLimit.requests.length >= this.rateLimitMax) {
      rateLimit.rejectedRequests++

      // Find when the oldest request will exit the window
      const nextAvailableTime = rateLimit.requests[0] + this.rateLimitWindow

      return {
        remaining: 0,
        limit: this.rateLimitMax,
        current: rateLimit.requests.length,
        reset: rateLimit.resetTime,
        retryAfter: Math.max(1, nextAvailableTime - now + 1)
      }
    }

    return {
      remaining: this.rateLimitMax - rateLimit.requests.length,
      current: rateLimit.requests.length,
      limit: this.rateLimitMax,
      reset: rateLimit.resetTime
    }
  }

  // A key whose requests all left the window holds no state: the next call rebuilds it as new.
  // At most once per window, so a flood of new keys cannot turn every call into a full scan.
  private dropIdleKeys (now: number, windowStart: number): void {
    this.lastSweep = now
    for (const [key, limit] of this.rateLimits) {
      if (limit.requests.every((time) => time <= windowStart)) {
        this.rateLimits.delete(key)
      }
    }
  }

  // Add a reset method for testing purposes
  public reset (): void {
    this.rateLimits.clear()
  }
}
