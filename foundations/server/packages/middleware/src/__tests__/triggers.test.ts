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

import core, { type MeasureContext, type SessionData, toFindResult, type Tx } from '@hcengineering/core'
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
      contextData: sessionData,
      newChild: () => ({ contextData: sessionData })
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

describe('TriggersMiddleware synchronous apply', () => {
  it('isolates trigger privileges from concurrent client writes', async () => {
    let release: () => void = () => {}
    let started: () => void = () => {}
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const writes: string[] = []
    const context = {
      hierarchy: {},
      derived: {
        tx: async (ctx: any, txes: any[]) => {
          if (txes[0].objectClass === 'ordinary') {
            if (ctx.contextData.isTriggerCtx !== true) throw new Error('Forbidden')
            return {}
          }
          started()
          await blocked
          if (ctx.contextData.isTriggerCtx !== true) throw new Error('Forbidden')
          ctx.contextData.hasDomainBroadcast = true
          writes.push(txes[0].objectClass)
          return {}
        }
      }
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
      newChild: () => ({ ...ctx, contextData: ctx.contextData }),
      with: async (_n: string, _p: any, op: any) => await op(ctx)
    }
    try {
      await m.processDerived(ctx, [])
      const apply = control.apply(ctx, [{ objectClass: 'notification:class:ReadState' }], true)
      await entered
      expect(ctx.contextData.isTriggerCtx).toBeUndefined()
      await expect(context.derived?.tx(ctx, [{ objectClass: 'ordinary' } as any])).rejects.toThrow('Forbidden')
      release()
      await expect(apply).resolves.toEqual({})
      expect(writes).toEqual(['notification:class:ReadState'])
      expect(ctx.contextData.hasDomainBroadcast).toBe(true)
    } finally {
      release()
      await middleware.close()
    }
  })
})

describe('ReadState trigger integration', () => {
  it('creates a read state through NotificationMiddleware while rejecting client writes', async () => {
    const notificationPath = '../../../../../../server-plugins/notification/src/middleware'
    const chunterResourcesPath = '../../../../../../server-plugins/chunter-resources/src'
    const notificationPackage = '@hcengineering/notification'
    const chunterPackage = '@hcengineering/chunter'
    const activityPackage = '@hcengineering/activity'
    const { NotificationMiddleware } = await import(notificationPath)
    const notification = (await import(notificationPackage)).default
    const chunter = (await import(chunterPackage)).default
    const contact = (await import('@hcengineering/contact')).default
    const activity = (await import(activityPackage)).default
    const plugin = (await import(chunterResourcesPath)).default
    const { TxFactory } = await import('@hcengineering/core')
    const next = { tx: jest.fn(async (_ctx: any, _txes: any[]) => ({})) }
    const notificationMiddleware = await NotificationMiddleware.create({}, { hierarchy: {} }, next)
    const middleware = new TriggersMiddleware({ hierarchy: {}, derived: notificationMiddleware } as any, undefined)
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
      contextData: { account: { uuid: 'user' }, asyncRequests: [] },
      newChild: () => ({ contextData: ctx.contextData }),
      with: async (_n: string, _p: any, op: any) => await op(ctx)
    }
    const tx: any = {
      _class: core.class.TxCreateDoc,
      objectClass: notification.class.ReadState,
      objectId: 'state',
      objectSpace: 'space',
      attributes: {}
    }
    try {
      await m.processDerived(ctx, [])
      await expect(notificationMiddleware.tx(ctx, [tx])).rejects.toThrow()
      control.ctx = Object.assign(ctx, { warn: jest.fn(), error: jest.fn() })
      control.txFactory = new TxFactory('person' as any)
      control.hierarchy = {
        classHierarchyMixin: (_class: any, mixin: any) => (mixin === activity.mixin.ActivityDoc ? {} : undefined),
        findDomain: () => 'space',
        isDerived: (_class: any, base: any) => base === core.class.Space
      }
      control.findAll = async (_ctx: any, _class: any) =>
        toFindResult(
          (_class === core.class.DocPreview
            ? [{ _id: 'preview', objectId: 'channel', objectDomain: 'space' }]
            : []) as any
        )
      control.queryFind = async (_ctx: any, _class: any) =>
        toFindResult((_class === contact.class.PersonSpace ? [{ _id: 'personal', account: 'user' }] : []) as any)
      const collaborator = control.txFactory.createTxCreateDoc(core.class.Collaborator, 'space', {
        attachedTo: 'channel',
        attachedToClass: chunter.class.Channel,
        collection: 'collaborators',
        collaborator: 'user'
      })
      const chats = await (await plugin()).trigger.OnCollaboratorAdded([collaborator], control)
      expect(chats).toHaveLength(1)
      const stored = next.tx.mock.calls[0][1][0]
      expect(stored.objectClass).toBe(notification.class.ReadState)
      expect(chats[0].attributes.readState).toBe(stored.objectId)
      expect(ctx.contextData.isTriggerCtx).toBeUndefined()
    } finally {
      await middleware.close()
      await notificationMiddleware.close()
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
      newChild: () => ({ contextData: ctx.contextData }),
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
      newChild: () => ({ contextData: ctx.contextData }),
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
      newChild: () => ({ contextData: ctx.contextData }),
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
    relations: { type: { _class: core.class.ArrOf } },
    applets: { type: { _class: core.class.Collection } }
  }
  const hierarchy = {
    getDomain: () => 'activity',
    getBaseClass: (_class: string) => _class,
    // Only the stored class declares the fields, the base class named in the tx does not.
    findAttribute: (_class: string, name: string) => (_class === 'chat-message' ? attributes[name] : undefined)
  }
  const middleware = new TriggersMiddleware({ hierarchy } as any, undefined)
  const ctx = { contextData: { removedMap: new Map(), broadcast: { txes: [] } } }
  // Its interval keeps jest from exiting.
  afterAll(async () => {
    await middleware.close()
  })
  // A mixin keeps its data under its id: an `$inc` there would wipe it.
  const parent = {
    _id: 'msg-1',
    _class: 'chat-message',
    space: 'channel',
    'test:mixin:Extra': { note: 'x' },
    _reactions: 2
  }
  const findAll = async (): Promise<any[]> => [parent]
  const removal = (collection: string): Tx =>
    ({
      _class: core.class.TxRemoveDoc,
      space: core.space.Tx,
      objectId: 'reaction-1',
      objectClass: 'reaction',
      objectSpace: 'channel',
      attachedTo: 'msg-1',
      attachedToClass: 'base-message',
      collection,
      modifiedBy: 'bob',
      modifiedOn: 1
    }) as any

  it('counts a collection only, by the class and data of the stored parent', async () => {
    const names = ['message', '_id', 'test:mixin:Extra', 'applets', '_reactions', 'undeclared']
    const result = await (middleware as any).processCollection(ctx, names.map(removal), findAll)

    expect(result.map((it: any) => it.operations)).toEqual([
      { $inc: { applets: -1 } },
      { $inc: { _reactions: -1 } },
      { $inc: { undeclared: -1 } }
    ])
  })

  it('does not change a relations array when an activity reference is created', async () => {
    const relations = [{ _id: 'related-issue', _class: 'issue' }]
    const issue = { ...parent, relations }
    const tx = {
      ...removal('relations'),
      _class: core.class.TxCreateDoc,
      objectClass: 'activity:class:ActivityReference'
    }
    const result = await (middleware as any).processCollection(ctx, [tx], async () => [issue])

    expect(result).toEqual([])
    expect(issue.relations).toEqual([{ _id: 'related-issue', _class: 'issue' }])
  })
})

describe('TriggersMiddleware counters of a moved document', () => {
  const mixin = 'test:mixin:Candidate'
  const hierarchy = {
    getDomain: () => 'contact',
    getBaseClass: (_class: string) => (_class === mixin ? 'person' : _class),
    isMixin: (_class: string) => _class === mixin,
    hasMixin: (doc: any, _class: string) => doc[_class] !== undefined,
    // The collection sits on the mixin, the stored class knows nothing of it.
    findAttribute: (_class: string, name: string) =>
      _class === mixin && name === 'applications' ? { type: { _class: core.class.Collection } } : undefined
  }
  const middleware = new TriggersMiddleware({ hierarchy } as any, undefined)
  afterAll(async () => {
    await middleware.close()
  })
  const people: Record<string, any> = {
    old: { _id: 'old', _class: 'person', space: 'contacts', [mixin]: {} },
    candidate: { _id: 'candidate', _class: 'person', space: 'contacts', [mixin]: {} },
    plain: { _id: 'plain', _class: 'person', space: 'contacts' }
  }
  const findAll = async (_ctx: any, _class: string, query: any): Promise<any[]> => [people[query._id]]
  const move = (to: string): any => ({
    _class: core.class.TxUpdateDoc,
    objectId: 'applicant-1',
    objectClass: 'applicant',
    objectSpace: 'vacancy',
    attachedTo: 'old',
    attachedToClass: mixin,
    collection: 'applications',
    operations: { attachedTo: to },
    modifiedBy: 'bob',
    modifiedOn: 1
  })

  it('counts a collection of a mixin on both parents, the new one only when it carries the mixin', async () => {
    const counters = async (to: string): Promise<any[]> =>
      ((await (middleware as any).updateCollection({}, move(to), findAll)) as any[]).map((it) => [
        it._class,
        it.objectId,
        it.attributes
      ])

    // The counter lives in the mixin data, so it changes by a mixin tx.
    expect(await counters('candidate')).toEqual([
      [core.class.TxMixin, 'old', { $inc: { applications: -1 } }],
      [core.class.TxMixin, 'candidate', { $inc: { applications: 1 } }]
    ])
    expect(await counters('plain')).toEqual([[core.class.TxMixin, 'old', { $inc: { applications: -1 } }]])
  })
})
