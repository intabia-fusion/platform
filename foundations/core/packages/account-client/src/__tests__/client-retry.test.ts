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

import { getClient } from '../client'

describe('AccountClient network retries', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('retries a call issued after the retry window has already elapsed', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = getClient('http://accounts.test', undefined, 60)
    await new Promise<void>((resolve) => setTimeout(resolve, 120))

    await expect(client.getRegionInfo()).rejects.toThrow()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })
})
