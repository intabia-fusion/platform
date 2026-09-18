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

import { get } from 'svelte/store'
import core, { type Ref, type Tx, type TxCreateDoc, type TxUpdateDoc, type TxRemoveDoc } from '@hcengineering/core'
import notification, { type DocNotifyContext } from '@hcengineering/notification'

const mockAccount = { uuid: 'acc-me' as any, role: 0 }

// @hcengineering/core's compiled `lib` re-exports everything through non-configurable getters
// (TS's `export *` interop), so `jest.spyOn`/partial-mock-via-requireActual can't patch just
// getCurrentAccount: requireActual also re-enters the same circular src graph
// (memdb.ts -> client.ts -> index.ts) from inside the mock factory and throws before init
// finishes. Hand-rolling the small surface client.ts touches avoids both problems.
// TxProcessor.updateDoc2Doc here mirrors the real `$inc` operator
// (foundations/core/packages/core/src/operator.ts: `doc[key] = (doc[key] ?? 0) + increment`).
jest.mock('@hcengineering/core', () => ({
  __esModule: true,
  default: {
    class: {
      TxCreateDoc: 'core:class:TxCreateDoc',
      TxUpdateDoc: 'core:class:TxUpdateDoc',
      TxRemoveDoc: 'core:class:TxRemoveDoc'
    },
    space: { Tx: 'core:space:Tx' }
  },
  AccountRole: { ReadOnlyGuest: 'READONLYGUEST', User: 'USER' },
  getCurrentAccount: jest.fn(() => mockAccount),
  generateId: jest.fn(() => 'generated-id'),
  notEmpty: (x: unknown) => x != null,
  TxProcessor: {
    createDoc2Doc: (tx: any) => ({
      ...tx.attributes,
      _id: tx.objectId,
      _class: tx.objectClass,
      space: tx.objectSpace,
      modifiedBy: tx.modifiedBy,
      modifiedOn: tx.modifiedOn,
      createdBy: tx.createdBy ?? tx.modifiedBy,
      createdOn: tx.createdOn ?? tx.modifiedOn
    }),
    updateDoc2Doc: (doc: any, tx: any) => {
      const ops = tx.operations ?? {}
      for (const key of Object.keys(ops)) {
        if (key === '$inc') {
          for (const field of Object.keys(ops[key])) {
            doc[field] = (doc[field] ?? 0) + ops[key][field]
          }
        } else if (key.startsWith('$')) {
          throw new Error(`unsupported operator in test double: ${key}`)
        } else {
          doc[key] = ops[key]
        }
      }
      doc.modifiedBy = tx.modifiedBy
      doc.modifiedOn = tx.modifiedOn
      return doc
    }
  }
}))

const findAllMock = jest.fn()
const applyFindAllMock = jest.fn()
const createDocMock = jest.fn()
const removeDocMock = jest.fn()
const updateMock = jest.fn()
const commitMock = jest.fn(async () => ({}))
const applyMock = jest.fn(() => ({
  findAll: applyFindAllMock,
  createDoc: createDocMock,
  removeDoc: removeDocMock,
  update: updateMock,
  commit: commitMock
}))

const mockClient = {
  findAll: findAllMock,
  apply: applyMock
}

// Two live queries feed the unread store: inbox unread (unreadCount) and chat unread (unreadMessagesCount).
let unreadQueryCallback: ((res: any[]) => void) | undefined
let unreadMessagesQueryCallback: ((res: any[]) => void) | undefined
const unreadQueryQueryMock = jest.fn((_class: any, query: any, callback: (res: any[]) => void) => {
  if (query?.unreadMessagesCount !== undefined) {
    unreadMessagesQueryCallback = callback
  } else {
    unreadQueryCallback = callback
  }
})

let txListener: ((txes: Tx[]) => void) | undefined
let onClientCallback: ((client: unknown, account: unknown) => void | Promise<void>) | undefined

jest.mock('@hcengineering/presentation', () => ({
  getClient: jest.fn(() => mockClient),
  createQuery: jest.fn(() => ({
    query: unreadQueryQueryMock,
    unsubscribe: jest.fn()
  })),
  // Registered once at module scope in client.ts, like the real addTxListener - captured here
  // for the lifetime of the whole test file, not reset per test/instance.
  addTxListener: jest.fn((l: (txes: Tx[]) => void) => {
    txListener = l
  }),
  onClient: jest.fn((l: (client: unknown, account: unknown) => void | Promise<void>) => {
    onClientCallback = l
  })
}))

// eslint-disable-next-line import/first
import { NotificationClientImpl } from '../client'

function makeContext (overrides: Partial<DocNotifyContext> = {}): DocNotifyContext {
  return {
    _id: 'ctx1' as Ref<DocNotifyContext>,
    _class: notification.class.DocNotifyContext,
    space: 'space1' as any,
    modifiedBy: 'acc-me' as any,
    modifiedOn: 1,
    createdOn: 1,
    user: 'acc-me' as any,
    objectId: 'doc1' as any,
    objectClass: 'tracker:class:Issue' as any,
    objectSpace: 'space1' as any,
    objectTitle: 'Issue 1',
    lastNotify: 100,
    latestNotifications: [],
    unreadReactions: [],
    unreadMentions: [],
    unreadMessages: [],
    unreadCommons: [],
    unreadCount: 0,
    ...overrides
  } as unknown as DocNotifyContext
}

async function initClient (client: NotificationClientImpl): Promise<void> {
  // The constructor registers init() via onClient(); invoke it the way presentation would,
  // passing the (client, account) pair init() expects.
  if (onClientCallback !== undefined) {
    await onClientCallback({}, mockAccount)
  }
  void client
}

describe('NotificationClientImpl', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    unreadQueryCallback = undefined
    unreadMessagesQueryCallback = undefined
    onClientCallback = undefined
    ;(NotificationClientImpl as any)._instance = undefined
  })

  describe('getContextByDoc / loadContextsByDoc batching', () => {
    it('coalesces same-tick getContextByDoc calls into a single findAll with all ids, resolving each caller independently', async () => {
      const ctxA = makeContext({ _id: 'ctxA' as Ref<DocNotifyContext>, objectId: 'docA' as any })
      const ctxB = makeContext({ _id: 'ctxB' as Ref<DocNotifyContext>, objectId: 'docB' as any })
      findAllMock.mockResolvedValueOnce([ctxA, ctxB])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const p1 = client.getContextByDoc('docA' as any)
      const p2 = client.getContextByDoc('docB' as any)

      const [r1, r2] = await Promise.all([p1, p2])

      expect(findAllMock).toHaveBeenCalledTimes(1)
      expect(findAllMock).toHaveBeenCalledWith(notification.class.DocNotifyContext, {
        objectId: { $in: ['docA', 'docB'] },
        user: 'acc-me'
      })
      expect(r1).toEqual(ctxA)
      expect(r2).toEqual(ctxB)
    })

    // Plural and singular calls of the same tick share one pending queue: a navigator section asks
    // for all of its docs at once while other components ask for single docs.
    it('merges a same-tick loadContextsByDoc call into the getContextByDoc batch', async () => {
      const ctxA = makeContext({ _id: 'ctxA' as Ref<DocNotifyContext>, objectId: 'docA' as any })
      const ctxC = makeContext({ _id: 'ctxC' as Ref<DocNotifyContext>, objectId: 'docC' as any })
      findAllMock.mockResolvedValueOnce([ctxA, ctxC])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const p1 = client.getContextByDoc('docA' as any)
      const p3 = client.loadContextsByDoc(['docC' as any])

      const [r1] = await Promise.all([p1, p3])

      expect(findAllMock).toHaveBeenCalledTimes(1)
      expect(findAllMock).toHaveBeenCalledWith(notification.class.DocNotifyContext, {
        objectId: { $in: ['docA', 'docC'] },
        user: 'acc-me'
      })
      expect(r1).toEqual(ctxA)
      expect(get(client.contextByDoc).get('docC' as any)).toEqual(ctxC)
    })

    it('coalesces two same-tick loadContextsByDoc calls into one request without duplicate ids', async () => {
      const ctxA = makeContext({ _id: 'ctxA' as Ref<DocNotifyContext>, objectId: 'docA' as any })
      const ctxB = makeContext({ _id: 'ctxB' as Ref<DocNotifyContext>, objectId: 'docB' as any })
      findAllMock.mockResolvedValueOnce([ctxA, ctxB])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const p1 = client.loadContextsByDoc(['docA' as any, 'docB' as any])
      const p2 = client.getContextsByDoc(['docB' as any])
      const [, r2] = await Promise.all([p1, p2])

      expect(findAllMock).toHaveBeenCalledTimes(1)
      expect(findAllMock).toHaveBeenCalledWith(notification.class.DocNotifyContext, {
        objectId: { $in: ['docA', 'docB'] },
        user: 'acc-me'
      })
      expect(r2).toEqual([ctxB])
    })

    it('hits the cache on a second call for an already-loaded doc, issuing no request', async () => {
      const ctxA = makeContext({ _id: 'ctxA' as Ref<DocNotifyContext>, objectId: 'docA' as any })
      findAllMock.mockResolvedValueOnce([ctxA])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      await client.getContextByDoc('docA' as any)
      expect(findAllMock).toHaveBeenCalledTimes(1)

      findAllMock.mockClear()
      const cached = await client.getContextByDoc('docA' as any)

      expect(findAllMock).not.toHaveBeenCalled()
      expect(cached).toEqual(ctxA)
    })

    it('resolves to undefined (and caches null) when no context exists for the doc', async () => {
      findAllMock.mockResolvedValueOnce([])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const result = await client.getContextByDoc('missingDoc' as any)

      expect(result).toBeUndefined()
      expect(get(client.contextByDoc).get('missingDoc' as any)).toBeNull()

      findAllMock.mockClear()
      const second = await client.getContextByDoc('missingDoc' as any)
      expect(findAllMock).not.toHaveBeenCalled()
      expect(second).toBeUndefined()
    })
  })

  describe('getContextById batching', () => {
    it('coalesces same-tick single-id requests into one findAll by _id', async () => {
      const ctxA = makeContext({ _id: 'ctxA' as Ref<DocNotifyContext>, objectId: 'docA' as any })
      const ctxB = makeContext({ _id: 'ctxB' as Ref<DocNotifyContext>, objectId: 'docB' as any })
      findAllMock.mockResolvedValueOnce([ctxA, ctxB])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const [r1, r2] = await Promise.all([client.getContextById('ctxA' as any), client.getContextById('ctxB' as any)])

      expect(findAllMock).toHaveBeenCalledTimes(1)
      expect(findAllMock).toHaveBeenCalledWith(notification.class.DocNotifyContext, {
        _id: { $in: ['ctxA', 'ctxB'] },
        user: 'acc-me'
      })
      expect(r1).toEqual(ctxA)
      expect(r2).toEqual(ctxB)

      findAllMock.mockClear()
      const cached = await client.getContextById('ctxA' as any)
      expect(findAllMock).not.toHaveBeenCalled()
      expect(cached).toEqual(ctxA)
    })
  })

  describe('ensureReadState (getReadState/loadReadState)', () => {
    it('coalesces same-tick calls into one findAll with attachedTo $in, caching results and null for missing', async () => {
      const state1 = { _id: 'rs1', attachedTo: 'docA' } as any
      findAllMock.mockResolvedValueOnce([state1])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const [r1, r2] = await Promise.all([client.getReadState('docA' as any), client.getReadState('docB' as any)])

      expect(findAllMock).toHaveBeenCalledTimes(1)
      expect(findAllMock).toHaveBeenCalledWith(notification.class.ReadState, { attachedTo: { $in: ['docA', 'docB'] } })
      expect(r1).toEqual(state1)
      expect(r2).toBeUndefined()
      expect(get(client.readStateByDoc).get('docB' as any)).toBeNull()

      findAllMock.mockClear()
      await client.getReadState('docA' as any)
      expect(findAllMock).not.toHaveBeenCalled()
    })
  })

  describe('ensureDocSetting (getDocSetting/loadDocSetting)', () => {
    it('coalesces same-tick calls into one findAll with attachedTo $in and account filter, caching null for missing', async () => {
      const setting1 = { _id: 'ds1', attachedTo: 'docA', account: 'acc-me' } as any
      findAllMock.mockResolvedValueOnce([setting1])

      const client = NotificationClientImpl.getClient()
      await initClient(client)

      const [r1, r2] = await Promise.all([client.getDocSetting('docA' as any), client.getDocSetting('docB' as any)])

      expect(findAllMock).toHaveBeenCalledTimes(1)
      expect(findAllMock).toHaveBeenCalledWith(notification.class.DocNotificationSetting, {
        attachedTo: { $in: ['docA', 'docB'] },
        account: 'acc-me'
      })
      expect(r1).toEqual(setting1)
      expect(r2).toBeUndefined()
      expect(get(client.docSettingByDoc).get('docB' as any)).toBeNull()

      findAllMock.mockClear()
      await client.getDocSetting('docA' as any)
      expect(findAllMock).not.toHaveBeenCalled()
    })
  })

  describe('tx listener', () => {
    it('adds a DocNotifyContext created for the current user to contextByDoc and contextById', () => {
      const client = NotificationClientImpl.getClient()
      const context = makeContext({ _id: 'ctxNew' as Ref<DocNotifyContext>, objectId: 'docNew' as any })

      const createTx: TxCreateDoc<DocNotifyContext> = {
        _id: 'tx1' as any,
        _class: core.class.TxCreateDoc,
        space: core.space.Tx,
        modifiedBy: 'acc-me' as any,
        modifiedOn: 1,
        createdOn: 1,
        objectId: context._id,
        objectClass: context._class,
        objectSpace: context.space,
        attributes: {
          user: context.user,
          objectId: context.objectId,
          objectClass: context.objectClass,
          objectSpace: context.objectSpace,
          objectTitle: context.objectTitle,
          lastNotify: context.lastNotify,
          latestNotifications: context.latestNotifications,
          unreadReactions: context.unreadReactions,
          unreadMentions: context.unreadMentions,
          unreadMessages: context.unreadMessages,
          unreadCommons: context.unreadCommons,
          unreadCount: context.unreadCount
        } as any
      }

      expect(txListener).toBeDefined()
      txListener?.([createTx])

      expect(get(client.contextByDoc).get('docNew' as any)?._id).toBe('ctxNew')
      expect(get(client.contextById).get('ctxNew' as any)?._id).toBe('ctxNew')
    })

    it('patches the cached context in place on a TxUpdateDoc ($inc unreadCount)', () => {
      const client = NotificationClientImpl.getClient()
      const context = makeContext({ _id: 'ctxUpd' as Ref<DocNotifyContext>, objectId: 'docUpd' as any, unreadCount: 2 })

      client.contextById.update((m) => m.set(context._id, context))
      client.contextByDoc.update((m) => m.set(context.objectId, context))

      const updateTx: TxUpdateDoc<DocNotifyContext> = {
        _id: 'tx2' as any,
        _class: core.class.TxUpdateDoc,
        space: core.space.Tx,
        modifiedBy: 'acc-me' as any,
        modifiedOn: 2,
        objectId: context._id,
        objectClass: context._class,
        objectSpace: context.space,
        operations: { $inc: { unreadCount: 1 } } as any
      }

      txListener?.([updateTx])

      const updatedById = get(client.contextById).get('ctxUpd' as any)
      const updatedByDoc = get(client.contextByDoc).get('docUpd' as any)
      // 2 + 1 via $inc (TxProcessor.updateDoc2Doc semantics: doc[field] = (doc[field] ?? 0) + increment)
      expect(updatedById?.unreadCount).toBe(3)
      expect(updatedByDoc?.unreadCount).toBe(3)
      expect(updatedById).toBe(updatedByDoc) // same patched object in both maps
    })

    it('removes the context from both contextByDoc and contextById on a TxRemoveDoc', () => {
      const client = NotificationClientImpl.getClient()
      const context = makeContext({ _id: 'ctxDel' as Ref<DocNotifyContext>, objectId: 'docDel' as any })

      client.contextById.update((m) => m.set(context._id, context))
      client.contextByDoc.update((m) => m.set(context.objectId, context))

      const removeTx: TxRemoveDoc<DocNotifyContext> = {
        _id: 'tx3' as any,
        _class: core.class.TxRemoveDoc,
        space: core.space.Tx,
        modifiedBy: 'acc-me' as any,
        modifiedOn: 3,
        objectId: context._id,
        objectClass: context._class,
        objectSpace: context.space
      }

      txListener?.([removeTx])

      expect(get(client.contextById).has('ctxDel' as any)).toBe(false)
      expect(get(client.contextByDoc).has('docDel' as any)).toBe(false)
    })
  })

  describe('totalUnreadCount', () => {
    it('sums unreadCount across contexts returned by the unread query', async () => {
      const client = NotificationClientImpl.getClient()
      await initClient(client)

      expect(unreadQueryCallback).toBeDefined()
      unreadQueryCallback?.([{ unreadCount: 2 }, { unreadCount: 3 }])

      expect(get(client.totalUnreadCount)).toBe(5)
    })

    it('is 0 when the unread query returns nothing', async () => {
      const client = NotificationClientImpl.getClient()
      await initClient(client)

      unreadQueryCallback?.([])

      expect(get(client.totalUnreadCount)).toBe(0)
    })

    it('merges inbox and chat unread contexts into unreadByDoc keyed by document', async () => {
      const client = NotificationClientImpl.getClient()
      await initClient(client)

      unreadQueryCallback?.([{ objectId: 'docA', unreadCount: 2, unreadMessagesCount: 0 }])
      unreadMessagesQueryCallback?.([
        { objectId: 'docA', unreadCount: 2, unreadMessagesCount: 1 },
        { objectId: 'docB', unreadCount: 0, unreadMessagesCount: 4 }
      ])

      const byDoc = get(client.unreadByDoc)
      expect(byDoc.size).toBe(2)
      expect(byDoc.get('docA' as any)?.unreadMessagesCount).toBe(1)
      expect(byDoc.get('docB' as any)?.unreadMessagesCount).toBe(4)

      unreadMessagesQueryCallback?.([])
      expect(get(client.unreadByDoc).size).toBe(1)
    })
  })

  describe('readAll', () => {
    it('issues one commit and one createDoc per unread context with something to read', async () => {
      const ctxWithUnread = makeContext({
        _id: 'ctx1' as any,
        objectId: 'd1' as any,
        unreadReactions: [{ id: 'r1' } as any],
        unreadCommons: [],
        unreadMentions: []
      })
      const ctxNothingToRead = makeContext({
        _id: 'ctx2' as any,
        objectId: 'd2' as any,
        unreadReactions: [],
        unreadCommons: [],
        unreadMentions: []
      })
      applyFindAllMock.mockResolvedValueOnce([ctxWithUnread, ctxNothingToRead])
      // forceReadDocState() looks up ReadState per context via the plain (non-apply) client.
      findAllMock.mockResolvedValue([])

      const client = NotificationClientImpl.getClient()
      await client.readAll()

      expect(applyMock).toHaveBeenCalledTimes(1)
      expect(commitMock).toHaveBeenCalledTimes(1)
      expect(createDocMock).toHaveBeenCalledTimes(1)
      expect(createDocMock).toHaveBeenCalledWith(
        notification.class.ReadNotificationAction,
        ctxWithUnread.space,
        expect.objectContaining({ attachedTo: ctxWithUnread.objectId, reactionIds: ['r1'] })
      )
    })

    it('does nothing but reset the flag when there are no unread contexts', async () => {
      applyFindAllMock.mockResolvedValueOnce([])
      findAllMock.mockResolvedValue([])

      const client = NotificationClientImpl.getClient()
      await client.readAll()

      expect(commitMock).toHaveBeenCalledTimes(1)
      expect(createDocMock).not.toHaveBeenCalled()
      expect(get(client.readingAllInbox)).toBe(false)
    })
  })

  describe('clearAll', () => {
    it('issues one commit and removes every context returned by findAll', async () => {
      const ctx1 = makeContext({ _id: 'ctx1' as any, objectId: 'd1' as any })
      const ctx2 = makeContext({ _id: 'ctx2' as any, objectId: 'd2' as any })
      applyFindAllMock.mockResolvedValueOnce([ctx1, ctx2])
      // forceReadDocState() looks up ReadState per context via the plain (non-apply) client.
      findAllMock.mockResolvedValue([])

      const client = NotificationClientImpl.getClient()
      await client.clearAll()

      expect(applyMock).toHaveBeenCalledTimes(1)
      expect(commitMock).toHaveBeenCalledTimes(1)
      expect(removeDocMock).toHaveBeenCalledTimes(2)
      expect(get(client.clearingAllInbox)).toBe(false)
    })
  })
})
