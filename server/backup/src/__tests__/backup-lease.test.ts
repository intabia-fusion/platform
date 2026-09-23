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

import {
  generateUuid,
  MeasureMetricsContext,
  newMetrics,
  type WorkspaceInfoWithStatus,
  type WorkspaceUuid
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { type AccountDB } from '@hcengineering/account'
import {
  type DbConfiguration,
  type Pipeline,
  type PipelineFactory,
  type StorageAdapter
} from '@hcengineering/server-core'
import { clearInterval as nodeClearInterval } from 'node:timers'

import { getAccountDB } from '@hcengineering/account'
import { getAccountClient } from '@hcengineering/server-client'
import { createStorageBackupStorage } from '../storage'
import { backup } from '../backup'
import { BackupWorker, doBackupWorkspace, type BackupConfig } from '../service'

jest.mock('@hcengineering/server-client', () => ({
  getAccountClient: jest.fn()
}))

jest.mock('@hcengineering/account', () => ({
  getAccountDB: jest.fn()
}))

jest.mock('../storage', () => ({
  createStorageBackupStorage: jest.fn()
}))

// node:timers' exports are non-configurable, so spyOn can't wrap clearInterval directly;
// service.ts imports it from here too, so this jest.fn observes its calls.
jest.mock('node:timers', () => {
  const actual = jest.requireActual('node:timers')
  return { ...actual, clearInterval: jest.fn(actual.clearInterval) }
})

jest.mock('../backup', () => ({
  backup: jest.fn()
}))

// Mirrors the private backupLeaseRenewMs in service.ts.
const renewIntervalMs = 30000

const ws = {
  uuid: generateUuid() as WorkspaceUuid,
  url: 'ws-1',
  name: 'ws-1'
} as unknown as WorkspaceInfoWithStatus

const config: BackupConfig = {
  AccountsURL: 'http://accounts',
  AccountsDbURL: 'postgresql://localhost/accounts',
  Token: 'token',
  Interval: 0,
  CoolDown: 0,
  Timeout: 0,
  BucketName: 'backup-bucket',
  SkipWorkspaces: '',
  Parallel: 1,
  KeepSnapshots: 10,
  DeletedRetentionDays: 0
}

const getConfig = (): DbConfiguration => ({}) as unknown as DbConfiguration

// Fake timers replace only setInterval/setTimeout; plain awaited mocks still resolve through
// the real microtask queue, so a handful of empty ticks is enough to reach the backup() call.
async function flushPromises (): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

describe('BackupWorker lease handling', () => {
  let rootCtx: MeasureMetricsContext
  let updateBackupLease: jest.MockedFunction<
    (owner: string, action: 'acquire' | 'renew' | 'release', ttlMs?: number) => Promise<boolean>
  >
  let updateBackupInfo: jest.Mock
  let pipelineClose: jest.Mock
  let pipelineFactory: jest.MockedFunction<PipelineFactory>
  let backupMock: jest.MockedFunction<typeof backup>

  const makeWorker = (): BackupWorker =>
    new BackupWorker({} as unknown as StorageAdapter, config, pipelineFactory, getConfig, 'test-region')

  beforeEach(() => {
    ;(nodeClearInterval as unknown as jest.Mock).mockClear()
    rootCtx = new MeasureMetricsContext('test', {}, {}, newMetrics())
    updateBackupLease = jest.fn()
    updateBackupInfo = jest.fn().mockResolvedValue(undefined)
    ;(getAccountClient as jest.Mock).mockReturnValue({ updateBackupLease, updateBackupInfo })
    ;(getAccountDB as jest.Mock).mockResolvedValue([{} as unknown as AccountDB, jest.fn()])
    ;(createStorageBackupStorage as jest.Mock).mockResolvedValue({})
    pipelineClose = jest.fn().mockResolvedValue(undefined)
    pipelineFactory = jest.fn().mockResolvedValue({ close: pipelineClose } as unknown as Pipeline)
    backupMock = backup as jest.MockedFunction<typeof backup>
    backupMock.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('does not back up when the lease is not acquired', async () => {
    updateBackupLease.mockResolvedValue(false)
    const worker = makeWorker()

    const result = await worker.doBackup(rootCtx, ws, undefined, true)

    expect(result).toBe(false)
    expect(backupMock).not.toHaveBeenCalled()
    expect(updateBackupLease.mock.calls.some(([, action]) => action === 'release')).toBe(false)
  })

  it('releases exactly once and clears the renew interval once backup succeeds', async () => {
    const clearIntervalSpy = nodeClearInterval as unknown as jest.Mock
    updateBackupLease.mockResolvedValue(true)
    backupMock.mockResolvedValue({ result: true, dataSize: 1, blobsSize: 2, backupSize: 3 })
    const worker = makeWorker()

    await worker.doBackup(rootCtx, ws, undefined, true)

    const releaseCalls = updateBackupLease.mock.calls.filter(([, action]) => action === 'release')
    expect(releaseCalls).toHaveLength(1)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('cancels the running backup when a renew reports the lease lost', async () => {
    jest.useFakeTimers()
    updateBackupLease.mockImplementation(async (_owner, action) => {
      if (action === 'acquire') return true
      if (action === 'renew') return false
      return true
    })
    let isCanceled: (() => boolean) | undefined
    let resolveBackup: (v: Awaited<ReturnType<typeof backup>>) => void = () => {}
    backupMock.mockImplementation(async (_ctx, _pipeline, _wsIds, _storage, _accountDb, options) => {
      isCanceled = options?.isCanceled
      return await new Promise((resolve) => {
        resolveBackup = resolve
      })
    })
    const worker = makeWorker()
    const done = worker.doBackup(rootCtx, ws, undefined, true)
    await flushPromises()

    expect(isCanceled?.()).toBe(false)

    await jest.advanceTimersByTimeAsync(renewIntervalMs)
    expect(isCanceled?.()).toBe(true)

    resolveBackup({ result: true, dataSize: 0, blobsSize: 0, backupSize: 0 })
    await done
  })

  it('needs two consecutive renew failures to cancel', async () => {
    jest.useFakeTimers()
    updateBackupLease.mockImplementation(async (_owner, action) => {
      if (action === 'acquire') return true
      if (action === 'renew') throw new Error('network blip')
      return true
    })
    let isCanceled: (() => boolean) | undefined
    let resolveBackup: (v: Awaited<ReturnType<typeof backup>>) => void = () => {}
    backupMock.mockImplementation(async (_ctx, _pipeline, _wsIds, _storage, _accountDb, options) => {
      isCanceled = options?.isCanceled
      return await new Promise((resolve) => {
        resolveBackup = resolve
      })
    })
    const worker = makeWorker()
    const done = worker.doBackup(rootCtx, ws, undefined, true)
    await flushPromises()

    await jest.advanceTimersByTimeAsync(renewIntervalMs)
    expect(isCanceled?.()).toBe(false)

    await jest.advanceTimersByTimeAsync(renewIntervalMs)
    expect(isCanceled?.()).toBe(true)

    resolveBackup({ result: true, dataSize: 0, blobsSize: 0, backupSize: 0 })
    await done
  })

  it('backs up without a lease when the account service does not support it yet, warning once', async () => {
    updateBackupLease.mockImplementation(async (_owner, action) => {
      if (action === 'acquire') {
        throw new PlatformError(
          new Status(Severity.ERROR, platform.status.UnknownMethod, { method: 'updateBackupLease' })
        )
      }
      throw new Error(`unexpected ${action} without a lease`)
    })
    backupMock.mockResolvedValue({ result: true, dataSize: 0, blobsSize: 0, backupSize: 0 })
    const warnSpy = jest.spyOn(rootCtx, 'warn')
    const worker = makeWorker()

    const result1 = await worker.doBackup(rootCtx, ws, undefined, true)
    const result2 = await worker.doBackup(rootCtx, ws, undefined, true)

    expect(result1).toBe(true)
    expect(result2).toBe(true)
    expect(backupMock).toHaveBeenCalledTimes(2)
    expect(updateBackupLease).toHaveBeenCalledTimes(2)
    const unsupportedWarnings = warnSpy.mock.calls.filter(
      ([message]) => message === 'account service does not support backup lease yet, backing up without one'
    )
    expect(unsupportedWarnings).toHaveLength(1)
  })

  it('still releases the lease when pipeline.close throws', async () => {
    updateBackupLease.mockResolvedValue(true)
    backupMock.mockResolvedValue({ result: true, dataSize: 0, blobsSize: 0, backupSize: 0 })
    pipelineClose.mockRejectedValue(new Error('close failed'))
    const worker = makeWorker()

    await expect(worker.doBackup(rootCtx, ws, undefined, true)).rejects.toThrow('close failed')

    expect(updateBackupLease.mock.calls.some(([, action]) => action === 'release')).toBe(true)
  })

  // Archiving and migration back up a workspace that is no longer active: a lease there could never
  // be taken and the workspace would stay in archiving-backup forever.
  it('backs up without a lease when called by workspace-service', async () => {
    backupMock.mockResolvedValue({ result: true, dataSize: 0, blobsSize: 0, backupSize: 0 })

    const result = await doBackupWorkspace(
      rootCtx,
      { ...ws, mode: 'archiving-backup' } as unknown as WorkspaceInfoWithStatus,
      {} as unknown as StorageAdapter,
      config,
      pipelineFactory,
      getConfig,
      'test-region',
      1,
      []
    )

    expect(result).toBe(true)
    expect(backupMock).toHaveBeenCalledTimes(1)
    expect(updateBackupLease).not.toHaveBeenCalled()
  })
})
