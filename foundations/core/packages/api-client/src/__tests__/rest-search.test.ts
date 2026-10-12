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

import { createRestClient } from '../rest/rest'

describe('RestClient searchFulltext', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('sends searchIn as a comma separated list', async () => {
    // The server splits it back: pods/server/src/rpc.ts
    const fetchMock = jest.fn(async (url: string) => new Response(JSON.stringify({ docs: [] }), { status: 200 }))
    globalThis.fetch = fetchMock as any
    const client = createRestClient('http://x.test', 'ws', 'token')

    await client.searchFulltext({ query: 'q' }, { searchIn: ['title', 'identifier'] })

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('searchIn')).toBe('title,identifier')
  })
})
