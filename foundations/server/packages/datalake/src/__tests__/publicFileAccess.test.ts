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

import { type WorkspaceUuid } from '@hcengineering/core'
import { PublicFileAccessClient, PublicFileAccessError } from '../publicFileAccess'

const ws = '11111111-1111-4111-8111-111111111111' as WorkspaceUuid
afterEach(() => {
  jest.restoreAllMocks()
})
it('sends idempotent replacement and revoke bodies to the internal API', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(null, { status: 204 }))
  const client = new PublicFileAccessClient('http://datalake/prefix', 'service-token')
  await client.replace(ws, 'a/b', 3, ['file'])
  await client.revoke(ws, 'a/b', 4)
  expect(fetchMock.mock.calls[0][0]).toBe(`http://datalake/prefix/internal/public-links/${ws}/a%2Fb`)
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string))).toEqual([
    { revision: 3, blobs: ['file'] },
    { revision: 4 }
  ])
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
    Authorization: 'Bearer service-token',
    'Content-Type': 'application/json'
  })
  expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error')
})
it.each([403, 409, 429, 503])('preserves status %s without automatic retries', async (status) => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(null, {
      status,
      headers: { 'retry-after': '12' }
    })
  )
  const client = new PublicFileAccessClient('http://datalake', 'token')
  await expect(client.revoke(ws, 'link', 1)).rejects.toMatchObject({ status, retryAfterMs: 12000 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('does not treat an unexpected successful response as confirmation', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  await expect(new PublicFileAccessClient('http://datalake', 'token').revoke(ws, 'link', 1)).rejects.toBeInstanceOf(
    PublicFileAccessError
  )
})
it('aborts a hanging request at the configured timeout', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(
    async (_url, init) =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason)
        })
      })
  )
  await expect(new PublicFileAccessClient('http://datalake', 'token', 10).revoke(ws, 'link', 1)).rejects.toMatchObject({
    name: 'TimeoutError'
  })
})
it('rejects malformed revisions and path segments before making a request', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
  const client = new PublicFileAccessClient('http://datalake', 'token')
  await expect(client.revoke(ws, '..', 1)).rejects.toThrow()
  await expect(client.revoke(ws, 'link', 0)).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('reads registry state and preserves Retry-After on control read failures', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(Response.json({ revision: 2, revoked: false, blobs: ['file'] }))
  const client = new PublicFileAccessClient('http://datalake', 'token')
  expect(await client.state(ws, 'link')).toEqual({ revision: 2, revoked: false, blobs: ['file'] })
  fetchMock.mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '5' } }))
  await expect(client.activeLinks(ws, '')).rejects.toMatchObject({ status: 429, retryAfterMs: 5000 })
})
