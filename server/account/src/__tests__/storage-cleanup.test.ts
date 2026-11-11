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
import { type AccountDB } from '../types'
import { requireAdminOp, requireAdminSession } from '../adminOp'
import { isHumanAdmin } from '@hcengineering/server-token'
import { logAdminAction } from '../utils'
import {
  adminGetStorageCleanup,
  adminRequestStorageCleanup,
  persistStorageCleanupResult,
  retryStorageCleanupOutbox,
  setStorageCleanupProducer
} from '../storageCleanup'
import { getMigrations } from '../collections/postgres/migrations'

jest.mock('../adminOp', () => ({ requireAdminOp: jest.fn(), requireAdminSession: jest.fn() }))
jest.mock('../utils', () => ({ logAdminAction: jest.fn() }))
jest.mock('@hcengineering/server-token', () => ({
  isHumanAdmin: jest.fn(),
  generateToken: jest.fn(() => 'audit-token')
}))

const ctx = { warn: jest.fn() } as any
const actor = 'admin'
const send = jest.fn()
let rows: any[]
let db: AccountDB

beforeEach(() => {
  jest.clearAllMocks()
  rows = []
  db = {
    storageCleanup: {
      findOne: jest.fn(
        async (query: any) =>
          rows.find((row) => Object.entries(query).every(([key, value]) => row[key] === value)) ?? null
      ),
      find: jest.fn(async (query: any) =>
        rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).reverse()
      ),
      insertOne: jest.fn(async (row: any) => {
        rows.push({ ...row })
      }),
      update: jest.fn(async (query: any, values: any) => {
        for (const row of rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value))) {
          Object.assign(row, values)
        }
      })
    }
  } as unknown as AccountDB
  ;(requireAdminSession as jest.Mock).mockReturnValue({ account: actor })
  ;(isHumanAdmin as jest.Mock).mockReturnValue(true)
  send.mockResolvedValue(undefined)
  setStorageCleanupProducer({ send } as any)
})

describe('storage cleanup admission', () => {
  it('keeps polling a deletion when another admin creates a newer scan', async () => {
    const deletion = { id: 'delete-a', action: 'delete', status: 'running', actor }
    const scan = { id: 'scan-b', action: 'scan', status: 'ready', actor: 'other-admin' }
    rows.push(deletion, scan)
    expect(await adminGetStorageCleanup(ctx, db, null, 'token')).toEqual(scan)
    expect(await adminGetStorageCleanup(ctx, db, null, 'token', { jobId: deletion.id })).toEqual(deletion)
    await persistStorageCleanupResult(ctx, db, { jobId: deletion.id, status: 'completed', deletedCount: 1 })
    expect(await adminGetStorageCleanup(ctx, db, null, 'token', { jobId: deletion.id })).toMatchObject({
      id: deletion.id,
      status: 'completed',
      result: { deletedCount: 1 }
    })
  })

  it('does not substitute the latest job for an unknown requested identifier', async () => {
    rows.push({ id: 'scan-b', action: 'scan', status: 'ready' })
    expect(await adminGetStorageCleanup(ctx, db, null, 'token', { jobId: 'missing' })).toBeUndefined()
    await expect(adminGetStorageCleanup(ctx, db, null, 'token', { jobId: '' })).rejects.toThrow()
  })

  it('requires an admin session even for summaries', async () => {
    ;(requireAdminSession as jest.Mock).mockImplementationOnce(() => {
      throw new Error('forbidden')
    })
    await expect(adminGetStorageCleanup(ctx, db, null, 'token')).rejects.toThrow('forbidden')
    expect(db.storageCleanup.find).not.toHaveBeenCalled()
  })

  it('allows a read-only admin to scan but refuses deletion', async () => {
    ;(isHumanAdmin as jest.Mock).mockReturnValue(false)
    const scan = await adminRequestStorageCleanup(ctx, db, null, 'token', { action: 'scan', requestId: 'scan' })
    expect(scan.status).toBe('running')
    expect(requireAdminOp).not.toHaveBeenCalled()
    await expect(
      adminRequestStorageCleanup(ctx, db, null, 'token', {
        action: 'delete',
        scanId: 'scan',
        requestId: 'delete'
      })
    ).rejects.toThrow()
  })

  it('refuses an arbitrary scan before consuming an OTP', async () => {
    await expect(
      adminRequestStorageCleanup(ctx, db, null, 'token', {
        action: 'delete',
        scanId: 'missing',
        requestId: 'delete',
        otpCode: '123456'
      })
    ).rejects.toThrow()
    expect(requireAdminOp).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('requires an OTP for a ready scan and makes duplicate requests idempotent', async () => {
    rows.push({ id: 'scan', action: 'scan', status: 'ready' })
    const params = { action: 'delete' as const, scanId: 'scan', requestId: 'delete', otpCode: '123456' }
    const first = await adminRequestStorageCleanup(ctx, db, null, 'token', params)
    expect(requireAdminOp).toHaveBeenCalledWith(ctx, db, 'token', 'storage_cleanup_delete', '123456', 'scan')
    expect(await adminRequestStorageCleanup(ctx, db, null, 'token', params)).toEqual(first)
    expect(requireAdminOp).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('leaves a durable outbox row on queue failure and retries without another OTP', async () => {
    send.mockRejectedValueOnce(new Error('queue unavailable'))
    const job = await adminRequestStorageCleanup(ctx, db, null, 'token', { action: 'scan', requestId: 'retry' })
    expect(job.status).toBe('queued')
    await retryStorageCleanupOutbox(ctx, db)
    expect(rows[0].status).toBe('running')
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('storage cleanup results', () => {
  it('persists results before acknowledging and ignores replay', async () => {
    rows.push({ id: 'scan', action: 'scan', status: 'running', actor })
    const result = { jobId: 'scan', status: 'ready' as const, summary: { objects: 2, bytes: 3, byType: [] } }
    await persistStorageCleanupResult(ctx, db, result)
    expect(rows[0]).toMatchObject({ status: 'ready', result })
    await persistStorageCleanupResult(ctx, db, result)
    expect(db.storageCleanup.update).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenCalledTimes(1)
  })

  it('throws a database write failure so the queue retries', async () => {
    rows.push({ id: 'scan', action: 'scan', status: 'running', actor })
    ;(db.storageCleanup.update as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'))
    await expect(persistStorageCleanupResult(ctx, db, { jobId: 'scan', status: 'ready' })).rejects.toThrow(
      'database unavailable'
    )
    expect(rows[0].status).toBe('running')
  })

  it.each(['postgres', 'cockroach'] as const)('registers durable jobs and one deletion per scan for %s', (flavor) => {
    const migration = getMigrations('global_account', flavor).find(
      ([id]) => id === 'account_db_v57_storage_cleanup_jobs'
    )
    expect(migration?.[1]).toContain('storage_cleanup_jobs')
    expect(migration?.[1]).toContain("WHERE action = 'delete'")
  })
})
