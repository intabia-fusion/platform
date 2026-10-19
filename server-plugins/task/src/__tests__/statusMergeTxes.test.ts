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
  AccountRole,
  MeasureMetricsContext,
  systemAccount,
  TxOperations,
  type Client,
  type MeasureContext,
  type Tx
} from '@hcengineering/core'
import { NormalizeTxMiddleware } from '@hcengineering/middleware'
import task, { statusMergeDomain } from '@hcengineering/task'
import { TaskMiddleware } from '../middleware'
import { mergeStatuses } from '../statusMergeOps'

const WF = 'workflow:class:Workflow'
const TR = 'workflow:class:WorkflowTransition'
const DUM = 'activity:class:DocUpdateMessage'
const FV = 'view:class:FilteredView'

const get = (doc: any, path: string): any => path.split('.').reduce((value, key) => value?.[key], doc)

const matches = (doc: any, query: Record<string, any>): boolean =>
  Object.entries(query).every(([k, v]) => {
    const value = get(doc, k)
    if (v?.$in !== undefined) return (v.$in as any[]).includes(value)
    if (v?.$gt !== undefined) return value > v.$gt
    return value === v
  })

// Like the pipeline: filtered, sorted, cut, scalar query fields dropped from the copies.
function find (data: any[], _class: string, query: Record<string, any> = {}, options: any = {}): any[] {
  let found = data.filter((d) => d._class === _class && matches(d, query))
  if (options.sort?._id !== undefined) found = [...found].sort((a, b) => a._id.localeCompare(b._id) * options.sort._id)
  if (options.limit !== undefined) found = found.slice(0, options.limit)
  return found.map((d) => {
    const copy = { ...d }
    for (const [k, v] of Object.entries(query)) {
      if (typeof v === 'string' && copy[k] === v) delete copy[k] // eslint-disable-line @typescript-eslint/no-dynamic-delete
    }
    return copy
  })
}

function apply (data: any[], tx: Tx): void {
  const cud = tx as any
  const at = data.findIndex((d) => d._id === cud.objectId)
  if (tx._class === core.class.TxUpdateDoc) Object.assign(data[at], cud.operations)
  if (tx._class === core.class.TxRemoveDoc) data.splice(at, 1)
}

const hierarchy = (): any => ({
  hasClass: (c: string) => [WF, TR, DUM, FV].includes(c),
  hasMixin: () => false,
  isMixin: () => false,
  isDerived: (c: string, b: string) => b === core.class.AttachedDoc && [TR, DUM, task.class.Task].includes(c as any)
})

const base = (id: string, _class: string, extra: Record<string, any> = {}): any => ({
  _id: id,
  _class,
  space: 'core:space:Workspace',
  modifiedBy: '9040845210464455032',
  modifiedOn: 1788351422729,
  ...extra
})

// Docs shaped like the ones the pipeline returns; the real TxOperations builds the txes.
function docs (): any[] {
  const status = (id: string): any =>
    base(id, core.class.Status, { name: id, ofAttribute: 'attr', category: 'active', space: core.space.Model })
  return [
    status('a'),
    status('b'),
    status('o'),
    base('P', task.class.ProjectType, {
      space: core.space.Model,
      tasks: ['T1'],
      statuses: [
        { _id: 'a', taskType: 'T1' },
        { _id: 'b', taskType: 'T1' },
        { _id: 'o', taskType: 'T1' }
      ]
    }),
    base('T1', task.class.TaskType, { space: core.space.Model, statuses: ['a', 'b', 'o'] }),
    base('t1', task.class.Task, {
      kind: 'T1',
      status: 'b',
      space: 'prj',
      attachedTo: 'parent',
      attachedToClass: task.class.Task,
      collection: 'subIssues'
    }),
    base('prj', task.class.Project, { type: 'P', defaultIssueStatus: 'b', space: core.space.Space }),
    base('w1', WF, { projectType: 'P', initialStatuses: ['b', 'o'] }),
    base('tr1', TR, {
      attachedTo: 'w1',
      attachedToClass: WF,
      collection: 'transitions',
      rank: '1',
      name: 'in',
      from: ['o'],
      to: 'b'
    }),
    base('tr2', TR, {
      attachedTo: 'w1',
      attachedToClass: WF,
      collection: 'transitions',
      rank: '2',
      name: 'out',
      from: ['b'],
      to: 'o'
    }),
    base('m1', DUM, {
      action: 'update',
      space: 'prj',
      attributeUpdates: { attrKey: 'status', set: ['b'] },
      attachedTo: 'x',
      attachedToClass: 'c',
      collection: 'c'
    }),
    base('f1', FV, { filters: '{"status":["b"]}', space: core.space.Workspace })
  ]
}

describe('txes of the status merge', () => {
  it('every tx passes the real NormalizeTxMiddleware, tasks and projects are derived', async () => {
    const data = docs()
    const txes: Tx[] = []
    const client = {
      getHierarchy: hierarchy,
      getModel: () => ({}) as any,
      findAll: async (_class: string, query: Record<string, any> = {}, options?: any) =>
        find(data, _class, query, options),
      findOne: async (_class: string, query: Record<string, any> = {}) =>
        data.find((d) => d._class === _class && matches(d, query)),
      tx: async (tx: Tx) => {
        txes.push(tx)
        apply(data, tx)
        return {}
      },
      close: async () => {},
      domainRequest: async () => ({ domain: '' as any, value: null }),
      searchFulltext: async () => ({ docs: [] })
    } as unknown as Client

    // a stored (not model) status has no colons, so the source is removed as well
    const res = await mergeStatuses(
      {
        client: new TxOperations(client, core.account.System),
        derived: new TxOperations(client, core.account.System, true),
        flush: async () => {}
      },
      { projectType: 'P' as any, target: 'a' as any, sources: ['b' as any] }
    )
    expect(res.ok).toBe(true)
    const classes = new Set(txes.map((t) => (t as any).objectClass))
    // workflow, transition, task type, project type, task, project, message, filter and the removed status
    expect(classes).toEqual(
      new Set([
        WF,
        TR,
        task.class.TaskType,
        task.class.ProjectType,
        task.class.Task,
        task.class.Project,
        DUM,
        FV,
        core.class.Status
      ])
    )

    // activity and webhook skip the txes of the derived space: no "status changed" per task
    const derivedClasses = new Set(
      txes.filter((t) => t.space === core.space.DerivedTx).map((t) => (t as any).objectClass)
    )
    expect(derivedClasses).toEqual(new Set([task.class.Task, task.class.Project]))
    expect(txes.filter((t) => t.space !== core.space.DerivedTx).every((t) => t.space === core.space.Tx)).toBe(true)

    const mw = await NormalizeTxMiddleware.create({} as any, {} as any, undefined)
    const ctx = { contextData: { account: systemAccount }, warn: () => {} } as unknown as MeasureContext<any>
    // BadRequest is thrown for the whole batch when any tx cannot be parsed
    await expect(mw.tx(ctx, JSON.parse(JSON.stringify(txes)))).resolves.toBeDefined()
    for (const t of txes) await expect(mw.tx(ctx, [JSON.parse(JSON.stringify(t))])).resolves.toBeDefined()
    expect(txes.every((t) => t.meta?.silent === true)).toBe(true)
  })
})

describe('status merge through the pipeline head', () => {
  const request = { projectType: 'P', target: 'a', sources: ['b'] }

  // 251 tasks in the source: batches of 100 txes
  function many (): any[] {
    const data = docs()
    for (let i = 0; i < 250; i++) {
      data.push(
        base(`x${String(i).padStart(3, '0')}`, task.class.Task, {
          kind: 'T1',
          status: 'b',
          space: 'prj',
          attachedTo: 'parent',
          attachedToClass: task.class.Task,
          collection: 'subIssues'
        })
      )
    }
    return data
  }

  // What the real pipeline does to the session data of a batch: txes go to the broadcast buffer.
  function setup (data: any[]): {
    mw: Promise<TaskMiddleware>
    batches: Tx[][]
    broadcasts: Tx[][]
    hooks: { before?: (batch: Tx[]) => void, after?: (ctx: any) => void }
  } {
    const batches: Tx[][] = []
    const broadcasts: Tx[][] = []
    const hooks: { before?: (batch: Tx[]) => void, after?: (ctx: any) => void } = {}
    const head = {
      findAll: async (_ctx: unknown, _class: string, query: Record<string, any>, options?: any) => {
        const found: any = find(data, _class, query, options)
        found.total = found.length
        return found
      },
      tx: async (ctx: any, batch: Tx[]) => {
        hooks.before?.(batch)
        batches.push(batch)
        for (const tx of batch) apply(data, tx)
        ctx.contextData.broadcast.txes.push(...batch)
        hooks.after?.(ctx)
        return {}
      },
      handleBroadcast: async (ctx: any) => {
        broadcasts.push([...ctx.contextData.broadcast.txes])
      }
    }
    const context = { head, hierarchy: hierarchy(), modelDb: {}, workspace: {} }
    const mw = TaskMiddleware.create({} as any, context as any) as any
    return { mw, batches, broadcasts, hooks }
  }

  const maintainer = (): MeasureContext => {
    const ctx = new MeasureMetricsContext('test', {})
    ;(ctx as any).contextData = { account: { role: AccountRole.Maintainer }, sessionId: 's' }
    ctx.error = () => {}
    return ctx
  }
  const ids = (txes: Tx[]): string[] => txes.map((t) => t._id)

  it('broadcasts every flush on its own', async () => {
    const data = many()
    const { mw, batches, broadcasts } = setup(data)
    const res = await (await mw).domainRequest(maintainer(), statusMergeDomain, request)

    expect(res.value).toMatchObject({ ok: true, tasksMoved: 251, removed: ['b'] })
    expect(batches.length).toBeGreaterThan(5)
    // one broadcast per batch, with the txes of that batch and no others
    expect(broadcasts.map(ids)).toEqual(batches.map(ids))
    expect(Math.max(...broadcasts.map((it) => it.length))).toBeLessThanOrEqual(100)
  })

  it('announces what a failed merge saved and is finished by the next run', async () => {
    const data = many()
    const { mw, batches, broadcasts, hooks } = setup(data)
    let broken = true
    hooks.before = (batch) => {
      if (broken && batch.some((tx) => (tx as any).objectId === 'x150')) throw new Error('boom')
    }
    const middleware = await mw

    const failed: any = (await middleware.domainRequest(maintainer(), statusMergeDomain, request)).value
    expect(failed.ok).toBe(false)
    expect(failed.conflicts[0].message).toContain('Part of the changes is already saved; run the merge again')
    // every batch that was stored went out, the failed one did not
    expect(broadcasts.map(ids)).toEqual(batches.map(ids))
    const moved = data.filter((d) => d._class === task.class.Task && d.status === 'a')
    expect(moved).toHaveLength(100)
    expect(data.find((d) => d._id === 'T1').statuses).toEqual(['a', 'b', 'o'])

    broken = false
    const done: any = (await middleware.domainRequest(maintainer(), statusMergeDomain, request)).value
    expect(done).toMatchObject({ ok: true, tasksMoved: 151, removed: ['b'] })
    expect(data.filter((d) => d._class === task.class.Task).every((d) => d.status === 'a')).toBe(true)
    expect(data.find((d) => d._id === 'T1').statuses).toEqual(['a', 'o'])
    expect(data.some((d) => d._id === 'b')).toBe(false)
    expect(broadcasts.map(ids)).toEqual(batches.map(ids))
  })

  it('announces a batch that was stored before the pipeline failed', async () => {
    const data = many()
    const { mw, broadcasts, hooks } = setup(data)
    // the broadcast buffer is filled by the last middleware, a trigger above it can still fail
    hooks.after = (ctx) => {
      const buffered: Tx[] = ctx.contextData.broadcast.txes
      if (buffered.some((tx: any) => tx.objectId === 'x050')) throw new Error('late failure')
    }
    const res: any = (await (await mw).domainRequest(maintainer(), statusMergeDomain, request)).value

    expect(res.ok).toBe(false)
    expect(broadcasts.at(-1)?.some((tx: any) => tx.objectId === 'x050')).toBe(true)
  })

  it('runs the async triggers of a flush once, after its broadcast', async () => {
    const data = many()
    const { mw, broadcasts, hooks } = setup(data)
    const order: string[] = []
    hooks.after = (ctx) => {
      ctx.contextData.asyncRequests = [
        ...(ctx.contextData.asyncRequests ?? []),
        async () => {
          order.push(`async after broadcast ${broadcasts.length}`)
        }
      ]
    }
    await (await mw).domainRequest(maintainer(), statusMergeDomain, request)

    // seven flushes: each ran its own async request, none ran twice
    expect(order).toHaveLength(7)
    expect(new Set(order).size).toBe(7)
  })
})
