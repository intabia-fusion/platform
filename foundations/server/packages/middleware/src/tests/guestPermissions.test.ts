//
// Copyright © 2025 Hardcore Engineering Inc.
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

// Tests for GuestPermissionsMiddleware: non-guest pass-through, user contact mutability, DocGuest/ReadOnlyGuest denial.

import {
  AccountRole,
  generateId,
  Hierarchy,
  MeasureMetricsContext,
  type Account,
  type Class,
  type Doc,
  type MeasureContext,
  type PersonId,
  type Ref,
  type SessionData,
  type Space,
  type Tx,
  TxFactory
} from '@hcengineering/core'
import contact from '@hcengineering/contact'
import type { PipelineContext, TxMiddlewareResult } from '@hcengineering/server-core'
import { GuestPermissionsMiddleware } from '../guestPermissions'

const TEST_CLASS = 'test:class:TestClass' as Ref<Class<Doc>>
const TEST_SPACE = 'test:space:Test' as Ref<Space>

function makeAccount (role: AccountRole): Account {
  return {
    uuid: generateId() as any,
    role,
    primarySocialId: 'test' as PersonId,
    socialIds: ['test' as PersonId],
    fullSocialIds: []
  }
}

function makeCtx (account: Account): MeasureContext<SessionData> {
  const ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>
  ctx.contextData = {
    account,
    broadcast: { txes: [], queue: [], sessions: {} }
  } as any
  return ctx
}

type FindAllFn = (ctx: MeasureContext, _class: Ref<Class<Doc>>, query: object, options?: object) => Promise<Doc[]>

function makePipelineContext (): PipelineContext {
  const hierarchy = new Hierarchy()
  const model = { findAllSync: (_class: any, _query: any) => [] } as any
  return {
    workspace: { uuid: 'test-workspace' as any, url: 'test', dataId: 'test' as any },
    hierarchy,
    modelDb: model,
    branding: null as any,
    adapterManager: {} as any,
    storageAdapter: {} as any,
    contextVars: {},
    lastTx: '',
    lastHash: '',
    broadcastEvent: async () => {}
  } as any
}

function makeMiddleware (
  findAll: FindAllFn,
  nextFn?: (ctx: MeasureContext, txes: Tx[]) => Promise<TxMiddlewareResult>
): GuestPermissionsMiddleware {
  const context = makePipelineContext()
  const next = nextFn !== undefined ? { tx: nextFn } : { tx: async (_ctx: MeasureContext, _txes: Tx[]) => ({}) }
  const mw = new (GuestPermissionsMiddleware as any)(context, next)
  // Override findAll to inject our test data
  mw.findAll = findAll
  return mw
}

function makeCreateTx (objectClass: Ref<Class<Doc>>, objectSpace: Ref<Space>): Tx {
  const factory = new TxFactory('test:account:System' as PersonId)
  return factory.createTxCreateDoc(objectClass, objectSpace, {})
}

function patchContactHierarchy (mw: GuestPermissionsMiddleware): void {
  ;(mw as any).context.hierarchy.isDerived = (a: any, b: any) => a === b
  ;(mw as any).context.hierarchy.hasMixin = (doc: any, mixin: any) =>
    mixin === contact.mixin.Employee && doc?.employee === true
}

function makePersonDoc (_id: Ref<Doc>, personUuid: Account['uuid'], employee: boolean = true): Doc {
  return {
    _id,
    _class: contact.class.Person,
    space: 'contact:space:Contacts' as Ref<Space>,
    modifiedOn: Date.now(),
    modifiedBy: 'test' as PersonId,
    personUuid,
    employee
  } as any
}

describe('GuestPermissionsMiddleware', () => {
  describe('non-guest users', () => {
    it('User role: passes through without restriction', async () => {
      let nextCalled = false
      const mw = makeMiddleware(
        async () => [],
        async () => {
          nextCalled = true
          return {}
        }
      )
      const tx = makeCreateTx(TEST_CLASS, TEST_SPACE)
      const ctx = makeCtx(makeAccount(AccountRole.User))
      await mw.tx(ctx, [tx])
      expect(nextCalled).toBe(true)
    })

    it('Owner role: passes through without restriction', async () => {
      let nextCalled = false
      const mw = makeMiddleware(
        async () => [],
        async () => {
          nextCalled = true
          return {}
        }
      )
      const tx = makeCreateTx(TEST_CLASS, TEST_SPACE)
      const ctx = makeCtx(makeAccount(AccountRole.Owner))
      await mw.tx(ctx, [tx])
      expect(nextCalled).toBe(true)
    })
  })

  describe('user contact mutability', () => {
    it('forbids a user from updating another employee person', async () => {
      const otherPersonId = generateId()
      const account = makeAccount(AccountRole.User)
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === otherPersonId) {
          return [makePersonDoc(otherPersonId, generateId() as any)]
        }
        return []
      }
      const mw = makeMiddleware(findAll)
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Person as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        otherPersonId,
        { name: 'Changed' } as any
      )

      await expect(mw.tx(makeCtx(account), [tx])).rejects.toThrow()
    })

    it('allows a user to update their own employee person', async () => {
      const personId = generateId()
      const account = makeAccount(AccountRole.User)
      let nextCalled = false
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === personId) {
          return [makePersonDoc(personId, account.uuid)]
        }
        return []
      }
      const mw = makeMiddleware(findAll, async () => {
        nextCalled = true
        return {}
      })
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Person as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        personId,
        { name: 'Changed' } as any
      )

      await mw.tx(makeCtx(account), [tx])
      expect(nextCalled).toBe(true)
    })

    it('forbids a user from updating channels attached to another employee person', async () => {
      const otherPersonId = generateId()
      const channelId = generateId()
      const account = makeAccount(AccountRole.User)
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === otherPersonId) {
          return [makePersonDoc(otherPersonId, generateId() as any)]
        }
        if (_class === contact.class.Channel && query?._id === channelId) {
          return [
            {
              _id: channelId,
              _class: contact.class.Channel,
              space: 'contact:space:Contacts' as Ref<Space>,
              modifiedOn: Date.now(),
              modifiedBy: 'test' as PersonId,
              attachedTo: otherPersonId,
              attachedToClass: contact.class.Person
            } as any
          ]
        }
        return []
      }
      const mw = makeMiddleware(findAll)
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Channel as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        channelId,
        { value: 'new@example.com' } as any
      )

      await expect(mw.tx(makeCtx(account), [tx])).rejects.toThrow()
    })

    it('does not trust spoofed channel parent fields', async () => {
      const ownPersonId = generateId()
      const otherPersonId = generateId()
      const channelId = generateId()
      const account = makeAccount(AccountRole.User)
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === ownPersonId) {
          return [makePersonDoc(ownPersonId, account.uuid)]
        }
        if (_class === contact.class.Person && query?._id === otherPersonId) {
          return [makePersonDoc(otherPersonId, generateId() as any)]
        }
        if (_class === contact.class.Channel && query?._id === channelId) {
          return [
            {
              _id: channelId,
              _class: contact.class.Channel,
              space: 'contact:space:Contacts' as Ref<Space>,
              modifiedOn: Date.now(),
              modifiedBy: 'test' as PersonId,
              attachedTo: otherPersonId,
              attachedToClass: contact.class.Person
            } as any
          ]
        }
        return []
      }
      const mw = makeMiddleware(findAll)
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Channel as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        channelId,
        { value: 'new@example.com' } as any
      )
      tx.attachedTo = ownPersonId
      tx.attachedToClass = contact.class.Person

      await expect(mw.tx(makeCtx(account), [tx])).rejects.toThrow()
    })

    it('forbids creating a channel attached through attributes to another employee person', async () => {
      const otherPersonId = generateId()
      const account = makeAccount(AccountRole.User)
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === otherPersonId) {
          return [makePersonDoc(otherPersonId, generateId() as any)]
        }
        return []
      }
      const mw = makeMiddleware(findAll)
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxCreateDoc(
        contact.class.Channel as Ref<Class<Doc>>,
        'contact:space:Contacts' as Ref<Space>,
        {
          attachedTo: otherPersonId,
          attachedToClass: contact.class.Person,
          collection: 'channels',
          provider: 'contact:channelProvider:Email',
          value: 'new@example.com'
        } as any
      )

      await expect(mw.tx(makeCtx(account), [tx])).rejects.toThrow()
    })

    it('forbids moving a channel to another employee person', async () => {
      const ownPersonId = generateId()
      const otherPersonId = generateId()
      const channelId = generateId()
      const account = makeAccount(AccountRole.User)
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === ownPersonId) {
          return [makePersonDoc(ownPersonId, account.uuid)]
        }
        if (_class === contact.class.Person && query?._id === otherPersonId) {
          return [makePersonDoc(otherPersonId, generateId() as any)]
        }
        if (_class === contact.class.Channel && query?._id === channelId) {
          return [
            {
              _id: channelId,
              _class: contact.class.Channel,
              space: 'contact:space:Contacts' as Ref<Space>,
              modifiedOn: Date.now(),
              modifiedBy: 'test' as PersonId,
              attachedTo: ownPersonId,
              attachedToClass: contact.class.Person
            } as any
          ]
        }
        return []
      }
      const mw = makeMiddleware(findAll)
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Channel as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        channelId,
        { attachedTo: otherPersonId, attachedToClass: contact.class.Person } as any
      )

      await expect(mw.tx(makeCtx(account), [tx])).rejects.toThrow()
    })

    it('allows a user to add the employee mixin to their own person', async () => {
      const personId = generateId()
      const account = makeAccount(AccountRole.User)
      let nextCalled = false
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === personId) {
          return [makePersonDoc(personId, account.uuid, false)]
        }
        return []
      }
      const mw = makeMiddleware(findAll, async () => {
        nextCalled = true
        return {}
      })
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxMixin(
        personId,
        contact.class.Person as Ref<Class<Doc>>,
        'contact:space:Contacts' as Ref<Space>,
        contact.mixin.Employee,
        { active: true } as any
      )

      await mw.tx(makeCtx(account), [tx])
      expect(nextCalled).toBe(true)
    })

    it('forbids a user from adding the employee mixin to another person', async () => {
      const personId = generateId()
      const account = makeAccount(AccountRole.User)
      const findAll: FindAllFn = async (_ctx, _class, query: any) => {
        if (_class === contact.class.Person && query?._id === personId) {
          return [makePersonDoc(personId, generateId() as any, false)]
        }
        return []
      }
      const mw = makeMiddleware(findAll)
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxMixin(
        personId,
        contact.class.Person as Ref<Class<Doc>>,
        'contact:space:Contacts' as Ref<Space>,
        contact.mixin.Employee,
        { active: true } as any
      )

      await expect(mw.tx(makeCtx(account), [tx])).rejects.toThrow()
    })

    it('allows maintainers to update another employee person', async () => {
      const otherPersonId = generateId()
      const account = makeAccount(AccountRole.Maintainer)
      let nextCalled = false
      const mw = makeMiddleware(
        async () => [],
        async () => {
          nextCalled = true
          return {}
        }
      )
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Person as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        otherPersonId,
        { name: 'Changed' } as any
      )

      await mw.tx(makeCtx(account), [tx])
      expect(nextCalled).toBe(true)
    })

    it('allows owners to update another employee person', async () => {
      const otherPersonId = generateId()
      const account = makeAccount(AccountRole.Owner)
      let nextCalled = false
      const mw = makeMiddleware(
        async () => [],
        async () => {
          nextCalled = true
          return {}
        }
      )
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Person as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        otherPersonId,
        { name: 'Changed' } as any
      )

      await mw.tx(makeCtx(account), [tx])
      expect(nextCalled).toBe(true)
    })

    it('allows owners to update a channel attached to another employee person', async () => {
      const otherPersonId = generateId()
      const channelId = generateId()
      const account = makeAccount(AccountRole.Owner)
      let nextCalled = false
      const mw = makeMiddleware(
        async () => [],
        async () => {
          nextCalled = true
          return {}
        }
      )
      patchContactHierarchy(mw)

      const factory = new TxFactory(account.primarySocialId)
      const tx = factory.createTxUpdateDoc(
        contact.class.Channel as Ref<Class<Doc>>,
        'core:space:Workspace' as Ref<Space>,
        channelId,
        { value: 'new@example.com', attachedTo: otherPersonId } as any
      )

      await mw.tx(makeCtx(account), [tx])
      expect(nextCalled).toBe(true)
    })
  })

  describe('DocGuest and ReadOnlyGuest', () => {
    it('DocGuest: throws Forbidden for any tx', async () => {
      const mw = makeMiddleware(async () => [])
      const tx = makeCreateTx(TEST_CLASS, TEST_SPACE)
      const ctx = makeCtx(makeAccount(AccountRole.DocGuest))
      await expect(mw.tx(ctx, [tx])).rejects.toThrow()
    })

    it('ReadOnlyGuest: throws Forbidden for any tx', async () => {
      const mw = makeMiddleware(async () => [])
      const tx = makeCreateTx(TEST_CLASS, TEST_SPACE)
      const ctx = makeCtx(makeAccount(AccountRole.ReadOnlyGuest))
      await expect(mw.tx(ctx, [tx])).rejects.toThrow()
    })
  })
})
