//
// Copyright © 2026 Intabia Fusion
//

export interface HourBucket {
  hour: string // ISO timestamp, truncated to the hour
  tokens: number
}

// For a rolling window of `windowHours` with limit `limit`, compute when usage will
// drop to/below the limit as the oldest hourly buckets age out of the window.
// Returns an ISO timestamp (resetAt) or null when the limit is not exceeded (0 = no
// limit -> never exceeded). Buckets must be ascending by hour.
//
// A bucket recorded at hour H leaves the window at H + windowHours. We drop the
// oldest buckets one by one; the moment the remaining sum is <= limit is when the
// just-dropped bucket ages out.
export function computeWindowResetAt (
  buckets: HourBucket[],
  limit: number,
  windowHours: number
): string | null {
  if (limit <= 0) return null
  let remaining = buckets.reduce((s, b) => s + b.tokens, 0)
  if (remaining <= limit) return null

  for (const b of buckets) {
    remaining -= b.tokens
    if (remaining <= limit) {
      const ageOut = new Date(b.hour).getTime() + windowHours * 60 * 60 * 1000
      return new Date(ageOut).toISOString()
    }
  }
  // All buckets dropped and still over limit only if a single newest bucket alone
  // exceeds the limit — it ages out last.
  const last = buckets[buckets.length - 1]
  if (last !== undefined) {
    return new Date(new Date(last.hour).getTime() + windowHours * 60 * 60 * 1000).toISOString()
  }
  return null
}
