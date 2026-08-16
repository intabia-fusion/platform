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

import { PlatformError, type Status, unknownStatus } from '@hcengineering/platform'

// Budget from the draft-RFC RateLimit-* headers. All optional: an old service, a header-stripping
// proxy, or an exempt request each give a partial view.
export interface RateLimitInfo {
  /** Ceiling for the window the request fell into. */
  limit?: number
  /** How many requests are left in the current window. */
  remaining?: number
  /** Epoch ms when the window rolls over, derived from the `RateLimit-Reset` delta. */
  resetAt?: number
  /** How long to wait before retrying. Only sent with 429. */
  retryAfterMs?: number
}

/** Minimal shape of `Headers` - parses in node and browser without a DOM lib. */
export interface HeaderReader {
  get: (name: string) => string | null
}

function num (headers: HeaderReader, name: string): number | undefined {
  const raw = headers.get(name)
  if (raw == null || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

// undefined means "nothing reported", which callers must not confuse with "reported, 0 left".
export function parseRateLimitHeaders (headers: HeaderReader, now: number = Date.now()): RateLimitInfo | undefined {
  const limit = num(headers, 'RateLimit-Limit')
  const remaining = num(headers, 'RateLimit-Remaining')
  const resetSec = num(headers, 'RateLimit-Reset')
  const retryAfterSec = num(headers, 'Retry-After')

  if (limit === undefined && remaining === undefined && resetSec === undefined && retryAfterSec === undefined) {
    return undefined
  }

  return {
    limit,
    remaining,
    resetAt: resetSec !== undefined ? now + resetSec * 1000 : undefined,
    retryAfterMs: retryAfterSec !== undefined ? retryAfterSec * 1000 : undefined
  }
}

// Extends PlatformError so existing catch blocks keep working.
export class RateLimitError extends PlatformError<any> {
  constructor (
    readonly rateLimit: RateLimitInfo,
    status: Status<any> = unknownStatus('Too many requests')
  ) {
    super(status)
    this.name = 'RateLimitError'
  }

  /** Wait in ms, falling back to the window reset when `Retry-After` is missing. */
  get retryAfterMs (): number | undefined {
    if (this.rateLimit.retryAfterMs !== undefined) return this.rateLimit.retryAfterMs
    if (this.rateLimit.resetAt !== undefined) return Math.max(0, this.rateLimit.resetAt - Date.now())
    return undefined
  }
}

export function isRateLimitError (err: any): err is RateLimitError {
  return err instanceof RateLimitError
}
