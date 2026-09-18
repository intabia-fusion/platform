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

// Importing '../workspace' pulls in @hcengineering/server-pipeline and @hcengineering/middleware
// (heavy, real deps), and '../config' throws at import time if env vars are missing. Mocking
// config here (as the other test files already do for the lighter '../config' dependency) is
// enough to make the import safe; server-pipeline/middleware resolve fine as real workspace
// packages under ts-jest.
import Workspace, { isTransientError } from '../workspace'
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

// `applyResult` is private, but `Workspace` is exported (as the default export) and its
// constructor is only private at the type level -- Object.create(Workspace.prototype) builds a
// bare instance at runtime, and we hand-fill just the fields applyResult reads.
describe('Workspace.applyResult (private, exercised via a bare instance)', () => {
  function makeInstance (overrides: { tx?: jest.Mock, send?: jest.Mock }): any {
    const instance: any = Object.create((Workspace as any).prototype)
    instance.ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    instance.cache = { tx: jest.fn(), resetContexts: jest.fn(), getCachedContext: jest.fn() }
    instance.client = { findOne: jest.fn() }
    instance.producer = { send: overrides.send ?? jest.fn().mockResolvedValue(undefined) }
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
