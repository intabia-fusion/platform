//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { systemAccountUuid } from '@hcengineering/core'
import type { IncomingHttpHeaders } from 'http'

// Per-IP rate limiting for the account RPC endpoint - the only unauthenticated surface we have.
// Note: counters are in-process, so the real ceiling is replicas * limit; move to KVS if that matters.

export interface RateLimitRule {
  /** How many requests are allowed inside the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  /** Milliseconds until the current window rolls over. Only meaningful when `allowed` is false. */
  retryAfterMs: number
  /** Requests left in the current window. */
  remaining: number
  /** Ceiling that applied to this request. */
  limit: number
  /** Epoch milliseconds at which the current window rolls over. */
  resetAt: number
}

interface Counter {
  count: number
  resetAt: number
}

// Methods where a wrong answer is cheap to retry and worth guessing. Explicit list so a new account
// method never lands in the tight bucket by accident.
export const SENSITIVE_METHODS = new Set([
  'login',
  'loginOtp',
  'loginAsGuest',
  'signUp',
  'signUpOtp',
  'signUpJoin',
  'validateOtp',
  'confirm',
  'changePassword',
  'requestPasswordReset',
  'restorePassword',
  'join',
  'joinByInvite',
  'checkJoin',
  'checkAutoJoin',
  'getInviteInfo',
  'exchangeGuestToken',
  'findPersonBySocialId',
  'findSocialIdBySocialKey'
])

export class IpRateLimiter {
  private readonly counters = new Map<string, Counter>()
  private lastSweep = 0

  constructor (
    private readonly sensitive: RateLimitRule,
    private readonly general: RateLimitRule
  ) {}

  // `now` is injectable so the window behaviour is testable without sleeping.
  check (ip: string, method: string, now: number = Date.now()): RateLimitVerdict {
    this.sweep(now)

    const rule = SENSITIVE_METHODS.has(method) ? this.sensitive : this.general
    if (rule.limit <= 0) {
      return { allowed: true, retryAfterMs: 0, remaining: Number.MAX_SAFE_INTEGER, limit: 0, resetAt: now }
    }

    // Per-method buckets: burning the login budget must not lock out password reset.
    const key = SENSITIVE_METHODS.has(method) ? `${ip}|${method}` : ip
    const existing = this.counters.get(key)

    if (existing === undefined || existing.resetAt <= now) {
      const resetAt = now + rule.windowMs
      this.counters.set(key, { count: 1, resetAt })
      return { allowed: true, retryAfterMs: 0, remaining: rule.limit - 1, limit: rule.limit, resetAt }
    }

    existing.count += 1
    if (existing.count > rule.limit) {
      return {
        allowed: false,
        retryAfterMs: existing.resetAt - now,
        remaining: 0,
        limit: rule.limit,
        resetAt: existing.resetAt
      }
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: rule.limit - existing.count,
      limit: rule.limit,
      resetAt: existing.resetAt
    }
  }

  // At most once a minute, so a flood cannot turn this into O(n) per request.
  private sweep (now: number): void {
    if (now - this.lastSweep < 60_000) return
    this.lastSweep = now
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) {
        this.counters.delete(key)
      }
    }
  }
}

// Draft-RFC shape, same as express-rate-limit standardHeaders in pod-payment. A disabled limit
// reports nothing - `limit: 0` would read as "you may send zero requests".
export function toRateLimitHeaders (verdict: RateLimitVerdict, now: number = Date.now()): Record<string, string> {
  if (verdict.limit <= 0) return {}

  const resetSec = Math.max(0, Math.ceil((verdict.resetAt - now) / 1000))
  const headers: Record<string, string> = {
    'RateLimit-Limit': `${verdict.limit}`,
    'RateLimit-Remaining': `${verdict.remaining}`,
    'RateLimit-Reset': `${resetSec}`
  }

  if (!verdict.allowed) {
    headers['Retry-After'] = `${Math.max(0, Math.ceil(verdict.retryAfterMs / 1000))}`
  }

  return headers
}

// Pass the *verified* token payload - an unverifiable token must arrive as null, otherwise anyone
// claims to be a service and escapes the limit.
export function isRateLimitExempt (decodedToken: { account?: string, extra?: any } | null | undefined): boolean {
  if (decodedToken == null) return false
  const service = decodedToken.extra?.service
  return (typeof service === 'string' && service !== '') || decodedToken.account === systemAccountUuid
}

// Untrusted x-forwarded-for is caller-controlled: a fresh bucket per request.
export function getClientIp (headers: IncomingHttpHeaders, socketIp: string, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = headers['x-forwarded-for']
    // Take the rightmost entry: nginx appends the real peer, everything left of it is caller-supplied.
    // ponytail: assumes a single trusted proxy; a longer chain needs an index of -N.
    const raw = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded
    const parts = raw?.split(',')
    const nearest = parts?.[parts.length - 1]?.trim()
    if (nearest !== undefined && nearest !== '') {
      return nearest
    }
  }
  return socketIp
}

// NaN compares false against every bound, so an unparsed value would silently allow everything.
function envInt (name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function createRateLimiterFromEnv (): IpRateLimiter {
  return new IpRateLimiter(
    {
      limit: envInt('ACCOUNT_RATE_LIMIT_AUTH', 200),
      windowMs: envInt('ACCOUNT_RATE_LIMIT_AUTH_WINDOW_MS', 300_000)
    },
    {
      limit: envInt('ACCOUNT_RATE_LIMIT_GENERAL', 6000),
      windowMs: envInt('ACCOUNT_RATE_LIMIT_GENERAL_WINDOW_MS', 60_000)
    }
  )
}
