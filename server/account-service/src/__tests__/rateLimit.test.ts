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
import {
  IpRateLimiter,
  createRateLimiterFromEnv,
  getClientIp,
  isRateLimitExempt,
  toRateLimitHeaders
} from '../rateLimit'

describe('IpRateLimiter', () => {
  const sensitive = { limit: 3, windowMs: 1000 }
  const general = { limit: 10, windowMs: 1000 }

  it('blocks a sensitive method once the budget is spent', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 3; i++) {
      expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(true)
    }
    const verdict = limiter.check('1.1.1.1', 'login', 0)
    expect(verdict.allowed).toBe(false)
    expect(verdict.retryAfterMs).toBe(1000)
  })

  it('keeps sensitive methods in separate buckets', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 4; i++) limiter.check('1.1.1.1', 'login', 0)

    expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(false)
    expect(limiter.check('1.1.1.1', 'restorePassword', 0).allowed).toBe(true)
  })

  it('does not let one IP spend another IP budget', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 4; i++) limiter.check('1.1.1.1', 'login', 0)

    expect(limiter.check('2.2.2.2', 'login', 0).allowed).toBe(true)
  })

  it('rolls the window over', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 4; i++) limiter.check('1.1.1.1', 'login', 0)
    expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(false)

    expect(limiter.check('1.1.1.1', 'login', 1001).allowed).toBe(true)
  })

  it('applies the looser budget to ordinary methods', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 10; i++) {
      expect(limiter.check('1.1.1.1', 'getUserWorkspaces', 0).allowed).toBe(true)
    }
    expect(limiter.check('1.1.1.1', 'getUserWorkspaces', 0).allowed).toBe(false)
  })

  it('treats a non-positive limit as disabled', () => {
    const limiter = new IpRateLimiter({ limit: 0, windowMs: 1000 }, general)
    for (let i = 0; i < 100; i++) {
      expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(true)
    }
  })

  it('shares one bucket across all ordinary methods', () => {
    const limiter = new IpRateLimiter(sensitive, { limit: 2, windowMs: 1000 })

    expect(limiter.check('1.1.1.1', 'getUserWorkspaces', 0).allowed).toBe(true)
    expect(limiter.check('1.1.1.1', 'getSocialIds', 0).allowed).toBe(true)
    expect(limiter.check('1.1.1.1', 'getRegionInfo', 0).allowed).toBe(false)
  })

  it('counts down remaining and reports zero once blocked', () => {
    const limiter = new IpRateLimiter(sensitive, general)

    expect(limiter.check('1.1.1.1', 'login', 0).remaining).toBe(2)
    expect(limiter.check('1.1.1.1', 'login', 0).remaining).toBe(1)
    expect(limiter.check('1.1.1.1', 'login', 0).remaining).toBe(0)
    expect(limiter.check('1.1.1.1', 'login', 0).remaining).toBe(0)
  })

  it('opens the window exactly at resetAt, not a tick earlier', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 4; i++) limiter.check('1.1.1.1', 'login', 0)

    expect(limiter.check('1.1.1.1', 'login', 999).allowed).toBe(false)
    expect(limiter.check('1.1.1.1', 'login', 1000).allowed).toBe(true)
  })

  it('reports how long the caller has to wait', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 3; i++) limiter.check('1.1.1.1', 'login', 0)

    expect(limiter.check('1.1.1.1', 'login', 400).retryAfterMs).toBe(600)
  })

  it('drops expired counters instead of growing forever', () => {
    const limiter = new IpRateLimiter(sensitive, general)
    for (let i = 0; i < 500; i++) {
      limiter.check(`10.0.0.${i}`, 'login', 0)
    }
    expect((limiter as any).counters.size).toBe(500)

    // The sweep runs at most once a minute, so it only kicks in on a call past that mark.
    limiter.check('10.0.1.1', 'login', 61_000)
    expect((limiter as any).counters.size).toBe(1)
  })
})

describe('toRateLimitHeaders', () => {
  const limiter = (): IpRateLimiter => new IpRateLimiter({ limit: 3, windowMs: 60_000 }, { limit: 10, windowMs: 1000 })

  it('advertises the budget on an allowed request', () => {
    const verdict = limiter().check('1.1.1.1', 'login', 0)

    expect(toRateLimitHeaders(verdict, 0)).toEqual({
      'RateLimit-Limit': '3',
      'RateLimit-Remaining': '2',
      'RateLimit-Reset': '60'
    })
  })

  it('adds Retry-After only when blocked', () => {
    const l = limiter()
    for (let i = 0; i < 4; i++) l.check('1.1.1.1', 'login', 0)
    const verdict = l.check('1.1.1.1', 'login', 0)

    expect(toRateLimitHeaders(verdict, 0)).toEqual({
      'RateLimit-Limit': '3',
      'RateLimit-Remaining': '0',
      'RateLimit-Reset': '60',
      'Retry-After': '60'
    })
  })

  it('counts the reset down as the window drains', () => {
    const l = limiter()
    const verdict = l.check('1.1.1.1', 'login', 0)

    expect(toRateLimitHeaders(verdict, 30_000)['RateLimit-Reset']).toBe('30')
    expect(toRateLimitHeaders(verdict, 59_500)['RateLimit-Reset']).toBe('1')
  })

  it('never advertises a negative reset', () => {
    const l = limiter()
    const verdict = l.check('1.1.1.1', 'login', 0)

    expect(toRateLimitHeaders(verdict, 120_000)['RateLimit-Reset']).toBe('0')
  })

  it('reports nothing when the limit is switched off', () => {
    const off = new IpRateLimiter({ limit: 0, windowMs: 1000 }, { limit: 0, windowMs: 1000 })

    expect(toRateLimitHeaders(off.check('1.1.1.1', 'login', 0), 0)).toEqual({})
  })

  it('is emitted for ordinary methods too, with the looser ceiling', () => {
    const verdict = limiter().check('1.1.1.1', 'getUserWorkspaces', 0)

    expect(toRateLimitHeaders(verdict, 0)).toEqual({
      'RateLimit-Limit': '10',
      'RateLimit-Remaining': '9',
      'RateLimit-Reset': '1'
    })
  })
})

describe('isRateLimitExempt', () => {
  it('does not exempt an anonymous caller', () => {
    expect(isRateLimitExempt(null)).toBe(false)
    expect(isRateLimitExempt(undefined)).toBe(false)
  })

  it('does not exempt a regular user token', () => {
    expect(isRateLimitExempt({ account: 'some-account-uuid', extra: {} })).toBe(false)
    expect(isRateLimitExempt({ account: 'some-account-uuid' })).toBe(false)
  })

  it('exempts a service token', () => {
    expect(isRateLimitExempt({ account: 'some-account-uuid', extra: { service: 'workspace' } })).toBe(true)
  })

  it('does not exempt a malformed service claim', () => {
    expect(isRateLimitExempt({ account: 'some-account-uuid', extra: { service: '' } })).toBe(false)
    expect(isRateLimitExempt({ account: 'some-account-uuid', extra: { service: null } })).toBe(false)
    expect(isRateLimitExempt({ account: 'some-account-uuid', extra: { service: true } })).toBe(false)
  })

  it('exempts the system account even without a service claim', () => {
    expect(isRateLimitExempt({ account: systemAccountUuid, extra: {} })).toBe(true)
  })

  it('does not exempt a caller who merely claims to be an admin', () => {
    expect(isRateLimitExempt({ account: 'some-account-uuid', extra: { admin: 'true' } })).toBe(false)
  })
})

describe('createRateLimiterFromEnv', () => {
  const saved = { ...process.env }

  afterEach(() => {
    process.env = { ...saved }
  })

  it('applies the documented defaults', () => {
    delete process.env.ACCOUNT_RATE_LIMIT_AUTH
    delete process.env.ACCOUNT_RATE_LIMIT_AUTH_WINDOW_MS
    const limiter = createRateLimiterFromEnv()

    for (let i = 0; i < 200; i++) {
      expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(true)
    }
    const blocked = limiter.check('1.1.1.1', 'login', 0)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(300_000)
  })

  it('honours the env overrides', () => {
    process.env.ACCOUNT_RATE_LIMIT_AUTH = '1'
    process.env.ACCOUNT_RATE_LIMIT_AUTH_WINDOW_MS = '5000'
    const limiter = createRateLimiterFromEnv()

    expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(true)
    expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(false)
    expect(limiter.check('1.1.1.1', 'login', 5000).allowed).toBe(true)
  })

  it('falls back to the default when the env value is garbage, instead of silently allowing everything', () => {
    process.env.ACCOUNT_RATE_LIMIT_AUTH = 'not-a-number'
    const limiter = createRateLimiterFromEnv()

    for (let i = 0; i < 200; i++) {
      expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(true)
    }
    expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(false)
  })

  it('lets the limit be switched off entirely', () => {
    process.env.ACCOUNT_RATE_LIMIT_AUTH = '0'
    process.env.ACCOUNT_RATE_LIMIT_GENERAL = '0'
    const limiter = createRateLimiterFromEnv()

    for (let i = 0; i < 100; i++) {
      expect(limiter.check('1.1.1.1', 'login', 0).allowed).toBe(true)
      expect(limiter.check('1.1.1.1', 'getSocialIds', 0).allowed).toBe(true)
    }
  })
})

describe('getClientIp', () => {
  it('ignores x-forwarded-for when the proxy is not trusted', () => {
    expect(getClientIp({ 'x-forwarded-for': '9.9.9.9' }, '10.0.0.1', false)).toBe('10.0.0.1')
  })

  it('takes the last x-forwarded-for entry when the proxy is trusted', () => {
    expect(getClientIp({ 'x-forwarded-for': '9.9.9.9, 10.0.0.5' }, '10.0.0.1', true)).toBe('10.0.0.5')
  })

  it('falls back to the socket address when the header is empty', () => {
    expect(getClientIp({ 'x-forwarded-for': '' }, '10.0.0.1', true)).toBe('10.0.0.1')
    expect(getClientIp({ 'x-forwarded-for': '   ' }, '10.0.0.1', true)).toBe('10.0.0.1')
    expect(getClientIp({}, '10.0.0.1', true)).toBe('10.0.0.1')
  })

  it('takes the last entry when the header arrives repeated', () => {
    expect(getClientIp({ 'x-forwarded-for': ['9.9.9.9', '8.8.8.8'] }, '10.0.0.1', true)).toBe('8.8.8.8')
  })

  it('keeps an IPv6 address intact', () => {
    expect(getClientIp({ 'x-forwarded-for': '10.0.0.5, 2001:db8::1' }, '10.0.0.1', true)).toBe('2001:db8::1')
  })

  it('ignores a caller-supplied prefix that nginx appends the real peer to', () => {
    const limiter = new IpRateLimiter({ limit: 1, windowMs: 1000 }, { limit: 100, windowMs: 1000 })
    // $proxy_add_x_forwarded_for keeps whatever the caller sent and appends the peer address.
    const spoofing = (claimed: string): string =>
      getClientIp({ 'x-forwarded-for': `${claimed}, 9.9.9.9` }, '10.0.0.1', true)

    expect(limiter.check(spoofing('1.1.1.1'), 'login', 0).allowed).toBe(true)
    expect(limiter.check(spoofing('2.2.2.2'), 'login', 0).allowed).toBe(false)
    expect(limiter.check(spoofing('3.3.3.3'), 'login', 0).allowed).toBe(false)
  })

  it('gives each client its own bucket when the proxy is trusted', () => {
    const limiter = new IpRateLimiter({ limit: 1, windowMs: 1000 }, { limit: 100, windowMs: 1000 })
    const behindProxy = (xff: string): string => getClientIp({ 'x-forwarded-for': xff }, '10.0.0.1', true)

    expect(limiter.check(behindProxy('9.9.9.9'), 'login', 0).allowed).toBe(true)
    expect(limiter.check(behindProxy('9.9.9.9'), 'login', 0).allowed).toBe(false)
    expect(limiter.check(behindProxy('8.8.8.8'), 'login', 0).allowed).toBe(true)
  })

  it('collapses spoofed headers into one bucket when the proxy is not trusted', () => {
    const limiter = new IpRateLimiter({ limit: 1, windowMs: 1000 }, { limit: 100, windowMs: 1000 })
    const spoofed = (xff: string): string => getClientIp({ 'x-forwarded-for': xff }, '10.0.0.1', false)

    expect(limiter.check(spoofed('9.9.9.9'), 'login', 0).allowed).toBe(true)
    expect(limiter.check(spoofed('8.8.8.8'), 'login', 0).allowed).toBe(false)
  })
})
