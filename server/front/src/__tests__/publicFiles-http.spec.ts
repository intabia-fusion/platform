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

import { MeasureMetricsContext } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'
import { mkdirSync, mkdtempSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { start } from '../index'
import { canReadPublicFile } from '../publicFiles'

jest.mock('../publicFiles', () => ({ canReadPublicFile: jest.fn() }))
const mockCreateClient = jest.fn(async () => ({ close: async () => {} }))
const mockWorkspaceInfo = jest.fn(async () => ({ uuid: '11111111-1111-4111-8111-111111111111', url: 'test' }))
const mockSelectWorkspace = jest.fn(async () => ({
  workspace: '11111111-1111-4111-8111-111111111111',
  workspaceUrl: 'test',
  endpoint: 'ws://test'
}))
jest.mock('@hcengineering/server-client', () => ({ createClient: () => mockCreateClient() }))
jest.mock('@hcengineering/account-client', () => ({
  getClient: () => ({
    getWorkspaceInfo: () => mockWorkspaceInfo(),
    selectWorkspace: () => mockSelectWorkspace()
  })
}))
const errors: string[] = []
const logger = { info: () => {}, warn: () => {}, error: () => {}, logOperation: () => {}, close: async () => {} }
const stat = jest.fn(async () => ({ _id: 'file', size: 4, contentType: 'image/png', etag: 'version', modifiedOn: 1 }))
const get = jest.fn(async () => Readable.from(Buffer.from('data')))
const remove = jest.fn()
let base = ''
let stop: () => void
let setIntervalSpy: jest.SpyInstance

async function freePort (): Promise<number> {
  return await new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, () => {
      const { port } = srv.address() as any
      srv.close(() => {
        resolve(port)
      })
    })
  })
}

beforeAll(async () => {
  // start() schedules a temp-file cleanup that would keep jest open
  setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((() => 0) as any)
  jest.spyOn(console, 'log').mockImplementation(() => {})
  // start() indexes <PUBLIC_DIR>/dist, so it has to exist
  const publicDir = mkdtempSync(join(tmpdir(), 'front-files-'))
  mkdirSync(join(publicDir, 'dist'))
  process.env.PUBLIC_DIR = publicDir
  const port = await freePort()
  const ctx = new MeasureMetricsContext('test', {}, {}, undefined, logger)
  stop = start(
    ctx,
    {
      storageAdapter: { stat, get } as any,
      accountsUrl: 'http://account',
      uploadUrl: '/upload',
      filesUrl: '/files',
      modelVersion: '',
      version: '',
      rekoniUrl: '',
      telegramUrl: '',
      gmailUrl: '',
      calendarUrl: ''
    },
    port
  )
  base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${base}/config.json`)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
})

afterAll(() => {
  stop?.()
  setIntervalSpy.mockRestore()
})

beforeEach(() => {
  errors.length = 0
  stat.mockClear()
  remove.mockClear()
})

const ws = '11111111-1111-4111-8111-111111111111'
const token = generateToken('b6996120-416f-49cd-841e-e4a5d2e49c9b' as any, ws as any, { guest: 'true', linkId: 'link' })
const headers = { authorization: `Bearer ${token}` }
const allowed = canReadPublicFile as jest.Mock
beforeEach(() => {
  allowed.mockReset()
  allowed.mockResolvedValue(true)
  get.mockClear()
})

it('serves a permitted file with private revalidation headers', async () => {
  const res = await fetch(`${base}/files/public/${ws}/link/file`, { headers })
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-cache')
  expect(res.headers.get('etag')).toBe('"version"')
  expect(await res.text()).toBe('data')
})
it('checks access before returning 304 and refuses a revoked link', async () => {
  const conditional = { ...headers, 'if-none-match': '"version"' }
  let res = await fetch(`${base}/files/public/${ws}/link/file`, { headers: conditional })
  expect(res.status).toBe(304)
  expect(get).not.toHaveBeenCalled()
  allowed.mockResolvedValue(false)
  res = await fetch(`${base}/files/public/${ws}/link/file`, { headers: conditional })
  expect(res.status).toBe(404)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(stat).toHaveBeenCalledTimes(1)
})
it('refuses a different workspace before storage access', async () => {
  const res = await fetch(`${base}/files/public/other/link/file`, { headers })
  expect(res.status).toBe(403)
  expect(stat).not.toHaveBeenCalled()
})
it('supports HEAD without reading the body', async () => {
  const res = await fetch(`${base}/files/public/${ws}/link/file`, { headers, method: 'HEAD' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-length')).toBe('4')
  expect(get).not.toHaveBeenCalled()
})
it('rejects missing or invalid tokens', async () => {
  const res = await fetch(`${base}/files/public/${ws}/link/file`)
  expect(res.status).toBe(401)
  expect(allowed).not.toHaveBeenCalled()
})

it('serves a non-image attachment without changing its bytes', async () => {
  stat.mockResolvedValueOnce({
    _id: 'file',
    size: 4,
    contentType: 'application/zip',
    etag: 'zip-version',
    modifiedOn: 1
  })
  const res = await fetch(`${base}/files/public/${ws}/link/file?filename=archive.zip`, { headers })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/zip')
  expect(res.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''archive.zip")
  expect(await res.text()).toBe('data')
})
it('does not accept a member token as a public-link token', async () => {
  const member = generateToken('22222222-2222-4222-8222-222222222222' as any, ws as any)
  const res = await fetch(`${base}/files/public/${ws}/link/file`, { headers: { authorization: `Bearer ${member}` } })
  expect(res.status).toBe(403)
  expect(allowed).not.toHaveBeenCalled()
  expect(stat).not.toHaveBeenCalled()
})

it('isolates two public links in the same workspace and checks linkId against the token', async () => {
  const tokenB = generateToken('b6996120-416f-49cd-841e-e4a5d2e49c9b' as any, ws as any, {
    guest: 'true',
    linkId: 'link-b'
  })
  const cookieA = { cookie: `presentation-metadata-Token=${encodeURIComponent(token)}` }
  const cookieB = { cookie: `presentation-metadata-Token=${encodeURIComponent(tokenB)}` }
  allowed.mockImplementation(
    async (_client, link, file) => (link === 'link' && file === 'file-a') || (link === 'link-b' && file === 'file-b')
  )
  for (const [link, file, cookie] of [
    ['link', 'file-a', cookieA],
    ['link-b', 'file-b', cookieB],
    ['link', 'file-a', cookieA]
  ] as const) {
    const res = await fetch(`${base}/files/public/${ws}/${link}/${file}`, { headers: cookie })
    expect(res.status).toBe(200)
    await res.arrayBuffer()
  }
  const before = allowed.mock.calls.length
  const wrong = await fetch(`${base}/files/public/${ws}/link/file-a`, { headers: cookieB })
  expect(wrong.status).toBe(403)
  expect(allowed).toHaveBeenCalledTimes(before)
})

it('reuses one account lookup and client for 20 files and rechecks access on a cached 304', async () => {
  mockCreateClient.mockClear()
  mockWorkspaceInfo.mockClear()
  mockSelectWorkspace.mockClear()
  const bulk = generateToken('b6996120-416f-49cd-841e-e4a5d2e49c9b' as any, ws as any, {
    guest: 'true',
    linkId: 'bulk'
  })
  const bulkHeaders = { authorization: `Bearer ${bulk}` }
  await Promise.all(
    Array.from({ length: 20 }, async () => {
      const res = await fetch(`${base}/files/public/${ws}/bulk/file`, { headers: bulkHeaders })
      expect(res.status).toBe(200)
      await res.arrayBuffer()
    })
  )
  const res = await fetch(`${base}/files/public/${ws}/bulk/file`, {
    headers: { ...bulkHeaders, 'if-none-match': '"version"' }
  })
  expect(res.status).toBe(304)
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
  expect(mockWorkspaceInfo).toHaveBeenCalledTimes(1)
  expect(mockSelectWorkspace).toHaveBeenCalledTimes(1)
  expect(allowed).toHaveBeenCalledTimes(21)
  allowed.mockResolvedValue(false)
  const revoked = await fetch(`${base}/files/public/${ws}/bulk/file`, {
    headers: { ...bulkHeaders, 'if-none-match': '"version"' }
  })
  expect(revoked.status).toBe(404)
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
})
