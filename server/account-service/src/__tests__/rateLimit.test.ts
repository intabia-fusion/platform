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
import { apiKeyLoginLimiter, apiKeyLoginRateLimit, authLimiter, authRateLimit, clientKey } from '../rateLimit'

interface LimitCase {
  name: string
  limit: typeof authRateLimit
  limiter: { reset: () => void }
  method: string
  burst: number
  others: string[]
}

describe.each<LimitCase>([
  {
    name: 'apiKeyLoginRateLimit',
    limit: apiKeyLoginRateLimit,
    limiter: apiKeyLoginLimiter,
    method: 'loginWithApiKey',
    burst: 100,
    others: ['login', 'getLoginInfoByToken']
  },
  {
    name: 'authRateLimit',
    limit: authRateLimit,
    limiter: authLimiter,
    method: 'validateOtp',
    burst: 1000,
    others: ['getLoginInfoByToken', 'loginWithApiKey']
  }
])('$name', ({ limit, limiter, method, burst, others }) => {
  beforeEach(() => {
    limiter.reset()
  })

  function hammer (
    m: string,
    ip: string,
    times: number,
    forwarded: (i: number) => string | undefined = () => undefined
  ): number {
    let blocked = 0
    for (let i = 0; i < times; i++) {
      const xff = forwarded(i)
      if (limit(m, xff === undefined ? {} : { 'x-forwarded-for': xff }, ip) !== undefined) blocked++
    }
    return blocked
  }

  it('lets a normal burst through, then blocks, with retry hints', () => {
    expect(limit(method, {}, '1.2.3.4')).toBeUndefined()
    expect(hammer(method, '1.2.3.4', burst)).toBeGreaterThan(0)

    const info = limit(method, {}, '1.2.3.4')
    expect(info?.remaining).toBe(0)
    expect(info?.retryAfter).toBeGreaterThan(0)
  })

  it('blocks only the client that hammered', () => {
    hammer(method, '1.2.3.4', burst)
    expect(limit(method, {}, '5.6.7.8')).toBeUndefined()
  })

  it('leaves every other method alone', () => {
    for (const other of others) expect(hammer(other, '1.2.3.4', burst)).toBe(0)
  })

  it('keys on the address the trusted proxy appended, since the ingress socket ip is shared', () => {
    hammer(method, '10.0.0.1', burst, () => '9.9.9.9')

    expect(limit(method, { 'x-forwarded-for': '9.9.9.9' }, '10.0.0.1')).toBeDefined()
    expect(limit(method, { 'x-forwarded-for': '8.8.8.8' }, '10.0.0.1')).toBeUndefined()
  })

  it('a spoofed left address does not dodge the limit', () => {
    expect(hammer(method, '10.0.0.1', burst, (i) => `fake-${i}, 9.9.9.9`)).toBeGreaterThan(0)
    expect(limit(method, { 'x-forwarded-for': 'fake-new, 9.9.9.9' }, '10.0.0.1')).toBeDefined()
  })
})

describe('apiKeyLoginRateLimit env', () => {
  // A typo in the env must not silently switch the throttle off.
  it.each(['abc', ''])('falls back to the default when the env limit is %p', (value) => {
    const prev = process.env.API_KEY_LOGIN_RATE_LIMIT
    process.env.API_KEY_LOGIN_RATE_LIMIT = value
    jest.resetModules()
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fresh = require('../rateLimit')
      let blocked = 0
      for (let i = 0; i < 100; i++) {
        if (fresh.apiKeyLoginRateLimit('loginWithApiKey', {}, '1.2.3.4') !== undefined) blocked++
      }
      expect(blocked).toBeGreaterThan(0)
    } finally {
      if (prev === undefined) delete process.env.API_KEY_LOGIN_RATE_LIMIT
      else process.env.API_KEY_LOGIN_RATE_LIMIT = prev
      jest.resetModules()
    }
  })
})

describe('authRateLimit budgets', () => {
  beforeEach(() => {
    authLimiter.reset()
    apiKeyLoginLimiter.reset()
  })

  function hammer (method: string, ip: string, times: number): void {
    for (let i = 0; i < times; i++) authRateLimit(method, {}, ip)
  }

  it.each(['login', 'loginOtp', 'signUpOtp', 'validateOtp', 'loginByLink', 'join', 'requestPasswordReset'])(
    'blocks a burst of %s',
    (method) => {
      expect(authRateLimit(method, {}, '1.2.3.4')).toBeUndefined()
      hammer(method, '1.2.3.4', 1000)
      expect(authRateLimit(method, {}, '1.2.3.4')).toBeDefined()
    }
  )

  // Code methods share one budget; join checks a password through login and requestPasswordReset sends mail.
  it.each([
    ['loginOtp', ['validateOtp', 'signUpOtp']],
    ['login', ['join', 'requestPasswordReset']]
  ])('counts %s against the same budget as %p', (spent, shared) => {
    hammer(spent, '1.2.3.4', 1000)

    for (const method of shared) expect(authRateLimit(method, {}, '1.2.3.4')).toBeDefined()
  })

  it('does not spend the api key login budget', () => {
    hammer('validateOtp', '1.2.3.4', 1000)
    expect(apiKeyLoginRateLimit('loginWithApiKey', {}, '1.2.3.4')).toBeUndefined()
  })

  it('an IPv6 client does not dodge the limit by walking the addresses of its /64', () => {
    let blocked = 0
    for (let i = 0; i < 1000; i++) {
      const forwarded = `2001:db8:1:2::${i.toString(16)}`
      if (authRateLimit('validateOtp', { 'x-forwarded-for': forwarded }, '10.0.0.1') !== undefined) blocked++
    }

    expect(blocked).toBeGreaterThan(0)
    expect(authRateLimit('validateOtp', { 'x-forwarded-for': '2001:db8:1:3::1' }, '10.0.0.1')).toBeUndefined()
  })

  it('counts a mapped IPv4 socket address and the plain IPv4 one as one client', () => {
    hammer('validateOtp', '::ffff:1.2.3.4', 1000)

    expect(authRateLimit('validateOtp', {}, '1.2.3.4')).toBeDefined()
  })
})

describe('clientKey', () => {
  it('takes the address the trusted proxy appended, and ignores the left entries the client writes', () => {
    expect(clientKey({ 'x-forwarded-for': '9.9.9.9' }, '10.0.0.1')).toBe('9.9.9.9')
    expect(clientKey({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, '10.0.0.1')).toBe('9.9.9.9')
    expect(clientKey({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3, 9.9.9.9' }, '10.0.0.1')).toBe('9.9.9.9')
    expect(clientKey({ 'x-forwarded-for': ['1.1.1.1', '9.9.9.9'] }, '10.0.0.1')).toBe('9.9.9.9')
    expect(clientKey({}, '10.0.0.1')).toBe('10.0.0.1')
    expect(clientKey({ 'x-forwarded-for': '' }, '10.0.0.1')).toBe('10.0.0.1')
  })
})

describe('clientKey with TRUSTED_PROXY_HOPS', () => {
  function keyWith (hops: string | undefined, forwarded: string, ip: string = '10.0.0.1'): string {
    const prev = process.env.TRUSTED_PROXY_HOPS
    if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = hops
    jest.resetModules()
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../rateLimit').clientKey({ 'x-forwarded-for': forwarded }, ip)
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS
      else process.env.TRUSTED_PROXY_HOPS = prev
      jest.resetModules()
    }
  }

  it('counts that many proxies from the right', () => {
    expect(keyWith('2', 'fake, 9.9.9.9, 10.0.0.2')).toBe('9.9.9.9')
  })

  it('takes the left-most entry when the header is shorter than the chain', () => {
    expect(keyWith('3', '9.9.9.9, 10.0.0.2')).toBe('9.9.9.9')
  })

  it('trusts no proxy at 0: the socket address is the key', () => {
    expect(keyWith('0', 'fake, 9.9.9.9')).toBe('10.0.0.1')
  })

  it('falls back to one hop when the env is not a number', () => {
    expect(keyWith('abc', 'fake, 9.9.9.9')).toBe('9.9.9.9')
    expect(keyWith('', 'fake, 9.9.9.9')).toBe('9.9.9.9')
    expect(keyWith(undefined, 'fake, 9.9.9.9')).toBe('9.9.9.9')
  })

  it('counts proxies from the right with IPv6 entries too, and keys the /64', () => {
    const key = keyWith('2', 'fake, 2001:db8:1:2::1, 10.0.0.2')

    expect(keyWith('2', 'other, 2001:db8:1:2:ffff::7, 10.0.0.2')).toBe(key)
    expect(keyWith('2', 'fake, 2001:db8:1:3::1, 10.0.0.2')).not.toBe(key)
  })

  it('trusts no proxy at 0: an IPv6 socket address is keyed by its /64', () => {
    const key = keyWith('0', 'fake, 9.9.9.9', '2001:db8:1:2::1')

    expect(key).not.toBe('2001:db8:1:2::1')
    expect(keyWith('0', 'fake, 8.8.8.8', '2001:db8:1:2::2')).toBe(key)
    expect(keyWith('0', 'fake, 9.9.9.9', '2001:db8:1:3::1')).not.toBe(key)
  })
})

describe('clientKey for IPv6', () => {
  const key = (addr: string): string => clientKey({ 'x-forwarded-for': addr }, '10.0.0.1')

  // A translator in front of the service shows all IPv4 clients under one prefix, so the NAT64 and SIIT
  // forms map to the IPv4 address instead of one /64 bucket.
  it.each([
    ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff'],
    ['2001:db8:1:2::1', '2001:0DB8:0001:0002:0:0:0:5'],
    ['2001:db8:1:2::1', '2001:db8:1:2::'],
    ['2001:db8::1:2:3:4', '2001:db8:0:0:9:9:9:9'],
    ['0:0:0:1::5', '0:0:0:1:9:9:9:9'],
    ['fe80::1%en0', 'fe80::2'],
    ['1.2.3.4', '::ffff:1.2.3.4'],
    ['1.2.3.4', '::ffff:102:304'],
    ['1.2.3.4', '0:0:0:0:0:ffff:1.2.3.4'],
    ['1.2.3.4', '64:ff9b::1.2.3.4'],
    ['1.2.3.4', '64:ff9b::102:304'],
    ['1.2.3.4', '64:ff9b:0:0:0:0:102:304'],
    ['1.2.3.4', '::ffff:0:1.2.3.4'],
    ['1.2.3.4', '::ffff:0:102:304'],
    ['1.2.3.4', '::1.2.3.4'],
    ['1.2.3.4', '::102:304']
  ])('%s and %s share a key', (a, b) => {
    expect(key(b)).toBe(key(a))
  })

  it.each([
    ['2001:db8:1:2::1', '2001:db8:1:3::1'],
    ['2001:db8:1:2::1', '2001:db8:2:2::1'],
    ['2001:db8:1:2::1', '2002:db8:1:2::1'],
    ['0:0:0:1::5', '0:0:0:2::5'],
    ['1.2.3.4', '::ffff:1.2.3.5'],
    ['64:ff9b::1.2.3.4', '64:ff9b::1.2.3.5'],
    ['1.2.3.4', '64:ff9b:1::1.2.3.4'],
    ['1.2.3.4', '64:ff9c::1.2.3.4'],
    ['1.2.3.4', '::fffe:0:1.2.3.4'],
    ['1.2.3.4', '1::1.2.3.4']
  ])('%s and %s have different keys', (a, b) => {
    expect(key(b)).not.toBe(key(a))
  })

  it('keys the socket address the same way when there is no header', () => {
    expect(clientKey({}, '2001:db8:1:2::1')).toBe(clientKey({}, '2001:db8:1:2::2'))
    expect(clientKey({}, '::ffff:1.2.3.4')).toBe('1.2.3.4')
  })

  it('leaves what is not an address as it is', () => {
    expect(key('not-an-ip')).toBe('not-an-ip')
  })
})
