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

import { parseEnvInt } from '@hcengineering/account'
import { type RateLimitInfo, SlidingWindowRateLimitter } from '@hcengineering/rpc'
import { type IncomingHttpHeaders } from 'http'
import { isIPv6 } from 'net'

// loginWithApiKey needs no caller token, so it is the one method a stranger can hammer. Keyed per
// client, not per key: the key it presents is attacker-chosen and would grow the map without bound.
export const apiKeyLoginLimiter = new SlidingWindowRateLimitter(
  parseEnvInt(process.env.API_KEY_LOGIN_RATE_LIMIT, 30),
  parseEnvInt(process.env.API_KEY_LOGIN_RATE_WINDOW_MS, 60 * 1000)
)

// Token-less calls that either send an emailed code or guess one. The per-code attempt counter
// in the db is the real guard; this only caps how much one client can push through.
export const authLimiter = new SlidingWindowRateLimitter(
  parseEnvInt(process.env.AUTH_RATE_LIMIT, 300),
  parseEnvInt(process.env.AUTH_RATE_WINDOW_MS, 60 * 1000)
)

// join checks a password through login and requestPasswordReset sends mail.
const authMethods = new Set([
  'login',
  'loginOtp',
  'signUpOtp',
  'validateOtp',
  'loginByLink',
  'join',
  'requestPasswordReset'
])

// Proxies in front of the service that append to x-forwarded-for; 0 = use the socket address.
const trustedProxyHops = parseEnvInt(process.env.TRUSTED_PROXY_HOPS, 1)

/**
 * Trusted proxies append to x-forwarded-for on the right; the left entries are whatever the
 * client sent. The key is the entry the outermost trusted proxy appended, counted from the
 * right. The koa app has no `app.proxy`, so without the header the key is the ingress address.
 */
export function clientKey (headers: IncomingHttpHeaders, ip: string): string {
  if (trustedProxyHops <= 0) return addressKey(ip)
  const fwd = headers['x-forwarded-for']
  const entries = ((Array.isArray(fwd) ? fwd.join(',') : fwd) ?? '').split(',')
  const parts = entries.map((h) => h.trim()).filter((h) => h !== '')
  return addressKey(parts.length === 0 ? ip : parts[Math.max(parts.length - trustedProxyHops, 0)])
}

// An IPv6 client owns a whole /64 and could walk it past the limit, so the prefix is the key.
// An address with an IPv4 client inside keys as that IPv4: a translator puts them all in one /64.
function addressKey (addr: string): string {
  if (!isIPv6(addr)) return addr
  const groups = ipv6Groups(addr)
  const zeros = (from: number, to: number): boolean => groups.slice(from, to).every((g) => g === 0)
  const carriesIPv4 =
    (zeros(0, 5) && groups[5] === 0xffff) || // ::ffff:a.b.c.d, mapped
    (zeros(0, 4) && groups[4] === 0xffff && groups[5] === 0) || // ::ffff:0:a.b.c.d, SIIT
    (groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) || // 64:ff9b::/96, NAT64
    zeros(0, 6) // ::a.b.c.d, compatible
  if (carriesIPv4) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
  }
  const prefix = groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')
  return `${prefix}::/64`
}

// The 8 groups of a valid IPv6 address; a trailing dotted IPv4 stands for the last two.
function ipv6Groups (addr: string): number[] {
  const bare = addr.replace(/%.*$/, '')
  const v4 = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(bare)
  const pair = (hi: string, lo: string): string => ((Number(hi) << 8) | Number(lo)).toString(16)
  const text = v4 === null ? bare : `${v4[1]}${pair(v4[2], v4[3])}:${pair(v4[4], v4[5])}`
  const [head, tail] = text.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  const zeros = new Array<string>(8 - left.length - right.length).fill('0')
  return [...left, ...zeros, ...right].map((g) => parseInt(g, 16))
}

/** Undefined = let the call through; a RateLimitInfo = answer 429 with it. */
export function apiKeyLoginRateLimit (
  method: string,
  headers: IncomingHttpHeaders,
  ip: string
): RateLimitInfo | undefined {
  if (method !== 'loginWithApiKey') return undefined
  const info = apiKeyLoginLimiter.checkRateLimit(clientKey(headers, ip))
  return info.remaining === 0 ? info : undefined
}

export function authRateLimit (method: string, headers: IncomingHttpHeaders, ip: string): RateLimitInfo | undefined {
  if (!authMethods.has(method)) return undefined
  const info = authLimiter.checkRateLimit(clientKey(headers, ip))
  return info.remaining === 0 ? info : undefined
}
