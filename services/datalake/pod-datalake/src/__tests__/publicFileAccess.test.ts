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
import { generateToken } from '@hcengineering/server-token'
import express from 'express'
import { type Server } from 'http'
import { publicFileAccessRouter } from '../handlers/publicFileAccess'
import { type PublicFileAccess } from '../datalake/publicFileAccess'

const registry = {
  replace: jest.fn(async () => {}),
  revoke: jest.fn(async () => {}),
  canRead: jest.fn(async () => true)
}
let server: Server
let base: string
const path = '/11111111-1111-4111-8111-111111111111/link'
const service = generateToken(systemAccountUuid, undefined, { service: 'public-file-access' })
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use(publicFileAccessRouter(registry as unknown as PublicFileAccess))
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.code ?? 500).end())
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${(server.address() as any).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve()
    })
  )
})
beforeEach(() => {
  jest.clearAllMocks()
})

it.each([
  '',
  'invalid',
  generateToken(systemAccountUuid, undefined),
  generateToken(systemAccountUuid, undefined, { service: 'public-file-access', guest: 'true' }),
  generateToken('b6996120-416f-49cd-841e-e4a5d2e49c9b' as any, undefined, { admin: 'true' })
])('rejects non-publisher credentials', async (token) => {
  for (const method of ['PUT', 'DELETE', 'GET']) {
    const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(403)
  }
  expect(registry.replace).not.toHaveBeenCalled()
  expect(registry.revoke).not.toHaveBeenCalled()
})
it('accepts only validated publisher requests', async () => {
  const headers = { authorization: `Bearer ${service}`, 'content-type': 'application/json' }
  expect(
    (await fetch(base + path, { method: 'PUT', headers, body: JSON.stringify({ revision: 1, blobs: ['file'] }) }))
      .status
  ).toBe(204)
  expect(registry.replace).toHaveBeenCalledWith(path.split('/')[1], 'link', 1, ['file'])
  expect(
    (await fetch(base + path, { method: 'PUT', headers, body: JSON.stringify({ revision: 1, blobs: [null] }) })).status
  ).toBe(400)
  expect((await fetch(base + path + '/files/file', { headers })).status).toBe(200)
  expect((await fetch(base + path, { method: 'DELETE', headers, body: JSON.stringify({ revision: 2 }) })).status).toBe(
    204
  )
})
