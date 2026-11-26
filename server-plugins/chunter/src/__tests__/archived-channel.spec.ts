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

import core, { AccountRole, type AccountUuid, type Ref, systemAccountUuid } from '@hcengineering/core'
import chunter from '@hcengineering/chunter'
import activity from '@hcengineering/activity'
import notification from '@hcengineering/notification'
import { LRUCache } from 'lru-cache'

import { ChunterMiddleware } from '../middleware'

const USER = 'user-account' as AccountUuid
const CHANNEL_OWNER = 'channel-owner' as AccountUuid
const ARCHIVED = 'archived-channel'
const OPEN = 'open-channel'

const DOMAINS: Record<string, string> = {
  [chunter.class.ChatMessage]: 'activity',
  [chunter.class.ThreadMessage]: 'activity',
  [activity.class.ActivityMessage]: 'activity',
  [activity.class.Reaction]: 'reaction',
  [activity.class.AppletInstance]: 'applet',
  'attachment:class:Attachment': 'attachment',
  [notification.class.ReadState]: 'read-state',
  [chunter.class.Channel]: 'space'
}

interface Options {
  account?: AccountUuid
  role?: AccountRole
  trigger?: boolean
}

function makeMiddleware (): any {
  const middleware = Object.create(ChunterMiddleware.prototype)
  middleware.hiddenChats = new Map()
  middleware.archivedChannels = new LRUCache({ max: 10 })
  middleware.archivedUpdates = new Map()
  middleware.archivedVersion = 0
  // What the storage holds: a test archives a channel by adding it here
  middleware.stored = new Set([ARCHIVED])
  middleware.context = {
    hierarchy: {
      isDerived: (a: string, b: string) => a === b,
      findDomain: (it: string) => DOMAINS[it]
    },
    lowLevelStorage: {
      rawFindAll: async (_domain: string, query: any) => {
        if (query.archived === true) {
          const archived: boolean = middleware.stored.has(query._id)
          return archived ? [{ _id: query._id, _class: chunter.class.Channel }] : []
        }
        return [{ _id: query._id, _class: chunter.class.Channel, owners: [CHANNEL_OWNER] }]
      }
    }
  }
  middleware.provideTx = async () => ({})
  return middleware
}

async function send (middleware: any, tx: Record<string, unknown>, options: Options = {}): Promise<void> {
  const { account = USER, role = AccountRole.User, trigger = false } = options
  const ctx = { contextData: { account: { uuid: account, role, socialIds: [] }, isTriggerCtx: trigger } }
  await middleware.tx(ctx, [{ objectId: 'doc', attributes: {}, operations: {}, ...tx }])
}

const create = (objectClass: Ref<any>, objectSpace: string): Record<string, unknown> => ({
  _class: core.class.TxCreateDoc,
  objectClass,
  objectSpace
})

describe('archived channel', () => {
  it.each([
    chunter.class.ChatMessage,
    chunter.class.ThreadMessage,
    activity.class.Reaction,
    activity.class.AppletInstance,
    'attachment:class:Attachment' as Ref<any>
  ])('takes no new %s', async (_class) => {
    await expect(send(makeMiddleware(), create(_class, ARCHIVED))).rejects.toThrow()
  })

  it('leaves a channel that is not archived writable', async () => {
    await expect(send(makeMiddleware(), create(chunter.class.ChatMessage, OPEN))).resolves.toBeUndefined()
  })

  it('still records what was read', async () => {
    await expect(send(makeMiddleware(), create(notification.class.ReadState, ARCHIVED))).resolves.toBeUndefined()
  })

  it('lets triggers and the system write', async () => {
    const tx = create(chunter.class.ChatMessage, ARCHIVED)
    await expect(send(makeMiddleware(), tx, { trigger: true })).resolves.toBeUndefined()
    await expect(send(makeMiddleware(), tx, { account: systemAccountUuid })).resolves.toBeUndefined()
  })

  it.each([true, false])('does not cache a pre-commit read while archived becomes %s', async (archived) => {
    const middleware = makeMiddleware()
    if (!archived) middleware.stored.add(OPEN)
    const archive = {
      _class: core.class.TxUpdateDoc,
      objectClass: chunter.class.Channel,
      objectId: OPEN,
      operations: { archived }
    }
    const message = create(chunter.class.ChatMessage, OPEN)
    let release: () => void = () => {}
    let entered: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    middleware.provideTx = async (_ctx: any, txes: any[]) => {
      if (txes[0]._class === core.class.TxUpdateDoc) {
        entered()
        await blocked
        if (archived) middleware.stored.add(OPEN)
        else middleware.stored.delete(OPEN)
      }
      return {}
    }
    const update = send(middleware, archive, { account: CHANNEL_OWNER })
    await started
    if (archived) await send(middleware, message)
    else await expect(send(middleware, message)).rejects.toThrow()
    release()
    await update
    if (archived) await expect(send(middleware, message)).rejects.toThrow()
    else await expect(send(middleware, message)).resolves.toBeUndefined()
  })

  it.each([true, false])('does not cache a read started before archived becomes %s', async (archived) => {
    const middleware = makeMiddleware()
    if (!archived) middleware.stored.add(OPEN)
    const rawFindAll = middleware.context.lowLevelStorage.rawFindAll
    let release: () => void = () => {}
    let entered: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = true
    middleware.context.lowLevelStorage.rawFindAll = async (domain: string, query: any) => {
      const snapshot = await rawFindAll(domain, query)
      if (query.archived === true && first) {
        first = false
        entered()
        await blocked
      }
      return snapshot
    }
    const message = create(chunter.class.ChatMessage, OPEN)
    const pending = send(middleware, message).catch(() => {})
    await started
    middleware.provideTx = async () => {
      if (archived) middleware.stored.add(OPEN)
      else middleware.stored.delete(OPEN)
      return {}
    }
    await send(
      middleware,
      {
        _class: core.class.TxUpdateDoc,
        objectClass: chunter.class.Channel,
        objectId: OPEN,
        operations: { archived }
      },
      { account: CHANNEL_OWNER }
    )
    release()
    await pending
    if (archived) await expect(send(middleware, message)).rejects.toThrow()
    else await expect(send(middleware, message)).resolves.toBeUndefined()
  })

  it('follows the channel being archived and restored', async () => {
    const middleware = makeMiddleware()
    const archive = (archived: boolean): Record<string, unknown> => ({
      _class: core.class.TxUpdateDoc,
      objectClass: chunter.class.Channel,
      objectId: OPEN,
      operations: { archived }
    })
    const message = create(chunter.class.ChatMessage, OPEN)
    await send(middleware, message)
    middleware.stored.add(OPEN)
    await send(middleware, archive(true), { account: CHANNEL_OWNER })
    await expect(send(middleware, message)).rejects.toThrow()
    middleware.stored.delete(OPEN)
    await send(middleware, archive(false), { account: CHANNEL_OWNER })
    await expect(send(middleware, message)).resolves.toBeUndefined()
  })
})

describe('archiving a channel', () => {
  const archive = {
    _class: core.class.TxUpdateDoc,
    objectClass: chunter.class.Channel,
    objectId: OPEN,
    operations: { archived: true }
  }

  it('is refused to a member', async () => {
    await expect(send(makeMiddleware(), archive)).rejects.toThrow()
    await expect(send(makeMiddleware(), { ...archive, operations: { archived: false } })).rejects.toThrow()
  })

  it('is refused under the base class of the space too', async () => {
    const middleware = makeMiddleware()
    middleware.context.hierarchy.findDomain = () => 'space'
    await expect(send(middleware, { ...archive, objectClass: core.class.Space })).rejects.toThrow()
  })

  it.each([
    ['the channel owner', { account: CHANNEL_OWNER }],
    ['the workspace owner', { role: AccountRole.Owner }],
    ['a trigger', { trigger: true }]
  ])('is open to %s', async (_name, options) => {
    await expect(send(makeMiddleware(), archive, options)).resolves.toBeUndefined()
  })
})
