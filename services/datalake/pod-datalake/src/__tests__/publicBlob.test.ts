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

import { MeasureMetricsContext, type WorkspaceUuid, type PersonUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'
import express from 'express'
import { request, type Server, type IncomingHttpHeaders } from 'http'
import { Readable } from 'stream'
import { type Datalake } from '../datalake'
import { publicBlobRouter } from '../handlers/publicBlob'
import { handleBlobGet } from '../handlers/blob'
import { withAuthorization, withBlob } from '../middleware'

const workspace = '11111111-1111-4111-8111-111111111111' as WorkspaceUuid
const otherWorkspace = '22222222-2222-4222-8222-222222222222' as WorkspaceUuid
const account = 'b6996120-416f-49cd-841e-e4a5d2e49c9b' as PersonUuid
const guest = (linkId = 'link', ws = workspace): string => generateToken(account, ws, { guest: 'true', linkId })
const path = `/blob/public/${workspace}/link/file`
const head = {
  name: 'file',
  etag: 'hash',
  size: 4,
  contentType: 'image/png',
  lastModified: 1700000000000,
  cacheControl: 'public, max-age=31536000, immutable'
}
const allowed = new Set<string>()
const registry = { canRead: jest.fn(async (_ws: string, link: string, blob: string) => allowed.has(`${link}/${blob}`)) }
let body: Readable
const storage = {
  head: jest.fn(async () => head),
  get: jest.fn(async (_ctx, _ws, _name, options) => {
    body = Readable.from([Buffer.from(options.range === undefined ? 'data' : 'da')])
    return {
      ...head,
      body,
      bodyLength: options.range === undefined ? 4 : 2,
      bodyEtag: 'part',
      bodyRange: options.range === undefined ? undefined : 'bytes 0-1/4'
    }
  })
}
let server: Server
let port: number
async function read (
  method = 'GET',
  token: string | null = guest(),
  url = path,
  headers: IncomingHttpHeaders = {}
): Promise<{
  status: number
  headers: IncomingHttpHeaders
  body: string
}> {
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: url,
        method,
        headers: { ...(token === null ? {} : { Authorization: `Bearer ${token}` }), ...headers }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}
beforeAll(async () => {
  const app = express()
  app.use(
    '/blob/public',
    publicBlobRouter(new MeasureMetricsContext('test', {}), storage as unknown as Datalake, registry)
  )
  app.get('/blob/:workspace/:name', withAuthorization, withBlob, (req, res, next) => {
    void handleBlobGet(new MeasureMetricsContext('test', {}), req, res, storage as unknown as Datalake).catch(next)
  })
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.code ?? 500).end())
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  port = (server.address() as any).port
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
  allowed.clear()
  allowed.add('link/file')
})
it('serves bytes, metadata and ranges through the existing blob handlers with private revalidation', async () => {
  const get = await read('GET', guest(), path + '/picture.png')
  expect(get.status).toBe(200)
  expect(get.body).toBe('data')
  expect(get.headers['content-type']).toBe('image/png')
  expect(get.headers['content-disposition']).toContain('picture.png')
  expect(get.headers['cache-control']).toBe('private, no-cache')
  const metadata = await read('HEAD')
  expect(metadata.status).toBe(200)
  expect(metadata.body).toBe('')
  expect(metadata.headers.etag).toBe(get.headers.etag)
  expect(metadata.headers['cache-control']).toBe('private, no-cache')
  const range = await read('GET', guest(), path, { range: 'bytes=0-1' })
  expect(range.status).toBe(206)
  expect(range.body).toBe('da')
  expect(range.headers['content-range']).toBe('bytes 0-1/4')
  const ordinary = await read('GET', generateToken(account, workspace), `/blob/${workspace}/file`)
  expect(ordinary.status).toBe(200)
  expect(ordinary.headers['cache-control']).toBe(head.cacheControl)
})
it('checks current permission before conditional GET and HEAD, including after revocation', async () => {
  const etag = (await read()).headers.etag
  for (const method of ['GET', 'HEAD']) {
    const res = await read(method, guest(), path, { 'if-none-match': etag })
    expect(res.status).toBe(304)
    expect(res.body).toBe('')
    expect(res.headers['cache-control']).toBe('private, no-cache')
  }
  expect(body.destroyed).toBe(true)
  allowed.clear()
  storage.get.mockClear()
  storage.head.mockClear()
  for (const method of ['GET', 'HEAD']) {
    const res = await read(method, guest(), path, { 'if-none-match': etag })
    expect(res.status).toBe(404)
    expect(res.headers['cache-control']).toBe('no-store')
  }
  expect(storage.get).not.toHaveBeenCalled()
  expect(storage.head).not.toHaveBeenCalled()
  expect(registry.canRead).toHaveBeenCalledTimes(5)
})
it('keeps an independent link to the same blob readable after the first link loses access', async () => {
  allowed.add('second/file')
  allowed.delete('link/file')
  expect((await read()).status).toBe(404)
  expect((await read('GET', guest('second'), path.replace('/link/', '/second/'))).body).toBe('data')
})
it('rejects missing, invalid, forged and mismatched credentials before reading the registry or storage', async () => {
  const forged = guest().split('.')
  forged[2] = 'invalid'
  for (const token of [
    '',
    'invalid',
    forged.join('.'),
    generateToken(account, workspace),
    guest('another'),
    guest('link', otherWorkspace)
  ]) {
    expect([401, 404]).toContain((await read('GET', token)).status)
  }
  expect(registry.canRead).not.toHaveBeenCalled()
  expect(storage.get).not.toHaveBeenCalled()
})
it('does not authorize writes or ordinary blob routes with the public guest token', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await read(method)).status).toBe(405)
  expect((await read('GET', guest(), `/blob/${workspace}/file`)).status).toBe(401)
  expect(registry.canRead).not.toHaveBeenCalled()
})
it('uses only the dedicated public cookie even when a member workspace cookie is present', async () => {
  const cookie = `presentation-metadata-Token=${generateToken(account, workspace)}; public-file-token=${encodeURIComponent(guest())}`
  expect((await read('GET', null, path, { cookie })).status).toBe(200)
  const other = `presentation-metadata-Token=${generateToken(account, workspace)}; public-file-token=${encodeURIComponent(guest('second'))}`
  expect((await read('GET', null, path, { cookie: other })).status).toBe(404)
  expect((await read('GET', null, path, { cookie: 'public-file-token=%invalid' })).status).toBe(401)
})
it('fails closed without cacheable responses when the registry is unavailable', async () => {
  registry.canRead.mockRejectedValueOnce(new Error('database unavailable'))
  const res = await read()
  expect(res.status).toBe(500)
  expect(res.headers['cache-control']).toBe('no-store')
  expect(storage.get).not.toHaveBeenCalled()
})
