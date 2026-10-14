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

import core, { generateId, type MeasureContext, type SessionData, toFindResult, type Tx } from '@hcengineering/core'
import type { PipelineContext } from '@hcengineering/server-core'
import { TriggersMiddleware } from '../triggers'

describe('TriggersMiddleware isTriggerCtx lifecycle', () => {
  it('should set isTriggerCtx during derived tx execution and restore previous value on completion or error', async () => {
    let capturedInsideDerived: boolean | undefined
    let derivedCallCount = 0

    const mockDerivedPipeline = {
      tx: async (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<any> => {
        derivedCallCount++
        capturedInsideDerived = ctx.contextData?.isTriggerCtx
        if (txes.some((t) => t.space === ('error_space' as any))) {
          throw new Error('Derived tx processing failed')
        }
      }
    }

    const mockPipelineContext: Partial<PipelineContext> = {
      hierarchy: {} as any,
      derived: mockDerivedPipeline as any
    }

    const middleware = new TriggersMiddleware(mockPipelineContext as PipelineContext, undefined)
    const sessionData: Record<string, any> = {}
    const ctx = {
      contextData: sessionData
    } as unknown as MeasureContext<SessionData>

    try {
      // 1. Verify normal execution flow
      const sampleTx: Tx = {
        _class: core.class.TxCreateDoc,
        space: core.space.Tx,
        objectClass: core.class.Doc,
        objectId: 'doc1',
        modifiedOn: 100
      } as any

      expect((ctx.contextData as any)?.isTriggerCtx).toBeUndefined()

      // Call private processDerivedTxes via instance
      await (middleware as any).processDerivedTxes(ctx, [sampleTx])

      expect(derivedCallCount).toBe(1)
      expect(capturedInsideDerived).toBe(true)
      expect((ctx.contextData as any)?.isTriggerCtx).toBeUndefined()

      // 2. Verify error resilience (finally block cleanup when derived.tx throws)
      const errorTx: Tx = {
        _class: core.class.TxCreateDoc,
        space: 'error_space' as any,
        objectClass: core.class.Doc,
        objectId: 'doc2',
        modifiedOn: 200
      } as any

      let thrownError: Error | undefined
      try {
        await (middleware as any).processDerivedTxes(ctx, [errorTx])
      } catch (err: any) {
        thrownError = err
      }

      expect(thrownError?.message).toBe('Derived tx processing failed')
      expect(derivedCallCount).toBe(2)
      expect(capturedInsideDerived).toBe(true)
      // CRITICAL: isTriggerCtx must NOT leak after exception in derived.tx!
      expect((ctx.contextData as any)?.isTriggerCtx).toBeUndefined()

      // 3. Verify restoring non-undefined previous flag
      ;(ctx.contextData as any).isTriggerCtx = false
      await (middleware as any).processDerivedTxes(ctx, [sampleTx])
      expect((ctx.contextData as any).isTriggerCtx).toBe(false)
    } finally {
      await middleware.close()
    }
  })
})

describe('TriggersMiddleware queryFind', () => {
  it('passes options to the live query', async () => {
    const queryFind = jest.fn(async () => [])
    const context = {
      hierarchy: { findDomain: () => 'space' } as any,
      liveQuery: { queryFind }
    } as unknown as PipelineContext
    const middleware = new TriggersMiddleware(context, undefined)
    const m = middleware as any
    m.processRemove = async () => []
    m.processCollection = async () => []
    m.processMove = async () => []
    let control: any
    m.processSyncTriggers = async (_ctx: any, _txes: any, tc: any) => {
      control = tc
      return []
    }
    const ctx: any = {
      contextData: { asyncRequests: [] },
      with: async (_n: string, _p: any, op: any) => await op(ctx)
    }
    try {
      await m.processDerived(ctx, [])
      const options = { limit: 1, sort: { modifiedOn: -1 } }
      await control.queryFind(ctx, core.class.Space, {}, options)
      expect(queryFind).toHaveBeenCalledWith(core.class.Space, {}, expect.objectContaining(options))
    } finally {
      await middleware.close()
    }
  })
})

describe('TriggersMiddleware trigger findAll', () => {
  it('does not leave isTriggerCtx set after the query', async () => {
    const context = { hierarchy: { updateLookupMixin: (_c: any, v: any) => v } as any } as unknown as PipelineContext
    const middleware = new TriggersMiddleware(context, undefined)
    const m = middleware as any
    m.processRemove = async () => []
    m.processCollection = async () => []
    m.processMove = async () => []
    m.findAll = async () => toFindResult([])
    let control: any
    m.processSyncTriggers = async (_ctx: any, _txes: any, tc: any) => {
      control = tc
      return []
    }
    const ctx: any = {
      contextData: { asyncRequests: [] },
      with: async (_n: string, _p: any, op: any) => await op(ctx)
    }
    try {
      await m.processDerived(ctx, [])
      await control.findAll(ctx, core.class.Space, {})
      expect(ctx.contextData.isTriggerCtx).toBeUndefined()
    } finally {
      await middleware.close()
    }
  })
})

describe('TriggersMiddleware parallel trigger findAll', () => {
  it('keeps isTriggerCtx until the last parallel query ends, then restores it', async () => {
    const context = { hierarchy: { updateLookupMixin: (_c: any, v: any) => v } as any } as unknown as PipelineContext
    const middleware = new TriggersMiddleware(context, undefined)
    const m = middleware as any
    m.processRemove = async () => []
    m.processCollection = async () => []
    m.processMove = async () => []
    const release: Record<string, () => void> = {}
    const seen: Record<string, boolean | undefined> = {}
    m.findAll = async (ctx: any, _class: any, query: any) => {
      await new Promise<void>((resolve) => {
        release[query.id] = resolve
      })
      seen[query.id] = ctx.contextData.isTriggerCtx
      return toFindResult([])
    }
    let control: any
    m.processSyncTriggers = async (_ctx: any, _txes: any, tc: any) => {
      control = tc
      return []
    }
    const ctx: any = {
      contextData: { asyncRequests: [] },
      with: async (_n: string, _p: any, op: any) => await op(ctx)
    }
    try {
      await m.processDerived(ctx, [])
      const a = control.findAll(ctx, core.class.Space, { id: 'a' })
      const b = control.findAll(ctx, core.class.Space, { id: 'b' })
      release.a()
      await a
      release.b()
      await b
      expect(seen.b).toBe(true)
      expect(ctx.contextData.isTriggerCtx).toBeUndefined()
    } finally {
      await middleware.close()
    }
  })
})

describe('TriggersMiddleware collection counters', () => {
  const attributes: Record<string, any> = {
    message: { type: { _class: core.class.TypeMarkup } },
    applets: { type: { _class: core.class.Collection } }
  }
  const hierarchy = {
    getDomain: () => 'activity',
    findDomain: () => 'activity',
    getBaseClass: (_class: string) => _class,
    // Only the stored class declares the fields, the base class named in the tx does not.
    findAttribute: (_class: string, name: string) => (_class === 'chat-message' ? attributes[name] : undefined)
  }
  const middleware = new TriggersMiddleware({ hierarchy } as any, undefined)
  const ctxOf = (removedMap = new Map()): any => ({ contextData: { removedMap, broadcast: { txes: [] } } })
  const parents = ['msg-1', 'msg-2', 'msg-3'].map((_id) => ({ _id, _class: 'chat-message', space: 'channel' }))
  const findAll = async (_ctx: any, _class: string, query: any): Promise<any[]> =>
    parents.filter((it) => it._id === query._id)
  // Stored under msg-2, while every tx below names msg-1.
  const reaction = {
    _id: 'reaction-1',
    _class: 'reaction',
    attachedTo: 'msg-2',
    attachedToClass: 'chat-message',
    collection: 'applets'
  }
  const colTx = (_class: string, collection: string, extra: Record<string, any> = {}): Tx =>
    ({
      _id: generateId(),
      _class,
      space: core.space.Tx,
      objectId: 'reaction-1',
      objectClass: 'reaction',
      objectSpace: 'channel',
      attachedTo: 'msg-1',
      attachedToClass: 'base-message',
      collection,
      modifiedBy: 'bob',
      modifiedOn: 1,
      ...extra
    }) as any
  const counters = (txes: any[]): any[] => txes.map((it) => [it.objectId, it.operations])

  it('counts a collection only, by the class of the stored parent', async () => {
    const txes = ['message', '_id', 'a.b', 'applets', 'undeclared'].map((it) => colTx(core.class.TxCreateDoc, it))
    const result = await (middleware as any).processCollection(ctxOf(), txes, findAll)

    expect(result.map((it: any) => it.operations)).toEqual([{ $inc: { applets: 1 } }, { $inc: { undeclared: 1 } }])
  })

  it('takes the parent of a removed document from the storage, not from its tx', async () => {
    const removal = colTx(core.class.TxRemoveDoc, 'applets')
    const ghost = colTx(core.class.TxRemoveDoc, 'applets', { objectId: 'ghost' })
    const removedMap = new Map([[reaction._id, reaction]])
    const result = await (middleware as any).processCollection(ctxOf(removedMap), [removal, ghost], findAll)

    expect(counters(result)).toEqual([['msg-2', { $inc: { applets: -1 } }]])
  })

  it('moves a counter from the parent the document had before the update', async () => {
    const next = {
      findAll: async (_ctx: any, _class: string, query: { _id: { $in: string[] } }) =>
        query._id.$in.includes(reaction._id) ? [reaction] : []
    }
    const mover = new TriggersMiddleware({ hierarchy } as any, next as any)
    const move = colTx(core.class.TxUpdateDoc, 'applets', { operations: { attachedTo: 'msg-3' } })
    const ghost = colTx(core.class.TxUpdateDoc, 'applets', { objectId: 'ghost', operations: { attachedTo: 'msg-3' } })
    const moved = await (mover as any).findMovedDocs(ctxOf(), [move, ghost])
    const result = await (mover as any).processCollection(ctxOf(), [move, ghost], findAll, moved)

    expect(counters(result)).toEqual([
      ['msg-2', { $inc: { applets: -1 } }],
      ['msg-3', { $inc: { applets: 1 } }]
    ])
    await mover.close()
  })

  afterAll(async () => {
    await middleware.close()
  })
})
