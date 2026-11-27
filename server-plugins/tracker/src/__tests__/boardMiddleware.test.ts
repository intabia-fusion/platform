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
  TxFactory,
  TxProcessor,
  type TxUpdateDoc
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
  isDerived: (a: string, b: string) => a === b || (a === 'test:class:PrivateBoard' && b === tracker.class.Board),
  findDomain: (_class: string) =>
    _class === tracker.class.Board || _class === tracker.class.Component || _class === 'test:class:PrivateBoard'
      ? 'tracker'
      : undefined
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
  let reads: Array<{ cls: string, query: any }>
  let middleware: Middleware
  let downstream: Middleware
  let projectTypes: Record<string, { statuses: Array<{ _id: string, taskType: string }> }>
  let persist: boolean
  let beforeTx: ((txes: Tx[]) => Promise<void>) | undefined

  beforeEach(async () => {
    stored = [
      board('own'),
      board('personal', { visibility: 'me', space: 'alice-space' as any }),
      { _id: 'alice-space', _class: contact.class.PersonSpace, account: alice } as any,
      { _id: 'bob-space', _class: contact.class.PersonSpace, account: bob } as any
    ]
    passed = []
    reads = []
    projectTypes = { type: { statuses: [{ _id: 'kept', taskType: 'task' }] } }
    persist = false
    beforeTx = undefined
    const next = {
      tx: async (_ctx: any, txes: Tx[]) => {
        if (beforeTx !== undefined) await beforeTx(txes)
        if (persist) {
          for (const tx of txes) {
            if (tx._class === core.class.TxUpdateDoc) {
              const update = tx as TxUpdateDoc<Board>
              const index = stored.findIndex((doc) => doc._id === update.objectId)
              stored[index] = TxProcessor.updateDoc2Doc({ ...(stored[index] as Board) }, update)
            }
          }
        }
        passed.push(...txes)
        return {}
      },
      findAll: async (ctx: any, _class: string, query: any) => {
        reads.push({ cls: _class, query })
        const ids: string[] | undefined = query._id?.$in ?? (query._id !== undefined ? [query._id] : undefined)
        const found = stored.filter(
          (it) =>
            hierarchy.isDerived(it._class, _class) &&
            (ids === undefined || ids.includes(it._id)) &&
            visible(it, ctx.contextData.account.uuid)
        )
        return toFindResult(found, found.length)
      }
    }
    downstream = next as unknown as Middleware
    middleware = await BoardMiddleware.create(
      ctxOf(alice),
      { hierarchy, modelDb: { findObject: (id: string) => projectTypes[id] } } as any,
      next as any
    )
  })

  const update = (id: string, ops: any): Tx =>
    factory.createTxUpdateDoc(tracker.class.Board, core.space.Workspace, id as Ref<Board>, ops)
  const remove = (id: string): Tx =>
    factory.createTxRemoveDoc(tracker.class.Board, core.space.Workspace, id as Ref<Board>)

  const columns = (second = 'Doing'): Board['columns'] => [
    { id: 'a', title: 'Queue', statuses: [], category: 'category' as any },
    { id: 'b', title: second, statuses: [], category: 'category' as any }
  ]

  it('keeps duplicates allowed by default and when the restriction is disabled', async () => {
    await middleware.tx(ctxOf(alice), [update('own', { columns: columns(' queue ') })])
    await middleware.tx(ctxOf(alice), [
      update('own', { preventDuplicateColumnTitles: false, columns: columns('QUEUE') })
    ])
    expect(passed).toHaveLength(2)
  })

  it('refuses enabling the restriction with existing duplicate titles', async () => {
    stored[0] = board('own', { columns: columns(' queue ') })
    const status = await refusal(middleware.tx(ctxOf(alice), [update('own', { preventDuplicateColumnTitles: true })]))
    expect(status.code).toBe(tracker.status.DuplicateColumnTitle)
    expect(passed).toHaveLength(0)
  })

  it('validates creation as well as renaming and insertion through operators', async () => {
    const create = factory.createTxCreateDoc(tracker.class.Board, core.space.Workspace, {
      author: alice,
      visibility: 'all',
      columns: columns('QUEUE'),
      preventDuplicateColumnTitles: true
    } as any)
    await refusal(middleware.tx(ctxOf(alice), [create]))
    stored[0] = board('own', { columns: columns(), preventDuplicateColumnTitles: true })
    await refusal(middleware.tx(ctxOf(bob), [update('own', { 'columns.1.title': ' queue ' })]))
    await refusal(middleware.tx(ctxOf(alice), [update('own', { $push: { columns: { ...columns()[0], id: 'c' } } })]))
    expect(passed).toHaveLength(0)
    await middleware.tx(ctxOf(alice), [update('own', { columns: columns('Unique') })])
    await middleware.tx(ctxOf(alice), [
      update('own', { preventDuplicateColumnTitles: false, columns: columns('Queue') })
    ])
    expect(passed).toHaveLength(2)
  })

  it('uses the preceding transaction state within a batch', async () => {
    stored[0] = board('own', { columns: columns() })
    await refusal(
      middleware.tx(ctxOf(alice), [
        update('own', { preventDuplicateColumnTitles: true }),
        update('own', { columns: columns('QUEUE') })
      ])
    )
    expect(passed).toHaveLength(0)
  })

  it.each([true, false])(
    'serializes two editors changing the policy and columns (enable first: %s)',
    async (enableFirst) => {
      stored[0] = board('own', { columns: columns() })
      persist = true
      const enable = update('own', { preventDuplicateColumnTitles: true })
      const duplicate = update('own', { columns: columns('QUEUE') })
      const [first, second] = enableFirst ? [enable, duplicate] : [duplicate, enable]
      const results = await Promise.allSettled([
        middleware.tx(ctxOf(alice), [first]),
        middleware.tx(ctxOf(bob), [second])
      ])
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
      expect(passed).toHaveLength(1)
      // An unsuccessful request releases the queue.
      await middleware.tx(ctxOf(alice), [update('own', { columns: columns() })])
      expect(passed).toHaveLength(2)
    }
  )

  it('recomputes cleanup after concurrent client edits and routes to the current private space', async () => {
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      projects: ['project'] as any,
      filter: condition,
      quickFilters: [{ id: 'q', condition }] as any,
      swimlanes: [],
      colorRules: []
    })
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    persist = true
    let release: () => void = () => {}
    let started: () => void = () => {}
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    beforeTx = async (txes) => {
      if ((txes[0] as any).operations?.visibility === 'me') {
        started()
        await waiting
      }
    }
    const client = middleware.tx(ctxOf(alice), [
      update('own', { visibility: 'me', space: 'alice-space', quickFilters: [{ id: 'q', name: 'edited', condition }] })
    ])
    await entered
    const cleanup = update('own', {
      filter: 'stale',
      quickFilters: [{ id: 'q', name: 'old', condition: 'stale' }]
    }) as TxUpdateDoc<Board>
    cleanup.meta = { boardStatusCleanup: true, silent: true, other: 'preserved' }
    const derived = middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [cleanup])
    release()
    await Promise.all([client, derived])
    const result = stored[0] as Board
    expect(result.space).toBe('alice-space')
    expect((result.quickFilters[0] as any).name).toBe('edited')
    expect(JSON.parse(result.quickFilters[0].condition)[0].value).toEqual(['kept'])
    const sent = passed[1] as TxUpdateDoc<Board>
    expect(sent.objectSpace).toBe('alice-space')
    expect(sent.objectClass).toBe(result._class)
    expect(sent.meta).toEqual({ silent: true, other: 'preserved' })
  })

  it('routes cleanup through the current class and space after a board move', async () => {
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      _class: 'test:class:PrivateBoard' as any,
      space: 'alice-space' as any,
      projects: ['project'] as any,
      filter: condition,
      quickFilters: [],
      swimlanes: [],
      colorRules: []
    })
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    const cleanup = update('own', { filter: 'stale' }) as TxUpdateDoc<Board>
    cleanup.meta = { boardStatusCleanup: true, silent: true, other: 'preserved' }
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [cleanup])
    expect(passed).toHaveLength(1)
    expect(passed[0]).toMatchObject({
      objectClass: 'test:class:PrivateBoard',
      objectSpace: 'alice-space',
      meta: { silent: true, other: 'preserved' }
    })
    expect((passed[0] as TxUpdateDoc<Board>).meta).not.toHaveProperty('boardStatusCleanup')
  })

  it('allows derived writes inside a mixed batch without deadlock', async () => {
    let inner = false
    beforeTx = async (txes) => {
      if (txes.length !== 2) return
      await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [update('own', { title: 'derived' })])
      inner = true
    }
    const other = factory.createTxUpdateDoc(
      tracker.class.Component,
      core.space.Workspace,
      'component' as any,
      { label: 'x' } as any
    )
    await middleware.tx(ctxOf(alice), [update('own', { title: 'outer' }), other])
    expect(inner).toBe(true)
    expect(passed).toHaveLength(3)
  })

  it('cleans all current condition fields once and leaves columns unchanged', async () => {
    const removed = JSON.stringify([{ key: { key: 'status' }, value: ['removed'] }])
    const mixed = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      projects: ['project'] as any,
      filter: removed,
      quickFilters: [{ id: 'q', condition: mixed }] as any,
      swimlanes: [{ id: 's', condition: mixed }] as any,
      colorRules: [{ id: 'c', condition: removed }] as any,
      columns: columns()
    })
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    persist = true
    const cleanup = update('own', {}) as TxUpdateDoc<Board>
    cleanup.meta = { boardStatusCleanup: true }
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [cleanup])
    expect((stored[0] as Board).filter).toBe('')
    expect(JSON.parse((stored[0] as Board).quickFilters[0].condition)[0].value).toEqual(['kept'])
    expect(JSON.parse((stored[0] as Board).swimlanes[0].condition)[0].value).toEqual(['kept'])
    expect((stored[0] as Board).colorRules[0].condition).toBe('')
    expect((stored[0] as Board).columns).toEqual(columns())
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [cleanup])
    expect(passed).toHaveLength(1)
  })

  it('recalculates the allowed statuses from the current project set', async () => {
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      projects: ['project', 'second'] as any,
      filter: condition,
      quickFilters: [],
      swimlanes: [],
      colorRules: []
    })
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    stored.push({ _id: 'second', _class: tracker.class.Project, type: 'type2', space: core.space.Workspace } as any)
    projectTypes.type2 = { statuses: [{ _id: 'removed', taskType: 'task' }] }
    const cleanup = update('own', { filter: 'stale' }) as TxUpdateDoc<Board>
    cleanup.meta = { boardStatusCleanup: true }
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [cleanup])
    expect(passed).toHaveLength(0)
    expect((stored[0] as Board).filter).toBe(condition)
  })

  it('skips cleanup if the current project list is incomplete', async () => {
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed'] }])
    stored[0] = board('own', {
      projects: ['missing'] as any,
      filter: condition,
      quickFilters: [],
      swimlanes: [],
      colorRules: []
    })
    const cleanup = update('own', { filter: '' }) as TxUpdateDoc<Board>
    cleanup.meta = { boardStatusCleanup: true }
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [cleanup])
    expect(passed).toHaveLength(0)
    expect((stored[0] as Board).filter).toBe(condition)
  })

  it('does not reuse a released queue entry in a delayed async descendant', async () => {
    let startLate: () => void = () => {}
    let started: () => void = () => {}
    let release: () => void = () => {}
    let late: Promise<void> = Promise.resolve()
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    beforeTx = async (txes) => {
      const title = (txes[0] as TxUpdateDoc<Board>).operations.title
      if (title === 'first') {
        late = new Promise<void>((resolve) => {
          startLate = resolve
        }).then(async () => {
          await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [update('own', { title: 'late' })])
        })
      }
      if (title === 'second') {
        started()
        await blocked
      }
    }
    await middleware.tx(ctxOf(alice), [update('own', { title: 'first' })])
    const second = middleware.tx(ctxOf(alice), [update('own', { title: 'second' })])
    await entered
    startLate()
    const early = await Promise.race([
      late.then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(false)
        }, 25)
      })
    ])
    expect(early).toBe(false)
    release()
    await Promise.all([second, late])
    expect((passed[2] as TxUpdateDoc<Board>).operations.title).toBe('late')
  })

  it.each([false, true])('passes only the final cleanup to storage and broadcast (derived=%s)', async (isDerived) => {
    const { TxMiddleware } = jest.requireActual('../../../../foundations/server/packages/middleware/src/txPush')
    const { BroadcastMiddleware } = jest.requireActual(
      '../../../../foundations/server/packages/middleware/src/broadcast'
    )
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      space: 'alice-space' as any,
      projects: ['project'] as any,
      filter: condition,
      quickFilters: [],
      swimlanes: [],
      colorRules: []
    })
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    persist = true
    const ctx = ctxOf(alice, { isTriggerCtx: true })
    ctx.with = async (_name: string, _params: object, callback: (ctx: unknown) => unknown) => await callback(ctx)
    const journal: Tx[] = []
    const pipeline = {
      hierarchy,
      modelDb: { findObject: (id: string) => projectTypes[id] },
      workspace: { uuid: 'test' },
      contextVars: {},
      adapterManager: {
        getAdapter: () => ({
          tx: async (_ctx: unknown, ...txes: Tx[]) => {
            journal.push(...txes)
            return []
          }
        })
      }
    }
    const broadcast = new BroadcastMiddleware(pipeline, downstream, {})
    const txStage = await TxMiddleware.create(ctx, pipeline, broadcast)
    const boardStage = await BoardMiddleware.create(ctx, pipeline as any, txStage)
    const cleanup = new TxFactory('alice-social' as PersonId, isDerived).createTxUpdateDoc(
      tracker.class.Board,
      core.space.Workspace,
      'own' as Ref<Board>,
      {},
      undefined,
      undefined,
      undefined,
      { boardStatusCleanup: true, silent: true }
    )
    await boardStage.tx(ctx, [cleanup])
    expect((stored[0] as Board).filter).toBe(JSON.stringify([{ key: { key: 'status' }, value: ['kept'] }]))
    const sent = ctx.contextData.broadcast.txes.filter((tx: Tx) => tx._class === core.class.TxUpdateDoc)
    expect(sent).toHaveLength(1)
    expect(sent[0].objectSpace).toBe('alice-space')
    expect(sent[0].operations.filter).toBe((stored[0] as Board).filter)
    expect(sent[0].meta).toEqual({ silent: true })
    expect(journal).toHaveLength(isDerived ? 0 : 1)
    if (!isDerived) {
      expect((journal[0] as TxUpdateDoc<Board>).operations.filter).toBe((stored[0] as Board).filter)
      expect(journal[0]).not.toHaveProperty('meta')
    }
  })

  it('recalculates a marker after earlier board updates in the same batch', async () => {
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      projects: ['project'] as any,
      filter: condition,
      quickFilters: [{ id: 'q', name: 'old', condition }] as any,
      swimlanes: [],
      colorRules: []
    })
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    persist = true
    const edit = update('own', { quickFilters: [{ id: 'q', name: 'edited', condition }] })
    const cleanup = update('own', {}) as TxUpdateDoc<Board>
    cleanup.meta = { boardStatusCleanup: true }
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), [edit, cleanup])
    const rule = (stored[0] as Board).quickFilters[0] as any
    expect(rule.name).toBe('edited')
    expect(JSON.parse(rule.condition)[0].value).toEqual(['kept'])
  })

  it('loads affected boards and their projects once for a batch of cleanup markers', async () => {
    const condition = JSON.stringify([{ key: { key: 'status' }, value: ['removed', 'kept'] }])
    stored[0] = board('own', {
      projects: ['project'] as any,
      filter: condition,
      quickFilters: [],
      swimlanes: [],
      colorRules: []
    })
    stored.push(
      board('second', {
        projects: ['project'] as any,
        filter: condition,
        quickFilters: [],
        swimlanes: [],
        colorRules: []
      })
    )
    stored.push({ _id: 'project', _class: tracker.class.Project, type: 'type', space: core.space.Workspace } as any)
    const markers = ['own', 'second'].map((id) => {
      const tx = update(id, {}) as TxUpdateDoc<Board>
      tx.meta = { boardStatusCleanup: true }
      return tx
    })
    await middleware.tx(ctxOf(alice, { isTriggerCtx: true }), markers)
    expect(passed).toHaveLength(2)
    expect(reads.filter((it) => it.cls === tracker.class.Board)).toEqual([
      { cls: tracker.class.Board, query: { _id: { $in: ['own', 'second'] } } }
    ])
    expect(reads.filter((it) => it.cls === tracker.class.Project)).toEqual([
      { cls: tracker.class.Project, query: { _id: { $in: ['project'] } } }
    ])
  })

  it('rejects a cleanup marker supplied by a normal client', async () => {
    const tx = update('own', { filter: 'stale' }) as TxUpdateDoc<Board>
    tx.meta = { boardStatusCleanup: true }
    await refusal(middleware.tx(ctxOf(alice), [tx]))
  })

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
