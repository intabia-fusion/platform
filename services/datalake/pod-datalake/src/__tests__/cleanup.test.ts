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

import { MeasureMetricsContext, systemAccountUuid, type PersonUuid } from '@hcengineering/core'
import { ADMIN_SESSION_TTL_SEC, generateToken } from '@hcengineering/server-token'
import express from 'express'
import { type AddressInfo } from 'net'
import { cleanupDatalake, getStorageCleanupSummary } from '../cleanup'
import { withStorageAdminAuthorization, withSystemAuthorization } from '../middleware'

it('calculates an estimate using only a read query', async () => {
  const execute = jest.fn().mockResolvedValue([{ contentType: 'text/plain', count: 2, bytes: 10 }])
  await expect(getStorageCleanupSummary({ execute } as any)).resolves.toEqual({
    objects: 2,
    bytes: 10,
    byType: [{ contentType: 'text/plain', count: 2, bytes: 10 }]
  })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(execute.mock.calls[0][0].trim()).toMatch(/^SELECT /)
})

it('only allows fresh human admin sessions to read the estimate', async () => {
  const execute = jest.fn().mockResolvedValue([])
  const app = express()
  app.get('/admin/storage/unused', withStorageAdminAuthorization, (_req, res, next) => {
    void getStorageCleanupSummary({ execute } as any)
      .then((summary) => res.json(summary))
      .catch(next)
  })
  const server = app.listen(0)
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/storage/unused`
  const account = '85da8aa0-7334-41bc-b69f-5f05ce88483c' as PersonUuid
  const now = Math.floor(Date.now() / 1000)
  const fresh = String(now)
  const cases: Array<[PersonUuid, Record<string, string>, number]> = [
    [account, {}, 403],
    [account, { admin: 'true' }, 403],
    [account, { admin: 'true', mfaAt: fresh, service: 'test' }, 403],
    [systemAccountUuid as PersonUuid, { admin: 'true', mfaAt: fresh }, 403],
    [account, { admin: 'true', mfaAt: String(now - ADMIN_SESSION_TTL_SEC - 1) }, 403],
    [account, { admin: 'true', mfaAt: fresh }, 200],
    [account, { billingAdmin: 'true', mfaAt: fresh }, 200]
  ]
  try {
    for (const [identity, extra, status] of cases) {
      const token = generateToken(identity, undefined, extra)
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      expect(response.status).toBe(status)
      if (status === 200) expect(await response.json()).toEqual({ objects: 0, bytes: 0, byType: [] })
    }
    expect(execute).toHaveBeenCalledTimes(2)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err !== undefined) reject(err)
        else resolve()
      })
    })
  }
})

it('allows only verified system tokens to start cleanup', async () => {
  const app = express()
  const handler = jest.fn()
  app.post('/admin/storage/cleanup', withSystemAuthorization, (_req, res) => {
    handler()
    res.sendStatus(200)
  })
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.sendStatus(401)
  )
  const server = app.listen(0)
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/storage/cleanup`
  const account = '85da8aa0-7334-41bc-b69f-5f05ce88483c' as PersonUuid
  const system = generateToken(systemAccountUuid, undefined, { service: 'tool' })
  const parts = system.split('.')
  const corrupted = `${parts[0]}.${parts[1]}.${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`
  try {
    for (const [token, status] of [
      [system, 200],
      [generateToken(account, undefined), 401],
      [generateToken(account, undefined, { admin: 'true' }), 401],
      [generateToken(account, undefined, { service: 'tool' }), 401],
      [corrupted, 401]
    ] as Array<[string, number]>) {
      expect((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(status)
    }
    expect(handler).toHaveBeenCalledTimes(1)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error == null) resolve()
        else reject(error)
      })
    })
  }
})

it('deletes the object before its metadata and propagates failures', async () => {
  const ctx = new MeasureMetricsContext('cleanup-test', {})
  const object = { hash: 'a', location: 'eu', filename: 'file', size: 10 }
  const execute = jest
    .fn()
    .mockResolvedValueOnce([{ location: 'eu' }])
    .mockResolvedValueOnce([object])
  const removeData = jest.fn()
  const remove = jest.fn().mockRejectedValueOnce(new Error('S3 failed'))
  const db = { execute, removeData } as any
  const buckets = [{ location: 'eu', bucket: { delete: remove } }] as any
  await expect(cleanupDatalake(ctx, db, buckets)).rejects.toThrow('S3 failed')
  expect(removeData).not.toHaveBeenCalled()

  execute.mockResolvedValueOnce([{ location: 'eu' }]).mockResolvedValueOnce([object])
  const missing = new Error('missing')
  missing.name = 'NoSuchKey'
  remove.mockRejectedValueOnce(missing)
  removeData.mockRejectedValueOnce(new Error('DB failed'))
  await expect(cleanupDatalake(ctx, db, buckets)).rejects.toThrow('DB failed')

  execute
    .mockResolvedValueOnce([{ location: 'eu' }])
    .mockResolvedValueOnce([object])
    .mockResolvedValueOnce([])
  await expect(cleanupDatalake(ctx, db, buckets)).resolves.toEqual({ objects: 1, bytes: 10 })
  expect(removeData).toHaveBeenCalledTimes(2)
  expect(remove.mock.invocationCallOrder[2]).toBeLessThan(removeData.mock.invocationCallOrder[1])
})

it('fails before deleting objects when a location is not configured', async () => {
  const ctx = new MeasureMetricsContext('cleanup-test', {})
  const execute = jest.fn().mockResolvedValue([{ location: 'eu' }, { location: 'weur' }])
  const remove = jest.fn()
  await expect(
    cleanupDatalake(ctx, { execute } as any, [{ location: 'eu', bucket: { delete: remove } }] as any)
  ).rejects.toThrow('Datalake location weur is not configured')
  expect(remove).not.toHaveBeenCalled()
})
