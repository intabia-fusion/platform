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

/**
 * A reindex skipped on a workspace version mismatch is deferred through the account needs_reindex flag
 * and queued once the workspace is upgraded.
 */

import core, {
  MeasureMetricsContext,
  type Class,
  type Doc,
  type Domain,
  type Ref,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import {
  QueueWorkspaceEvent,
  workspaceEvents,
  type ConsumerControl,
  type PlatformQueue,
  type QueueWorkspaceMessage
} from '@hcengineering/server-core'
import { accountAttempts, WorkspaceManager } from '../manager'
import { WorkspaceIndexer } from '../workspace'
import { genMinModel } from './minmodel'

jest.mock('@hcengineering/server-client', () => ({
  ...jest.requireActual('@hcengineering/server-client'),
  getAccountClient: jest.fn()
}))

jest.mock('@hcengineering/server-token', () => ({
  ...jest.requireActual('@hcengineering/server-token'),
  generateToken: jest.fn(() => 'service-token')
}))

const ws = 'ws-1' as WorkspaceUuid
const model = genMinModel()
const ctx = new MeasureMetricsContext('manager-test', {})
const control: ConsumerControl = { pause: jest.fn(), heartbeat: jest.fn().mockResolvedValue(undefined) }
// withRetry waits 1 s between account attempts.
const accountRetryMs = accountAttempts * 1000

describe('fulltext deferred reindex', () => {
  let mgr: WorkspaceManager
  let producer: { send: jest.Mock, close: jest.Mock }
  let indexer: { doOperation: jest.Mock, close: jest.Mock }
  let createSpy: jest.SpyInstance
  // Stands in for workspace_status.needs_reindex.
  let flag: boolean
  let sameVersion: boolean
  let lastVisit: number
  let account: {
    getWorkspaceInfo: jest.Mock
    setNeedsReindex: jest.Mock
    takeNeedsReindex: jest.Mock
  }

  async function fulltextEvent (value: QueueWorkspaceMessage): Promise<void> {
    await (mgr as any).processFulltextEvent({ workspace: ws, value }, control)
  }

  async function workspaceEvent (value: QueueWorkspaceMessage): Promise<void> {
    await (mgr as any).processWorkspaceEvent(ctx, { workspace: ws, value }, control)
  }

  function queuedFullReindexes (): number {
    return producer.send.mock.calls.filter(([, , msgs]) => msgs[0]?.type === QueueWorkspaceEvent.FullReindex).length
  }

  beforeEach(() => {
    jest.clearAllMocks()
    producer = { send: jest.fn().mockResolvedValue(undefined), close: jest.fn() }
    const queue = { getProducer: jest.fn(() => producer) } as unknown as PlatformQueue
    mgr = new WorkspaceManager(ctx, model, {
      queue,
      dbURL: '',
      hulylakeUrl: '',
      config: {} as any,
      externalStorage: {} as any,
      elasticIndexName: 'test',
      serverSecret: '',
      accountsUrl: ''
    })

    // doOperation false: the operation itself is not run, the indexer stays cached.
    indexer = { doOperation: jest.fn().mockResolvedValue(false), close: jest.fn().mockResolvedValue(true) }
    createSpy = jest.spyOn(WorkspaceIndexer, 'create').mockResolvedValue(indexer as any)

    flag = false
    sameVersion = false
    lastVisit = 0
    account = {
      getWorkspaceInfo: jest.fn(async () => ({
        uuid: ws,
        // One major ahead: never matches what the pod indexes.
        versionMajor: mgr.supportedVersion.major + (sameVersion ? 0 : 1),
        versionMinor: mgr.supportedVersion.minor,
        versionPatch: mgr.supportedVersion.patch,
        lastVisit,
        needsReindex: flag
      })),
      setNeedsReindex: jest.fn(async () => {
        flag = true
      }),
      takeNeedsReindex: jest.fn(async () => {
        const was = flag
        flag = false
        return was
      })
    }
    ;(getAccountClient as jest.Mock).mockReturnValue(account)
  })

  afterEach(() => {
    jest.useRealTimers()
    createSpy.mockRestore()
  })

  describe('setting the flag', () => {
    it('withIndexer reports wrong-version and does not run the operation', async () => {
      const op = jest.fn()

      expect(await mgr.withIndexer(ctx, ws, 'token', true, op)).toBe('wrong-version')
      expect(indexer.doOperation).not.toHaveBeenCalled()
    })

    it('full reindex on an idle workspace with another version sets the flag', async () => {
      await fulltextEvent(workspaceEvents.fullReindex())

      expect(flag).toBe(true)
    })

    it('partial reindex skipped on a version mismatch sets the same flag', async () => {
      await fulltextEvent(workspaceEvents.reindex('task' as Domain, [core.class.Doc as Ref<Class<Doc>>]))

      expect(flag).toBe(true)
    })

    it('a recently visited workspace sets the flag once the version retries run out', async () => {
      jest.useFakeTimers()
      lastVisit = Date.now()

      const done = fulltextEvent(workspaceEvents.fullReindex())
      await jest.advanceTimersByTimeAsync(40000)
      await done

      expect(account.getWorkspaceInfo).toHaveBeenCalledTimes(4)
      expect(flag).toBe(true)
    })

    it('an unavailable workspace is not a version mismatch: no flag', async () => {
      account.getWorkspaceInfo.mockRejectedValue(new Error('account down'))

      await fulltextEvent(workspaceEvents.fullReindex())

      expect(account.setNeedsReindex).not.toHaveBeenCalled()
    })

    it('a failing flag write is retried accountAttempts times, then logged without failing the message', async () => {
      jest.useFakeTimers()
      account.setNeedsReindex.mockRejectedValue(new Error('account down'))

      const done = fulltextEvent(workspaceEvents.fullReindex())
      await jest.advanceTimersByTimeAsync(accountRetryMs)
      await expect(done).resolves.toBeUndefined()

      expect(account.setNeedsReindex).toHaveBeenCalledTimes(accountAttempts)
    })

    it('transactions skipped on a version mismatch do not set the flag, but are logged as dropped', async () => {
      const error = jest.spyOn(ctx, 'error')

      await (mgr as any).processTransactions([{ workspace: ws, value: {} }], control)

      expect(account.getWorkspaceInfo).toHaveBeenCalled()
      expect(account.setNeedsReindex).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith('dropped transactions, indexer not available', {
        ws,
        count: 1,
        reason: 'wrong-version'
      })
      error.mockRestore()
    })
  })

  describe('partial reindex from the workspace topic', () => {
    const reindex = workspaceEvents.reindex('task' as Domain, [core.class.Doc as Ref<Class<Doc>>])

    it('is forwarded to the fulltext topic as is', async () => {
      await workspaceEvent(reindex)

      expect(producer.send).toHaveBeenCalledTimes(1)
      expect(producer.send).toHaveBeenCalledWith(ctx, ws, [reindex])
    })

    it('is dropped while the workspace is restoring', async () => {
      mgr.restoring.add(ws)

      await workspaceEvent(reindex)

      expect(producer.send).not.toHaveBeenCalled()
    })
  })

  describe('running the deferred reindex', () => {
    it('Upgraded with the flag queues one full reindex and clears the flag', async () => {
      flag = true

      await workspaceEvent(workspaceEvents.upgraded())

      expect(queuedFullReindexes()).toBe(1)
      expect(flag).toBe(false)
    })

    it('Upgraded without the flag queues nothing', async () => {
      await workspaceEvent(workspaceEvents.upgraded())

      expect(account.takeNeedsReindex).toHaveBeenCalledTimes(1)
      expect(producer.send).not.toHaveBeenCalled()
    })

    it('Upgraded puts the flag back when queueing fails', async () => {
      flag = true
      producer.send.mockRejectedValue(new Error('queue down'))

      await workspaceEvent(workspaceEvents.upgraded())

      expect(flag).toBe(true)
    })

    it('full reindex takes the flag first, so creating its indexer does not queue a second one', async () => {
      flag = true
      sameVersion = true

      await fulltextEvent(workspaceEvents.fullReindex())

      expect(indexer.doOperation).toHaveBeenCalledTimes(1)
      expect(producer.send).not.toHaveBeenCalled()
      expect(flag).toBe(false)
    })

    it('full reindex still on another version puts the taken flag back', async () => {
      flag = true

      await fulltextEvent(workspaceEvents.fullReindex())

      expect(account.takeNeedsReindex).toHaveBeenCalledTimes(1)
      expect(flag).toBe(true)
    })

    it('full reindex that took the flag but found no workspace puts it back', async () => {
      flag = true
      account.getWorkspaceInfo.mockRejectedValue(new Error('account down'))

      await fulltextEvent(workspaceEvents.fullReindex())

      expect(flag).toBe(true)
    })

    it('an indexer created with the flag set queues the reindex, with the service token', async () => {
      flag = true
      sameVersion = true

      expect(await mgr.withIndexer(ctx, ws, 'user-token', true, jest.fn())).toBe('done')

      expect(queuedFullReindexes()).toBe(1)
      expect(flag).toBe(false)
      expect(getAccountClient).toHaveBeenCalledWith('user-token')
      expect(getAccountClient).toHaveBeenCalledWith('service-token')
    })

    it('a failing take does not break indexer creation and leaves the flag', async () => {
      jest.useFakeTimers()
      flag = true
      sameVersion = true
      account.takeNeedsReindex.mockRejectedValue(new Error('account down'))

      const done = mgr.withIndexer(ctx, ws, 'token', true, jest.fn())
      await jest.advanceTimersByTimeAsync(accountRetryMs)

      expect(await done).toBe('done')
      expect(account.takeNeedsReindex).toHaveBeenCalledTimes(accountAttempts)
      expect(producer.send).not.toHaveBeenCalled()
      expect(flag).toBe(true)
    })
  })
})
