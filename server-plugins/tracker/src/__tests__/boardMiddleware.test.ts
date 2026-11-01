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

import core, {
  type AccountUuid,
  type Doc,
  type PersonId,
  type Ref,
  systemAccountUuid,
  toFindResult,
  type Tx,
  TxFactory
} from '@hcengineering/core'
import { ForbiddenKind, PlatformError, type Status } from '@hcengineering/platform'
import type { Middleware } from '@hcengineering/server-core'
import contact from '@hcengineering/contact'
import tracker, { type Board } from '@hcengineering/tracker'

import { BoardMiddleware } from '../boardMiddleware'

const alice = 'alice' as AccountUuid
const bob = 'bob' as AccountUuid
const carol = 'carol' as AccountUuid
// Board and Component share the tracker domain
const hierarchy = {
  isDerived: (a: string, b: string) => a === b,
  findDomain: (_class: string) =>
    _class === tracker.class.Board || _class === tracker.class.Component ? 'tracker' : undefined
}
const personSpaces: Record<string, AccountUuid> = { 'alice-space': alice, 'bob-space': bob }

function board (id: string, data: Partial<Board> = {}): Board {
  return {
    _id: id as Ref<Board>,
    _class: tracker.class.Board,
    space: core.space.Workspace,
    author: alice,
    editors: [bob],
    visibility: 'all',
    ...data
  } as unknown as Board
}

function ctxOf (uuid: AccountUuid, extra: Record<string, unknown> = {}): any {
  return {
    contextData: { account: { uuid }, contextCache: new Map(), broadcast: { targets: {}, txes: [] }, ...extra },
    newChild: () => ctxOf(uuid, extra)
  }
}

// As the storage reads: a private PersonSpace and its docs only for its account (and the system)
function visible (doc: Doc, account: AccountUuid): boolean {
  if (account === systemAccountUuid) return true
  const owner = personSpaces[doc._class === contact.class.PersonSpace ? doc._id : doc.space]
  return owner === undefined || owner === account
}

async function refusal (promise: Promise<unknown>): Promise<Status> {
  const err = await promise.then(
    () => undefined,
    (err) => err
  )
  expect(err).toBeInstanceOf(PlatformError)
  return (err as PlatformError<any>).status
}

describe('BoardMiddleware', () => {
  const factory = new TxFactory('alice-social' as PersonId)
  let stored: Doc[]
  let passed: Tx[]
  let middleware: Middleware

  beforeEach(async () => {
    stored = [
      board('own'),
      board('personal', { visibility: 'me', space: 'alice-space' as any }),
      { _id: 'alice-space', _class: contact.class.PersonSpace, account: alice } as any,
      { _id: 'bob-space', _class: contact.class.PersonSpace, account: bob } as any
    ]
    passed = []
    const next = {
      tx: async (_ctx: any, txes: Tx[]) => {
        passed.push(...txes)
        return {}
      },
      findAll: async (ctx: any, _class: string, query: any) => {
        const ids: string[] | undefined = query._id?.$in ?? (query._id !== undefined ? [query._id] : undefined)
        const found = stored.filter(
          (it) =>
            it._class === _class &&
            (ids === undefined || ids.includes(it._id)) &&
            visible(it, ctx.contextData.account.uuid)
        )
        return toFindResult(found, found.length)
      }
    }
    middleware = await BoardMiddleware.create(ctxOf(alice), { hierarchy } as any, next as any)
  })

  const update = (id: string, ops: any): Tx =>
    factory.createTxUpdateDoc(tracker.class.Board, core.space.Workspace, id as Ref<Board>, ops)
  const remove = (id: string): Tx =>
    factory.createTxRemoveDoc(tracker.class.Board, core.space.Workspace, id as Ref<Board>)

  it('lets the author and an editor change a board', async () => {
    await middleware.tx(ctxOf(alice), [update('own', { title: 'A' })])
    await middleware.tx(ctxOf(bob), [update('own', { title: 'B' })])
    await middleware.tx(ctxOf(alice), [remove('own')])
    expect(passed).toHaveLength(3)
  })

  it('refuses a stranger to update or remove a board', async () => {
    for (const tx of [update('own', { title: 'X' }), remove('own')]) {
      const status = await refusal(middleware.tx(ctxOf(carol), [tx]))
      expect(status.params).toMatchObject({ kind: ForbiddenKind.AuthorOnly })
    }
    expect(passed).toEqual([])
  })

  it('refuses a board the caller cannot read, whatever space the tx names', async () => {
    // Alice's personal board is hidden from Carol; the tx claims the workspace
    for (const tx of [update('personal', { title: 'X' }), remove('personal')]) {
      const status = await refusal(middleware.tx(ctxOf(carol), [tx]))
      expect(status.params).toMatchObject({ kind: ForbiddenKind.AuthorOnly })
    }
    expect(passed).toEqual([])
  })

  it('refuses a board change sent under another class of its domain', async () => {
    const spoofed = factory.createTxUpdateDoc(
      tracker.class.Component,
      core.space.Workspace,
      'own' as any,
      {
        author: carol
      } as any
    )
    await expect(middleware.tx(ctxOf(carol), [spoofed])).rejects.toThrow(PlatformError)
    // The author is refused too: a board changes only as a board
    await expect(middleware.tx(ctxOf(alice), [spoofed])).rejects.toThrow(PlatformError)
    expect(passed).toEqual([])
  })

  it('lets a tx of another class of the domain through when its id is no board', async () => {
    const component = factory.createTxUpdateDoc(
      tracker.class.Component,
      core.space.Workspace,
      'comp' as any,
      {
        label: 'C'
      } as any
    )
    await middleware.tx(ctxOf(carol), [component])
    expect(passed).toHaveLength(1)
  })

  it('refuses a stranger with Forbidden on a board stored without editors', async () => {
    stored.push(board('bare', { editors: undefined }))
    const status = await refusal(middleware.tx(ctxOf(carol), [update('bare', { title: 'X' })]))
    expect(status.params).toMatchObject({ kind: ForbiddenKind.AuthorOnly })
  })

  it('lets only the author remove a board', async () => {
    await expect(middleware.tx(ctxOf(bob), [remove('own')])).rejects.toThrow(PlatformError)
    await middleware.tx(ctxOf(alice), [remove('own')])
    expect(passed).toHaveLength(1)
  })

  it('refuses a stranger when the batch hides the change among other txes', async () => {
    await expect(
      middleware.tx(ctxOf(carol), [update('other-doc', {}), update('own', { title: 'X' })])
    ).rejects.toThrow()
    expect(passed).toEqual([])
  })

  it('creates a board in the name of its author only', async () => {
    const create = (author: AccountUuid): Tx =>
      factory.createTxCreateDoc(
        tracker.class.Board,
        core.space.Workspace,
        board('new', { author }) as any,
        'new' as any
      )
    await middleware.tx(ctxOf(bob), [create(bob)])
    await expect(middleware.tx(ctxOf(bob), [create(alice)])).rejects.toThrow()
    expect(passed).toHaveLength(1)
  })

  it('checks a tx against the board created earlier in the same batch', async () => {
    const create = factory.createTxCreateDoc(
      tracker.class.Board,
      core.space.Workspace,
      board('fresh', { author: bob, editors: [] }) as any,
      'fresh' as any
    )
    await expect(middleware.tx(ctxOf(bob), [create, update('fresh', { title: 'Mine' })])).resolves.toBeDefined()
    await expect(middleware.tx(ctxOf(carol), [create, update('fresh', { title: 'Mine' })])).rejects.toThrow()
  })

  it('lets only the author hand a board over', async () => {
    await expect(middleware.tx(ctxOf(bob), [update('own', { author: bob })])).rejects.toThrow()
    await expect(middleware.tx(ctxOf(bob), [update('own', { $set: { author: bob } })])).rejects.toThrow()
    await middleware.tx(ctxOf(bob), [update('own', { title: 'Same author', author: alice })])
    await middleware.tx(ctxOf(alice), [update('own', { author: bob })])
    expect(passed).toHaveLength(2)
  })

  it('lets only the author switch visibility or move a board to another space', async () => {
    await expect(middleware.tx(ctxOf(bob), [update('own', { visibility: 'me' })])).rejects.toThrow()
    await expect(middleware.tx(ctxOf(bob), [update('own', { space: 'bob-space' })])).rejects.toThrow()
    await middleware.tx(ctxOf(bob), [update('own', { visibility: 'all' })])
    await middleware.tx(ctxOf(alice), [update('own', { visibility: 'me', space: 'alice-space' })])
    expect(passed).toHaveLength(2)
  })

  it("keeps a personal board in its author's PersonSpace and a team board in the workspace", async () => {
    // The space of a created doc is the space of its tx
    const create = (data: Partial<Board>): Tx =>
      factory.createTxCreateDoc(
        tracker.class.Board,
        data.space ?? core.space.Workspace,
        board('new', data) as any,
        'new' as any
      )
    // Another person's PersonSpace or the workspace is no place for a personal board
    await expect(
      middleware.tx(ctxOf(alice), [update('own', { visibility: 'me', space: 'bob-space' })])
    ).rejects.toThrow()
    await expect(middleware.tx(ctxOf(alice), [update('own', { visibility: 'me' })])).rejects.toThrow()
    await expect(middleware.tx(ctxOf(alice), [update('personal', { space: 'bob-space' })])).rejects.toThrow()
    await expect(
      middleware.tx(ctxOf(alice), [create({ visibility: 'me', space: 'bob-space' as any })])
    ).rejects.toThrow()
    // A team board stays in the workspace
    await expect(middleware.tx(ctxOf(alice), [update('own', { space: 'alice-space' })])).rejects.toThrow()
    // Handing a personal board over leaves it in the old author's PersonSpace
    await expect(middleware.tx(ctxOf(alice), [update('personal', { author: bob })])).rejects.toThrow()
    expect(passed).toEqual([])

    await middleware.tx(ctxOf(alice), [create({ visibility: 'me', space: 'alice-space' as any })])
    await middleware.tx(ctxOf(alice), [update('personal', { visibility: 'all', space: core.space.Workspace })])
    expect(passed).toHaveLength(2)
  })

  it('tells every session to reload boards after a board moves to another space', async () => {
    const events = (ctx: any): unknown[] => ctx.contextData.broadcast.txes
    const plain = ctxOf(alice)
    await middleware.tx(plain, [update('own', { title: 'Same space' })])
    expect(events(plain)).toEqual([])

    const refused = ctxOf(alice)
    await expect(middleware.tx(refused, [update('own', { visibility: 'me', space: 'bob-space' })])).rejects.toThrow()
    expect(events(refused)).toEqual([])

    const moved = ctxOf(alice)
    await middleware.tx(moved, [update('personal', { visibility: 'all', space: core.space.Workspace })])
    expect(events(moved)).toMatchObject([
      { _class: core.class.TxWorkspaceEvent, params: { _class: [tracker.class.Board] } }
    ])
  })

  it('passes the system account and trigger txes', async () => {
    await middleware.tx(ctxOf(systemAccountUuid), [update('own', { title: 'S' }), remove('personal')])
    await middleware.tx(ctxOf(carol, { isTriggerCtx: true }), [update('own', { title: 'T' })])
    expect(passed).toHaveLength(3)
  })
})
