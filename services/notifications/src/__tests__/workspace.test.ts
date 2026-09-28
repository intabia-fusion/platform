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

// '../config' throws at import time without env vars, so it's mocked (like other test files);
// server-pipeline/middleware resolve fine as real deps under ts-jest.
import core from '@hcengineering/core'

import { QueueTopic } from '@hcengineering/server-core'

import Workspace, { areHeldPushesRead, isTransientError } from '../workspace'
import { emptyResult } from '../utils/utils'
import type { Result } from '../types'

// jest hoists jest.mock above the imports.
jest.mock('../config', () => ({
  __esModule: true,
  default: {
    ApplyTxBatchSize: 100,
    LatestNotificationsSliceSize: 5
  }
}))

describe('isTransientError', () => {
  it('is true for errors retryNetworkErrors accepts (ECONNREFUSED)', () => {
    expect(isTransientError(new Error('ECONNREFUSED'))).toBe(true)
  })

  it('is true for an Error with name FetchError', () => {
    const e = new Error('some fetch failure')
    e.name = 'FetchError'
    expect(isTransientError(e)).toBe(true)
  })

  it.each([408, 425, 429, 500, 502, 503, 504])('is true for an error object with httpStatus %d', (httpStatus) => {
    expect(isTransientError({ httpStatus })).toBe(true)
  })

  it.each([400, 403, 404])('is false for an error object with httpStatus %d', (httpStatus) => {
    expect(isTransientError({ httpStatus })).toBe(false)
  })

  it('is false for a plain Error unrelated to network issues', () => {
    expect(isTransientError(new Error('bad request'))).toBe(false)
  })
})

// Workspace's constructor is private only at the type level.
// Object.create(Workspace.prototype) builds a bare instance we hand-fill for applyResult.
describe('Workspace.applyResult (private, exercised via a bare instance)', () => {
  function makeInstance (overrides: { tx?: jest.Mock, send?: jest.Mock, schedule?: jest.Mock }): any {
    const instance: any = Object.create((Workspace as any).prototype)
    instance.ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    instance.cache = { tx: jest.fn(), resetContexts: jest.fn(), getCachedContext: jest.fn() }
    instance.client = { findOne: jest.fn() }
    instance.producer = { send: overrides.send ?? jest.fn().mockResolvedValue(undefined) }
    instance.timeMachine = { send: overrides.schedule ?? jest.fn().mockResolvedValue(undefined) }
    instance.ws = { uuid: 'ws-1' }
    instance.rest = { tx: overrides.tx ?? jest.fn().mockResolvedValue(undefined) }
    instance.txFactory = {
      createTxApplyIf: jest.fn().mockReturnValue({ _id: 'apply-tx' })
    }
    return instance
  }

  function resultWithOneTx (): Result {
    const result = emptyResult()
    result.createContextTx.push({ _id: 'ctx-tx-1', modifiedOn: 1, attributes: { unreadMessages: [] } } as any)
    return result
  }

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // withRetry sleeps via setTimeout(...,~500-5000ms) between attempts. Advancing fake timers past
  // the max possible delay after each microtask turn drains those sleeps without a real wait.
  async function flushRetries<T> (promise: Promise<T>): Promise<T> {
    let pending = true
    void promise.then(
      () => {
        pending = false
      },
      () => {
        pending = false
      }
    )
    // Drain the retry backoff sleeps; `pending` flips inside the promise callbacks above.
    for (let i = 0; i < 20; i++) {
      if (!pending) break
      await jest.advanceTimersByTimeAsync(10000)
    }
    return await promise
  }

  it('retries a transient error up to four attempts, then resets contexts and rethrows', async () => {
    const txMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const instance = makeInstance({ tx: txMock })

    const promise = (instance.applyResult as (r: Result) => Promise<void>)(resultWithOneTx())
    const settled = flushRetries(promise)

    await expect(settled).rejects.toThrow('ECONNREFUSED')

    expect(txMock).toHaveBeenCalledTimes(4)
    expect(instance.cache.resetContexts).toHaveBeenCalledTimes(1)
    expect(instance.cache.tx).not.toHaveBeenCalled()
  })

  it('does not retry a non-transient error: calls rest.tx once, resets contexts, does not throw, still sends queued messages', async () => {
    const txMock = jest.fn().mockRejectedValue(Object.assign(new Error('bad request'), { httpStatus: 400 }))
    const sendMock = jest.fn().mockResolvedValue(undefined)
    const instance = makeInstance({ tx: txMock, send: sendMock })

    const result = resultWithOneTx()
    result.queueMessages.push({ id: 'q-1' } as any)

    await flushRetries((instance.applyResult as (r: Result) => Promise<void>)(result))

    expect(txMock).toHaveBeenCalledTimes(1)
    expect(instance.cache.resetContexts).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(instance.ctx, 'ws-1', result.queueMessages)
  })

  it('retries a failing producer eight times, then logs the lost batch without throwing', async () => {
    const sendMock = jest.fn().mockRejectedValue(new Error('broker unavailable'))
    const instance = makeInstance({ send: sendMock })

    const result = resultWithOneTx()
    result.queueMessages.push({ id: 'q-1', account: 'acc-1' } as any, { id: 'q-2', account: 'acc-1' } as any)

    await flushRetries((instance.applyResult as (r: Result) => Promise<void>)(result))

    expect(sendMock).toHaveBeenCalledTimes(8)
    expect(instance.cache.tx).toHaveBeenCalledTimes(1)
    expect(instance.ctx.error).toHaveBeenCalledWith(
      'Failed to publish user notifications, push and email of this batch are lost',
      expect.objectContaining({ count: 2, notificationIds: ['q-1', 'q-2'], accounts: ['acc-1'] })
    )
  })

  it('on success calls cache.tx(tx, true) for each tx in the batch', async () => {
    const txMock = jest.fn().mockResolvedValue(undefined)
    const instance = makeInstance({ tx: txMock })

    const result = emptyResult()
    result.createContextTx.push({ _id: 'ctx-tx-1', modifiedOn: 1, attributes: { unreadMessages: [] } } as any)
    result.updateContextTx.push({ _id: 'ctx-tx-2', modifiedOn: 2, operations: {} } as any)

    await flushRetries((instance.applyResult as (r: Result) => Promise<void>)(result))

    expect(txMock).toHaveBeenCalledTimes(1)
    expect(instance.cache.tx).toHaveBeenCalledTimes(2)
    expect(instance.cache.tx).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ctx-tx-1' }), true)
    expect(instance.cache.tx).toHaveBeenCalledWith(expect.objectContaining({ _id: 'ctx-tx-2' }), true)
    expect(instance.cache.resetContexts).not.toHaveBeenCalled()
  })
})

describe('Workspace.applyResult: the time machine', () => {
  it('sends the letter commands after the batch is applied, keyed by the workspace', async () => {
    const schedule = jest.fn().mockResolvedValue(undefined)
    const instance: any = Object.create((Workspace as any).prototype)
    instance.ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    instance.cache = { tx: jest.fn(), resetContexts: jest.fn() }
    instance.producer = { send: jest.fn().mockResolvedValue(undefined) }
    instance.timeMachine = { send: schedule }
    instance.ws = { uuid: 'ws-1' }
    instance.rest = { tx: jest.fn().mockResolvedValue(undefined) }
    instance.txFactory = { createTxApplyIf: jest.fn().mockReturnValue({ _id: 'apply-tx' }) }
    const result = emptyResult()
    result.timeMachine.push({ type: 'cancel', id: 'letter:acc:n:%' })

    await instance.applyResult(result)

    expect(schedule).toHaveBeenCalledWith(instance.ctx, 'ws-1', [{ type: 'cancel', id: 'letter:acc:n:%' }])
  })

  it('logs and goes on when the time machine cannot be reached', async () => {
    jest.useFakeTimers()
    try {
      const instance: any = Object.create((Workspace as any).prototype)
      instance.ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      instance.cache = { tx: jest.fn(), resetContexts: jest.fn() }
      instance.producer = { send: jest.fn().mockResolvedValue(undefined) }
      instance.timeMachine = { send: jest.fn().mockRejectedValue(new Error('broker down')) }
      instance.ws = { uuid: 'ws-1' }
      instance.rest = { tx: jest.fn().mockResolvedValue(undefined) }
      instance.txFactory = { createTxApplyIf: jest.fn().mockReturnValue({ _id: 'apply-tx' }) }
      const result = emptyResult()
      result.timeMachine.push({ type: 'schedule', id: 'letter:acc:n:email', targetDate: 1, topic: QueueTopic.HeldNotifications, data: {} })

      let pending = true
      const run = instance.applyResult(result).finally(() => {
        pending = false
      })
      for (let i = 0; i < 20; i++) {
        if (!pending) break
        await jest.advanceTimersByTimeAsync(10000)
      }
      await run

      expect(instance.ctx.error).toHaveBeenCalledWith(
        'Failed to send held letters to the time machine, they are lost',
        expect.objectContaining({ ids: ['letter:acc:n:email'] })
      )
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('Workspace.releaseHeld', () => {
  const held: any = {
    account: 'acc-1',
    notificationId: 'n-1',
    objectId: 'doc-1',
    createdOn: 100,
    readBy: 'position',
    provider: 'email',
    message: { id: 'n-1' }
  }
  function instanceWith (states: unknown[]): any {
    const instance: any = Object.create((Workspace as any).prototype)
    instance.ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    instance.ws = { uuid: 'ws-1' }
    instance.pipeline = { findAll: jest.fn().mockResolvedValue(states) }
    instance.producer = { send: jest.fn().mockResolvedValue(undefined) }
    return instance
  }

  it('publishes the letter when the notification is still unread', async () => {
    const instance = instanceWith([])
    await instance.releaseHeld(held)
    expect(instance.producer.send).toHaveBeenCalledWith(instance.ctx, 'ws-1', [{ id: 'n-1' }])
    expect(instance.isInProgress()).toBe(false)
  })

  it('drops the letter when the person read the notification meanwhile', async () => {
    const instance = instanceWith([{ attachedTo: 'doc-1', 'acc-1': { timestamp: 100 } }])
    await instance.releaseHeld(held)
    expect(instance.producer.send).not.toHaveBeenCalled()
  })
})

describe('Workspace.close', () => {
  it('waits for the tx in progress before closing the pipeline', async () => {
    const instance: any = Object.create((Workspace as any).prototype)
    const order: string[] = []
    let release: () => void = () => {}
    instance.ctx = { error: jest.fn() }
    instance.pipeline = { close: jest.fn(async () => order.push('pipeline closed')) }
    instance.pendingPush = { flushAll: jest.fn(async () => order.push('held pushes flushed')) }
    instance.processTx = async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      order.push('tx done')
    }

    const tx = instance.tx({ _id: 'tx-1' })
    const closing = instance.close()
    await new Promise((resolve) => setImmediate(resolve))
    expect(instance.pipeline.close).not.toHaveBeenCalled()

    release()
    await Promise.all([tx, closing])
    expect(order).toEqual(['tx done', 'held pushes flushed', 'pipeline closed'])
    expect(instance.isInProgress()).toBe(false)
  })
})

describe('Workspace.releaseHeldPushes (private, exercised via a bare instance)', () => {
  function makeInstance (status: { user: string } | undefined, size = 1): any {
    const instance: any = Object.create((Workspace as any).prototype)
    instance.pendingPush = { size, flushByAccount: jest.fn().mockResolvedValue(undefined) }
    instance.status = status
    instance.release = async (tx: any) => await instance.releaseHeldPushes(tx, instance.status)
    return instance
  }
  const update = (operations: Record<string, unknown>): any => ({
    _class: core.class.TxUpdateDoc,
    objectClass: core.class.UserStatus,
    objectId: 'us-1',
    operations
  })

  it("releases the account's held pushes when it goes away or offline, or its status is removed", async () => {
    for (const tx of [
      update({ away: true }),
      update({ online: false }),
      { _class: core.class.TxRemoveDoc, objectClass: core.class.UserStatus, objectId: 'us-1' }
    ]) {
      const instance = makeInstance({ user: 'acc-1' })
      await instance.release(tx)
      expect(instance.pendingPush.flushByAccount).toHaveBeenCalledWith('acc-1')
    }
  })

  it('does nothing when the person comes back, when nothing is held, or when the status is unknown', async () => {
    const back = makeInstance({ user: 'acc-1' })
    await back.release(update({ away: false }))
    expect(back.pendingPush.flushByAccount).not.toHaveBeenCalled()

    const empty = makeInstance({ user: 'acc-1' }, 0)
    await empty.release(update({ away: true }))
    expect(empty.pendingPush.flushByAccount).not.toHaveBeenCalled()

    const unknown = makeInstance(undefined)
    await unknown.release(update({ away: true }))
    expect(unknown.pendingPush.flushByAccount).not.toHaveBeenCalled()
  })

  // The cache drops a removed status before the release runs: the account must come from the
  // copy taken before the cache applied the tx, or a removal never releases anything.
  it('releases on a status removal even though the cache has already forgotten the record', async () => {
    const instance: any = Object.create((Workspace as any).prototype)
    const statuses = new Map<string, { user: string }>([['us-1', { user: 'acc-1' }]])
    instance.pendingPush = { size: 1, flushByAccount: jest.fn().mockResolvedValue(undefined) }
    instance.cache = {
      getCachedUserStatus: (id: string) => statuses.get(id),
      tx: (tx: any) => {
        if (tx._class === core.class.TxRemoveDoc) statuses.delete(tx.objectId)
      },
      reset: jest.fn()
    }
    instance.hierarchy = {
      findDomain: () => 'transient',
      isDerived: (a: string, b: string) => a === b
    }
    instance.model = { addTxes: jest.fn() }
    instance.ctx = { error: jest.fn() }
    await instance.processTx({ _class: core.class.TxRemoveDoc, objectClass: core.class.UserStatus, objectId: 'us-1' })
    expect(instance.pendingPush.flushByAccount).toHaveBeenCalledWith('acc-1')
  })
})

describe('areHeldPushesRead', () => {
  const ctx: any = {}
  const held = (overrides: Record<string, unknown>): any => ({
    account: 'acc-1',
    notificationId: 'n-1',
    objectId: 'doc-1',
    createdOn: 100,
    readBy: 'position',
    message: {},
    ...overrides
  })
  const pipeline = (docs: unknown[]): any => ({ findAll: jest.fn().mockResolvedValue(docs) })
  const one = async (docs: unknown[], push: any): Promise<boolean> => (await areHeldPushesRead(ctx, pipeline(docs), [push]))[0]

  it('a message is read once the account read position passed it', async () => {
    const state = (timestamp: number): unknown => ({ attachedTo: 'doc-1', 'acc-1': { timestamp } })
    expect(await one([state(100)], held({}))).toBe(true)
    expect(await one([state(99)], held({}))).toBe(false)
    expect(await one([], held({}))).toBe(false)
  })

  it.each([
    ['reactions', 'unreadReactions'],
    ['mentions', 'unreadMentions'],
    ['commons', 'unreadCommons']
  ])('a %s notification is read once its id left the context unread list', async (readBy, field) => {
    const context = (unread: unknown[]): unknown => ({ user: 'acc-1', objectId: 'doc-1', [field]: unread })
    expect(await one([context([{ id: 'n-1' }])], held({ readBy }))).toBe(false)
    expect(await one([context([{ id: 'other' }])], held({ readBy }))).toBe(true)
    expect(await one([{ user: 'acc-1', objectId: 'doc-1' }], held({ readBy }))).toBe(true)
    // No context at all: nothing is left to notify about.
    expect(await one([], held({ readBy }))).toBe(true)
  })

  it('checks the pushes of many documents with one query per kind, answering in order', async () => {
    const p: any = {
      findAll: jest
        .fn()
        .mockResolvedValueOnce([
          { attachedTo: 'doc-1', 'acc-1': { timestamp: 100 } },
          { attachedTo: 'doc-2', 'acc-1': { timestamp: 10 }, 'acc-2': { timestamp: 500 } }
        ])
        .mockResolvedValueOnce([{ user: 'acc-1', objectId: 'doc-1', unreadReactions: [{ id: 'r-1' }] }])
    }
    const read = await areHeldPushesRead(ctx, p, [
      held({ notificationId: 'm-1', objectId: 'doc-1' }),
      held({ notificationId: 'm-2', objectId: 'doc-2' }),
      held({ notificationId: 'm-3', objectId: 'doc-2', account: 'acc-2' }),
      held({ notificationId: 'm-4', objectId: 'doc-1', createdOn: 101 }),
      held({ notificationId: 'r-1', objectId: 'doc-1', readBy: 'reactions' }),
      held({ notificationId: 'r-2', objectId: 'doc-1', readBy: 'reactions' })
    ])
    expect(read).toEqual([true, false, true, false, false, true])
    expect(p.findAll).toHaveBeenCalledTimes(2)
    expect(p.findAll.mock.calls[0][2]).toEqual({ attachedTo: { $in: ['doc-1', 'doc-2'] } })
    expect(p.findAll.mock.calls[1][2]).toEqual({ objectId: { $in: ['doc-1'] }, user: { $in: ['acc-1'] } })
  })

  it('runs no query for a kind that is not in the batch', async () => {
    const p: any = { findAll: jest.fn().mockResolvedValue([]) }
    expect(await areHeldPushesRead(ctx, p, [held({})])).toEqual([false])
    expect(p.findAll).toHaveBeenCalledTimes(1)
    expect(await areHeldPushesRead(ctx, p, [])).toEqual([])
    expect(p.findAll).toHaveBeenCalledTimes(1)
  })
})
