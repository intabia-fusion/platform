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

export interface RateLimitInfo {
  limit?: number
  remaining?: number
  /** Epoch ms when the window rolls over, reported by `X-RateLimit-Reset`. */
  resetAt?: number
  retryAfterMs?: number
}

export interface HeaderReader {
  get: (name: string) => string | null
}

function num (headers: HeaderReader, name: string): number | undefined {
  const raw = headers.get(name)
  if (raw == null || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function parseRateLimitHeaders (headers: HeaderReader, now: number = Date.now()): RateLimitInfo | undefined {
  const limit = num(headers, 'X-RateLimit-Limit')
  const remaining = num(headers, 'X-RateLimit-Remaining')
  const resetAt = num(headers, 'X-RateLimit-Reset')
  const retryAfterSec = num(headers, 'Retry-After')
  const retryAfter = headers.get('Retry-After') ?? ''
  const retryAfterDate = /[a-z]/i.test(retryAfter) ? Date.parse(retryAfter) : NaN
  const retryAfterMs =
    num(headers, 'Retry-After-ms') ??
    (retryAfterSec !== undefined
      ? retryAfterSec * 1000
      : Number.isFinite(retryAfterDate)
        ? Math.max(0, retryAfterDate - now)
        : undefined)

  if (limit === undefined && remaining === undefined && resetAt === undefined && retryAfterMs === undefined) {
    return undefined
  }

  return {
    limit,
    remaining,
    resetAt,
    retryAfterMs
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

  get retryAfterMs (): number | undefined {
    if (this.rateLimit.retryAfterMs !== undefined) return this.rateLimit.retryAfterMs
    if (this.rateLimit.resetAt !== undefined) return Math.max(0, this.rateLimit.resetAt - Date.now())
    return undefined
  }
}

export function isRateLimitError (err: any): err is RateLimitError {
  return err instanceof RateLimitError
}
