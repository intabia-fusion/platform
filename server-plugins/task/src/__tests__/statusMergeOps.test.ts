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

import core, { AccountRole, type MeasureContext, type TxOperations } from '@hcengineering/core'
import platform from '@hcengineering/platform'
import task, { statusMergeDomain } from '@hcengineering/task'
import { TaskMiddleware } from '../middleware'
import { mergeStatuses } from '../statusMergeOps'

const WF = 'workflow:class:Workflow'
const TR = 'workflow:class:WorkflowTransition'
const DUM = 'activity:class:DocUpdateMessage'
const FV = 'view:class:FilteredView'
const MIXIN = 'workflow:mixin:ProjectWorkflow'

function matches (doc: any, query: Record<string, any>): boolean {
  return Object.entries(query).every(([k, v]) =>
    v?.$in !== undefined ? (v.$in as any[]).includes(doc[k]) : doc[k] === v
  )
}

interface Write {
  kind: 'update' | 'remove'
  id: string
  _class: string
  ops?: any
  modifiedOn?: number
  meta?: any
}

// In-memory stand-in for the part of TxOperations the merge uses; writes apply immediately and are recorded.
class FakeClient {
  readonly writes: Write[] = []
  flushes = 0
  readonly known = new Set([WF, TR, DUM, FV, MIXIN])

  constructor (readonly docs: any[]) {}

  getHierarchy (): any {
    return {
      hasClass: (c: string) => this.known.has(c),
      hasMixin: (doc: any, m: string) => doc[m] !== undefined,
      as: (doc: any, m: string) => doc[m]
    }
  }

  // Like the lookup middleware: scalar query fields are dropped from the returned (copied) docs.
  async findAll (_class: string, query: Record<string, any> = {}): Promise<any[]> {
    return this.docs
      .filter((d) => d._class === _class && matches(d, query))
      .map((d) => {
        const copy = { ...d }
        for (const [k, v] of Object.entries(query)) {
          if (typeof v === 'string' && copy[k] === v) delete copy[k] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        }
        return copy
      })
  }

  async findOne (_class: string, query: Record<string, any> = {}): Promise<any> {
    return (await this.findAll(_class, query))[0]
  }

  async update (doc: any, ops: any, _r?: boolean, modifiedOn?: number, _by?: any, meta?: any): Promise<void> {
    expect(typeof doc._id).toBe('string')
    Object.assign(
      this.docs.find((d) => d._id === doc._id),
      ops
    )
    this.writes.push({ kind: 'update', id: doc._id, _class: doc._class, ops, modifiedOn, meta })
  }

  async remove (doc: any, _on?: number, _by?: any, meta?: any): Promise<void> {
    this.docs.splice(
      this.docs.findIndex((d) => d._id === doc._id),
      1
    )
    this.writes.push({ kind: 'remove', id: doc._id, _class: doc._class, meta })
  }
}

const status = (id: string, category = 'active'): any => ({
  _id: id,
  _class: core.class.Status,
  name: id,
  ofAttribute: 'attr',
  category,
  modifiedBy: 'user'
})

// a is the target, b is merged into it; T2 (other project type) holds neither unless a test adds it
function fixture (): FakeClient {
  return new FakeClient([
    status('a'),
    status('b'),
    status('o'),
    status('w', 'won'),
    {
      _id: 'P',
      _class: task.class.ProjectType,
      tasks: ['T1'],
      statuses: [
        { _id: 'a', taskType: 'T1', color: 1 },
        { _id: 'b', taskType: 'T1', color: 2 },
        { _id: 'o', taskType: 'T1' }
      ]
    },
    { _id: 'P2', _class: task.class.ProjectType, tasks: ['T2'], statuses: [{ _id: 'o', taskType: 'T2' }] },
    { _id: 'T1', _class: task.class.TaskType, statuses: ['a', 'b', 'o'] },
    { _id: 'T2', _class: task.class.TaskType, statuses: ['o'] },
    { _id: 't1', _class: task.class.Task, kind: 'T1', status: 'b', space: 'prj', modifiedOn: 5, modifiedBy: 'u' },
    { _id: 't2', _class: task.class.Task, kind: 'T1', status: 'a', space: 'prj', modifiedOn: 6, modifiedBy: 'u' },
    { _id: 'prj', _class: task.class.Project, type: 'P', defaultIssueStatus: 'b', modifiedOn: 1, modifiedBy: 'u' },
    { _id: 'w1', _class: WF, projectType: 'P', initialStatuses: ['b', 'o'], modifiedOn: 1, modifiedBy: 'u' },
    {
      _id: 'tr1',
      _class: TR,
      attachedTo: 'w1',
      rank: '1',
      name: 'in',
      from: ['o'],
      to: 'b',
      modifiedOn: 1,
      modifiedBy: 'u'
    },
    {
      _id: 'tr2',
      _class: TR,
      attachedTo: 'w1',
      rank: '2',
      name: 'out',
      from: ['b'],
      to: 'o',
      modifiedOn: 1,
      modifiedBy: 'u'
    },
    {
      _id: 'm1',
      _class: DUM,
      action: 'update',
      space: 'prj',
      attributeUpdates: { attrKey: 'status', set: ['b'] },
      modifiedOn: 1,
      modifiedBy: 'u'
    },
    { _id: 'f1', _class: FV, filters: '{"status":["b"]}', modifiedOn: 1, modifiedBy: 'u' }
  ])
}

const params = (sources: string[] = ['b'], target = 'a'): any => ({ projectType: 'P', target, sources })
const run = async (fake: FakeClient, p = params()): ReturnType<typeof mergeStatuses> =>
  await mergeStatuses(
    {
      client: fake as unknown as TxOperations,
      flush: async () => {
        fake.flushes++
      }
    },
    p
  )

describe('mergeStatuses', () => {
  it('writes in the agreed order, silent, keeping modifiedOn of tasks only', async () => {
    const fake = fixture()
    const res = await run(fake)
    expect(res).toMatchObject({ ok: true, merged: ['b'], tasksMoved: 1, removed: ['b'], kept: [], conflicts: [] })

    const order = fake.writes.map((w) => w._class)
    const index = (c: string): number => order.indexOf(c)
    expect(index(WF)).toBeLessThan(index(TR) + 1)
    expect(Math.max(index(WF), index(TR))).toBeLessThan(index(task.class.TaskType))
    expect(index(task.class.ProjectType)).toBeLessThan(index(task.class.Task))
    expect(index(task.class.Task)).toBeLessThan(index(task.class.Project))
    expect(index(task.class.Project)).toBeLessThan(index(DUM))
    expect(index(DUM)).toBeLessThan(index(FV))
    expect(order[order.length - 1]).toBe(core.class.Status)

    expect(fake.writes.every((w) => w.meta?.silent === true)).toBe(true)
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    expect(doc('t1').status).toBe('a')
    expect(fake.writes.find((w) => w.id === 't1')?.modifiedOn).toBe(5)
    // model documents get a fresh modifiedOn, concurrent status creation compares it
    expect(fake.writes.find((w) => w.id === 'P')?.modifiedOn).toBeUndefined()
    expect(fake.writes.find((w) => w.id === 'T1')?.modifiedOn).toBeUndefined()
    expect(doc('T1').statuses).toEqual(['a', 'o'])
    expect(doc('P').statuses).toEqual([
      { _id: 'a', taskType: 'T1', color: 1 },
      { _id: 'o', taskType: 'T1' }
    ])
    expect(doc('prj').defaultIssueStatus).toBe('a')
    expect(doc('w1').initialStatuses).toEqual(['a', 'o'])
    expect(doc('tr1').to).toBe('a')
    expect(doc('tr2').from).toEqual(['a'])
    expect(doc('m1').attributeUpdates.set).toEqual(['a'])
    expect(doc('f1').filters).toBe('{"status":["a"]}')
    expect(fake.flushes).toBeGreaterThan(3)
  })

  it('keeps a source that another task type still lists', async () => {
    const fake = fixture()
    fake.docs.find((d) => d._id === 'T2').statuses = ['o', 'b']
    fake.docs.find((d) => d._id === 'P2').statuses.push({ _id: 'b', taskType: 'T2' })
    const res = await run(fake)
    expect(res).toMatchObject({ ok: true, removed: [], kept: ['b'] })
    expect(fake.docs.some((d) => d._id === 'b')).toBe(true)
    expect(fake.docs.find((d) => d._id === 'f1').filters).toBe('{"status":["b"]}')
  })

  it('keeps a model-defined source (id with colons) and removes an imported one made by System', async () => {
    const fake = fixture()
    fake.docs.find((d) => d._id === 'b').modifiedBy = core.account.System
    expect(await run(fake)).toMatchObject({ ok: true, removed: ['b'], kept: [] })

    const model = fixture()
    for (const d of model.docs) JSON.stringify(d)
    const text = JSON.stringify(model.docs).split('"b"').join('"tracker:status:B"')
    const renamed = new FakeClient(JSON.parse(text))
    expect(await run(renamed, params(['tracker:status:B']))).toMatchObject({
      ok: true,
      removed: [],
      kept: ['tracker:status:B']
    })
  })

  it('writes nothing when a transition would clash or loop', async () => {
    const fake = fixture()
    fake.docs.push({ _id: 'tr3', _class: TR, attachedTo: 'w1', rank: '3', name: 'also in', from: ['o'], to: 'a' })
    const res = await run(fake)
    expect(res.ok).toBe(false)
    expect(res.conflicts[0]).toMatchObject({ kind: 'conflict', workflow: 'w1', transition: 'tr1' })
    expect(fake.writes).toEqual([])

    const loop = fixture()
    loop.docs.find((d) => d._id === 'tr2').from = ['b', 'a']
    loop.docs.find((d) => d._id === 'tr2').to = 'a'
    const res2 = await run(loop)
    expect(res2.conflicts.some((c) => c.kind === 'self')).toBe(true)
    expect(loop.writes).toEqual([])
  })

  it('writes nothing when moved tasks would break the workflow transition rule', async () => {
    const fake = fixture()
    fake.docs.find((d) => d._id === 'prj')[MIXIN] = { workflows: { T1: 'w1' } }
    const res = await run(fake)
    expect(res.ok).toBe(false)
    expect(res.conflicts[0]).toMatchObject({ kind: 'forbiddenTask', workflow: 'w1', task: 't1' })
    expect(fake.writes).toEqual([])

    // an any-to-target transition makes the move legal
    fake.docs.find((d) => d._id === 'tr1').from = []
    expect((await run(fake)).ok).toBe(true)
  })

  it('refuses statuses of different categories and unknown targets without writing', async () => {
    const fake = fixture()
    fake.docs.find((d) => d._id === 'T1').statuses.push('w')
    expect((await run(fake, params(['w']))).ok).toBe(false)
    expect((await run(fake, params(['b'], 'zzz'))).ok).toBe(false)
    expect(fake.writes).toEqual([])
  })

  it('is idempotent: a merged source is skipped', async () => {
    const fake = fixture()
    await run(fake)
    const again = await run(fake)
    expect(again).toEqual({ ok: true, merged: [], tasksMoved: 0, removed: [], kept: [], conflicts: [] })
  })
})

describe('mergeStatuses transfer mode', () => {
  it('moves tasks of an orphan source with another category and deletes it', async () => {
    const fake = fixture()
    fake.docs.push({
      _id: 't3',
      _class: task.class.Task,
      kind: 'T1',
      status: 'w',
      space: 'prj',
      modifiedOn: 7,
      modifiedBy: 'u'
    })
    const res = await run(fake, { ...params(['w']), transfer: true })
    expect(res).toMatchObject({ ok: true, merged: ['w'], tasksMoved: 1, removed: ['w'], conflicts: [] })
    expect(fake.docs.find((d) => d._id === 't3').status).toBe('a')
    expect(fake.docs.some((d) => d._id === 'w')).toBe(false)
  })

  it('skips an orphan source as already merged without transfer', async () => {
    const fake = fixture()
    expect(await run(fake, params(['w']))).toMatchObject({ ok: true, merged: [] })
  })

  it('rewrites statusOrder of the project type', async () => {
    const fake = fixture()
    fake.docs.find((d) => d._id === 'P').statusOrder = ['b', 'o', 'a']
    await run(fake)
    expect(fake.docs.find((d) => d._id === 'P').statusOrder).toEqual(['a', 'o'])
  })
})

describe('TaskMiddleware status merge request', () => {
  const ctx = (role: AccountRole): MeasureContext => ({ contextData: { account: { role } } }) as any

  it('is refused below the Maintainer role', async () => {
    const mw = await TaskMiddleware.create({} as any, {} as any)
    const forbidden = { status: { code: platform.status.Forbidden } }
    await expect(mw.domainRequest(ctx(AccountRole.User), statusMergeDomain, params())).rejects.toMatchObject(forbidden)
    // Maintainer passes the role check and fails later, on the missing pipeline head
    const err = await mw.domainRequest(ctx(AccountRole.Maintainer), statusMergeDomain, params()).catch((e) => e)
    expect(err).toBeDefined()
    expect(err).not.toMatchObject(forbidden)
  })

  it('passes other domains on', async () => {
    const mw = await TaskMiddleware.create({} as any, {} as any)
    const other = 'other' as any
    await expect(mw.domainRequest(ctx(AccountRole.User), other, {})).resolves.toEqual({ domain: other, value: null })
  })
})
