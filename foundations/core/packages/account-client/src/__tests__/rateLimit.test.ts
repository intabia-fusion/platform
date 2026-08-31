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

import { PlatformError } from '@hcengineering/platform'
import { RateLimitError, isRateLimitError, parseRateLimitHeaders, type HeaderReader } from '../rateLimit'

function headers (values: Record<string, string>): HeaderReader {
  return { get: (name: string) => values[name] ?? null }
}

describe('parseRateLimitHeaders', () => {
  it('returns undefined when the service reported nothing', () => {
    expect(parseRateLimitHeaders(headers({}))).toBeUndefined()
  })

  it('reads the full set and turns the reset delta into a timestamp', () => {
    const info = parseRateLimitHeaders(
      headers({ 'RateLimit-Limit': '20', 'RateLimit-Remaining': '7', 'RateLimit-Reset': '120' }),
      1_000_000
    )

    expect(info).toEqual({ limit: 20, remaining: 7, resetAt: 1_120_000, retryAfterMs: undefined })
  })

  it('distinguishes "nothing reported" from "zero left"', () => {
    const info = parseRateLimitHeaders(headers({ 'RateLimit-Limit': '20', 'RateLimit-Remaining': '0' }), 0)

    expect(info).not.toBeUndefined()
    expect(info?.remaining).toBe(0)
  })

  it('reads Retry-After from a 429 and converts to milliseconds', () => {
    const info = parseRateLimitHeaders(headers({ 'Retry-After': '30' }), 0)

    expect(info?.retryAfterMs).toBe(30_000)
  })

  it('survives a partial header set', () => {
    const info = parseRateLimitHeaders(headers({ 'RateLimit-Remaining': '3' }), 0)

    expect(info).toEqual({ limit: undefined, remaining: 3, resetAt: undefined, retryAfterMs: undefined })
  })

  it('ignores garbage values instead of producing NaN', () => {
    const info = parseRateLimitHeaders(
      headers({ 'RateLimit-Limit': 'not-a-number', 'RateLimit-Remaining': '', 'RateLimit-Reset': '5' }),
      0
    )

    expect(info).toEqual({ limit: undefined, remaining: undefined, resetAt: 5000, retryAfterMs: undefined })
  })
})

describe('RateLimitError', () => {
  it('stays catchable as a PlatformError', () => {
    const err = new RateLimitError({})

    expect(err).toBeInstanceOf(PlatformError)
    expect(isRateLimitError(err)).toBe(true)
    expect(isRateLimitError(new PlatformError({} as any))).toBe(false)
  })

  it('prefers Retry-After over the window reset', () => {
    const err = new RateLimitError({ retryAfterMs: 5000, resetAt: Date.now() + 60_000 })

    expect(err.retryAfterMs).toBe(5000)
  })

  it('falls back to the window reset when Retry-After is missing', () => {
    const err = new RateLimitError({ resetAt: Date.now() + 30_000 })

    expect(err.retryAfterMs).toBeGreaterThan(29_000)
    expect(err.retryAfterMs).toBeLessThanOrEqual(30_000)
  })

  it('never reports a negative wait for an already expired window', () => {
    const err = new RateLimitError({ resetAt: Date.now() - 10_000 })

    expect(err.retryAfterMs).toBe(0)
  })

  it('reports an unknown wait when the service said nothing', () => {
    expect(new RateLimitError({}).retryAfterMs).toBeUndefined()
  })
})
