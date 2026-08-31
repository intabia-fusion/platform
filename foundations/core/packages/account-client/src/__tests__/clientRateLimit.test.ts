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
import { getClient } from '../client'
import { isRateLimitError } from '../rateLimit'

/** Minimal stand-in for the fetch Response bits the client touches. */
function response (status: number, body: any, headerValues: Record<string, string> = {}): any {
  return {
    status,
    headers: { get: (name: string) => headerValues[name] ?? null },
    json: async () => body
  }
}

describe('AccountClient rate limiting', () => {
  const originalFetch = (globalThis as any).fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    ;(globalThis as any).fetch = fetchMock as any
  })

  afterEach(() => {
    ;(globalThis as any).fetch = originalFetch
  })

  it('throws RateLimitError carrying the advertised delay on 429', async () => {
    fetchMock.mockResolvedValue(
      response(
        429,
        { error: { code: 'x' } },
        { 'RateLimit-Limit': '20', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '300', 'Retry-After': '300' }
      )
    )
    const client = getClient('http://localhost:3000', 'token')

    const err = await client.getLoginInfoByToken().catch((e) => e)

    expect(isRateLimitError(err)).toBe(true)
    expect(err.rateLimit).toMatchObject({ limit: 20, remaining: 0, retryAfterMs: 300_000 })
    expect(err.retryAfterMs).toBe(300_000)
  })

  it('does not retry a 429 - one request reaches the service, not a storm', async () => {
    fetchMock.mockResolvedValue(response(429, { error: { code: 'x' } }, { 'Retry-After': '1' }))
    const client = getClient('http://localhost:3000', 'token')

    await client.getLoginInfoByToken().catch(() => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stays catchable as a PlatformError for callers that do not know about 429', async () => {
    fetchMock.mockResolvedValue(response(429, { error: { code: 'x' } }, {}))
    const client = getClient('http://localhost:3000', 'token')

    const err = await client.getLoginInfoByToken().catch((e) => e)

    expect(err).toBeInstanceOf(PlatformError)
  })

  it('records the budget from a successful response', async () => {
    fetchMock.mockResolvedValue(
      response(
        200,
        { result: null },
        { 'RateLimit-Limit': '600', 'RateLimit-Remaining': '599', 'RateLimit-Reset': '60' }
      )
    )
    const client = getClient('http://localhost:3000', 'token')

    await client.getLoginInfoByToken()

    expect(client.getLastRateLimit()).toMatchObject({ limit: 600, remaining: 599 })
  })

  it('reports no budget when the service does not advertise one', async () => {
    fetchMock.mockResolvedValue(response(200, { result: null }, {}))
    const client = getClient('http://localhost:3000', 'token')

    await client.getLoginInfoByToken()

    expect(client.getLastRateLimit()).toBeUndefined()
  })

  it('still surfaces ordinary errors as plain PlatformError', async () => {
    fetchMock.mockResolvedValue(response(400, { error: { code: 'some-error', params: {} } }, {}))
    const client = getClient('http://localhost:3000', 'token')

    const err = await client.getLoginInfoByToken().catch((e) => e)

    expect(err).toBeInstanceOf(PlatformError)
    expect(isRateLimitError(err)).toBe(false)
  })
})
