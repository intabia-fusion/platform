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

import platform, { PlatformError } from '@hcengineering/platform'
import { getClient } from '../client'

describe('AccountClient network retries', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    globalThis.fetch = realFetch
  })

  it('retries a call issued after the retry window has already elapsed', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    globalThis.fetch = fetchMock

    const client = getClient('http://accounts.test', undefined, 60)
    // Retry window is already over if the deadline is captured at construction time
    jest.advanceTimersByTime(120)

    const assertion = expect(client.getRegionInfo()).rejects.toThrow()
    await jest.advanceTimersByTimeAsync(1000)
    await assertion

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  it('reports an unavailable service when a proxy answers with a non-JSON page', async () => {
    globalThis.fetch = jest.fn(
      async () => new Response('Error occurred while trying to proxy: localhost:8080/', { status: 504 })
    )

    const err = await getClient('http://accounts.test')
      .getRegionInfo()
      .catch((err) => err)

    expect(err).toBeInstanceOf(PlatformError)
    expect(err.status.code).toBe(platform.status.ServiceUnavailable)
  })

  it('reports an unavailable service once network retries are exhausted', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    const result = getClient('http://accounts.test', undefined, 60)
      .getRegionInfo()
      .catch((err) => err)
    await jest.advanceTimersByTimeAsync(1000)
    const err = await result

    expect(err).toBeInstanceOf(PlatformError)
    expect(err.status.code).toBe(platform.status.ServiceUnavailable)
  })
})
