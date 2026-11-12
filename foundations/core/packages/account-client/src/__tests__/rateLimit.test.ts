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

import { RateLimitError, parseRateLimitHeaders } from '../rateLimit'

describe('rate limit headers', () => {
  const now = 1793520000000

  it('reads current account-service headers and prefers milliseconds', () => {
    expect(
      parseRateLimitHeaders(
        new Headers({
          'Retry-After-ms': '1250',
          'Retry-After': '1',
          'X-RateLimit-Limit': '300',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': `${now + 60000}`
        }),
        now
      )
    ).toEqual({ limit: 300, remaining: 0, resetAt: now + 60000, retryAfterMs: 1250 })
  })

  it.each([
    [{ 'Retry-After': '2' }, 2000],
    [{ 'Retry-After': new Date(now + 3000).toUTCString() }, 3000],
    [{ 'Retry-After': new Date(now - 3000).toUTCString() }, 0],
    [{ 'Retry-After-ms': 'invalid', 'Retry-After': '2' }, 2000],
    [{ 'Retry-After-ms': '0', 'Retry-After': '2' }, 0]
  ])('reads retry delay %j', (headers, retryAfterMs) => {
    expect(parseRateLimitHeaders(new Headers(headers), now)?.retryAfterMs).toBe(retryAfterMs)
  })

  it.each(['', 'invalid', '-1', 'Infinity', 'NaN'])('ignores malformed numbers: %s', (value) => {
    expect(
      parseRateLimitHeaders(
        new Headers({
          'Retry-After-ms': value,
          'Retry-After': value,
          'X-RateLimit-Limit': value,
          'X-RateLimit-Remaining': value,
          'X-RateLimit-Reset': value
        }),
        now
      )
    ).toBeUndefined()
  })

  it('does not invent a budget for absent headers', () => {
    expect(parseRateLimitHeaders(new Headers(), now)).toBeUndefined()
    expect(new RateLimitError({}).retryAfterMs).toBeUndefined()
  })

  it('uses the epoch-millisecond reset only when retry delay is absent', () => {
    jest.spyOn(Date, 'now').mockReturnValue(now)
    try {
      expect(new RateLimitError({ resetAt: now + 1250 }).retryAfterMs).toBe(1250)
      expect(new RateLimitError({ resetAt: now - 1250 }).retryAfterMs).toBe(0)
      expect(new RateLimitError({ retryAfterMs: 250, resetAt: now + 1250 }).retryAfterMs).toBe(250)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
