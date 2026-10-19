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

import core, { AccountRole, MeasureMetricsContext, type MeasureContext, type TxOperations } from '@hcengineering/core'
import platform from '@hcengineering/platform'
import task, { statusMergeDomain, statusUsageDomain } from '@hcengineering/task'
import workflow from '@hcengineering/workflow'
import { TaskMiddleware } from '../middleware'
import { checkMergeParams, countStatusUsage, mergeStatuses } from '../statusMergeOps'

const WF = 'workflow:class:Workflow'
const TR = 'workflow:class:WorkflowTransition'
const DUM = 'activity:class:DocUpdateMessage'
const FV = 'view:class:FilteredView'
const MIXIN = 'workflow:mixin:ProjectWorkflow'
const SUBTASK = workflow.validator.SubtaskStatus
const PARENT = workflow.validator.ParentStatus

const get = (doc: any, path: string): any => path.split('.').reduce((value, key) => value?.[key], doc)

function matches (doc: any, query: Record<string, any>): boolean {
  return Object.entries(query).every(([k, v]) => {
    const value = get(doc, k)
    if (v?.$in !== undefined) return (v.$in as any[]).includes(value)
    if (v?.$gt !== undefined) return value > v.$gt
    return value === v
  })
}

interface Write {
  kind: 'update' | 'remove'
  id: string
  _class: string
  ops?: any
  modifiedOn?: number
  meta?: any
  derived?: boolean
}

// In-memory stand-in for the part of TxOperations the merge uses; writes apply immediately and are recorded.
class FakeClient {
  readonly writes: Write[]
  readonly queries: Array<{ _class: string, query: Record<string, any>, options?: any }> = []
  flushes = 0
  readonly known = new Set([WF, TR, DUM, FV, MIXIN])

  constructor (
    readonly docs: any[],
    private readonly derived = false,
    writes: Write[] = []
  ) {
    this.writes = writes
  }

  // The writer for derived txes: shares the docs and the record of writes.
  asDerived (): FakeClient {
    return new FakeClient(this.docs, true, this.writes)
  }

  getHierarchy (): any {
    return {
      hasClass: (c: string) => this.known.has(c),
      hasMixin: (doc: any, m: string) => doc[m] !== undefined,
      as: (doc: any, m: string) => doc[m]
    }
  }

  // Like the lookup middleware: scalar query fields are dropped from the returned (copied) docs.
  async findAll (_class: string, query: Record<string, any> = {}, options?: any): Promise<any[]> {
    this.queries.push({ _class, query, options })
    let found = this.docs.filter((d) => d._class === _class && matches(d, query))
    if (options?.sort?._id !== undefined) {
      found = [...found].sort((a, b) => String(a._id).localeCompare(String(b._id)) * options.sort._id)
    }
    if (options?.limit !== undefined) found = found.slice(0, options.limit)
    return found.map((d) => {
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
    this.writes.push({ kind: 'update', id: doc._id, _class: doc._class, ops, modifiedOn, meta, derived: this.derived })
  }

  async remove (doc: any, _on?: number, _by?: any, meta?: any): Promise<void> {
    this.docs.splice(
      this.docs.findIndex((d) => d._id === doc._id),
      1
    )
    this.writes.push({ kind: 'remove', id: doc._id, _class: doc._class, meta, derived: this.derived })
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
      attachedTo: 't1',
      attributeUpdates: { attrKey: 'status', set: ['b'] },
      modifiedOn: 1,
      modifiedBy: 'u'
    },
    { _id: 'f1', _class: FV, filters: '{"status":["b"]}', modifiedOn: 1, modifiedBy: 'u' }
  ])
}

const params = (sources: string[] = ['b'], target = 'a'): any => ({ projectType: 'P', target, sources })
const run = async (
  fake: FakeClient,
  p = params(),
  derived: FakeClient = fake.asDerived()
): ReturnType<typeof mergeStatuses> =>
  await mergeStatuses(
    {
      client: fake as unknown as TxOperations,
      derived: derived as unknown as TxOperations,
      flush: async () => {
        fake.flushes++
      }
    },
    p
  )

// P lists T1 and T3 with a, b, o each. T3 has its own workflow, task and history.
function multi (): FakeClient {
  const fake = fixture()
  const doc = (id: string): any => fake.docs.find((d) => d._id === id)
  doc('P').tasks = ['T1', 'T3']
  doc('P').statuses.push(
    { _id: 'a', taskType: 'T3', color: 1 },
    { _id: 'b', taskType: 'T3', color: 2 },
    { _id: 'o', taskType: 'T3' }
  )
  doc('w1').taskType = 'T1'
  doc('tr1').validators = [{ id: 'v1', rule: SUBTASK, props: { statuses: { T1: ['b', 'o'], T3: ['b'] } } }]
  const message = (id: string, attachedTo: string, attributeUpdates: any): any => ({
    _id: id,
    _class: DUM,
    action: 'update',
    space: 'prj',
    attachedTo,
    attributeUpdates,
    modifiedOn: 1,
    modifiedBy: 'u'
  })
  fake.docs.push(
    { _id: 'T3', _class: task.class.TaskType, statuses: ['a', 'b', 'o'] },
    { _id: 't3', _class: task.class.Task, kind: 'T3', status: 'b', space: 'prj', modifiedOn: 7, modifiedBy: 'u' },
    { _id: 'w3', _class: WF, projectType: 'P', taskType: 'T3', initialStatuses: ['b'], modifiedOn: 1, modifiedBy: 'u' },
    {
      _id: 'tr3',
      _class: TR,
      attachedTo: 'w3',
      rank: '1',
      name: 'in3',
      from: ['o'],
      to: 'b',
      validators: [{ id: 'v3', rule: PARENT, props: { statuses: { T1: ['b'], T3: ['b', 'o'] } } }],
      modifiedOn: 1,
      modifiedBy: 'u'
    },
    message('m3', 't3', { attrKey: 'status', set: ['b'] }),
    // t2 is in the target already, its history still names the source
    message('m2', 't2', { attrKey: 'status', set: ['a'], prevValue: 'b' }),
    message('m4', 't1', { attrKey: 'priority', set: ['b'] })
  )
  return fake
}

describe('mergeStatuses', () => {
  it('writes in the agreed order, silent, keeping modifiedOn of tasks only', async () => {
    const fake = fixture()
    const res = await run(fake)
    expect(res).toMatchObject({ ok: true, merged: ['b'], tasksMoved: 1, removed: ['b'], kept: [], conflicts: [] })

    // the lists have the target already, so their only write is the one that drops the sources
    const order = fake.writes.map((w) => w._class)
    const index = (c: string): number => order.indexOf(c)
    expect(Math.max(index(WF), index(TR))).toBeLessThan(index(task.class.Task))
    expect(index(task.class.Task)).toBeLessThan(index(task.class.Project))
    expect(index(task.class.Project)).toBeLessThan(index(DUM))
    expect(index(DUM)).toBeLessThan(index(task.class.TaskType))
    expect(index(task.class.TaskType)).toBeLessThan(index(task.class.ProjectType))
    expect(index(task.class.ProjectType)).toBeLessThan(index(FV))
    expect(order[order.length - 1]).toBe(core.class.Status)

    expect(fake.writes.every((w) => w.meta?.silent === true)).toBe(true)
    // tasks and projects are derived txes, the rest are not
    const derivedClasses = new Set(fake.writes.filter((w) => w.derived === true).map((w) => w._class))
    expect(derivedClasses).toEqual(new Set([task.class.Task, task.class.Project]))
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

describe('mergeStatuses write order', () => {
  // T1 lacks the target, T3 has it
  function lacking (): FakeClient {
    const fake = fixture()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    doc('P').tasks = ['T1', 'T3']
    doc('T1').statuses = ['b', 'o']
    doc('P').statuses = [
      { _id: 'b', taskType: 'T1', color: 2 },
      { _id: 'o', taskType: 'T1' },
      { _id: 'a', taskType: 'T3', color: 1 }
    ]
    fake.docs.push({ _id: 'T3', _class: task.class.TaskType, statuses: ['a'] })
    return fake
  }

  it('adds the target to the lists before the tasks move and drops the sources after', async () => {
    const fake = lacking()
    expect((await run(fake)).ok).toBe(true)

    const lists = fake.writes.map((w, i) => ({ w, i })).filter((it) => it.w.id === 'T1')
    const moved = fake.writes.findIndex((w) => w.id === 't1')
    expect(lists.map((it) => it.w.ops.statuses)).toEqual([
      ['b', 'a', 'o'],
      ['a', 'o']
    ])
    expect(lists[0].i).toBeLessThan(moved)
    expect(moved).toBeLessThan(lists[1].i)

    const entries = fake.writes.filter((w) => w.id === 'P').map((w) => w.ops.statuses)
    expect(entries).toEqual([
      [
        { _id: 'b', taskType: 'T1', color: 2 },
        { _id: 'a', taskType: 'T1', color: 1 },
        { _id: 'o', taskType: 'T1' },
        { _id: 'a', taskType: 'T3', color: 1 }
      ],
      [
        { _id: 'a', taskType: 'T1', color: 1 },
        { _id: 'o', taskType: 'T1' },
        { _id: 'a', taskType: 'T3', color: 1 }
      ]
    ])
  })

  it('is finished by another run when the first one fails while moving tasks', async () => {
    const fake = fixture()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    for (let i = 0; i < 3; i++) {
      fake.docs.push({ _id: `x${i}`, _class: task.class.Task, kind: 'T1', status: 'b', space: 'prj', modifiedOn: 1 })
    }
    const derived = fake.asDerived()
    const update = derived.update.bind(derived)
    let broken = true
    derived.update = async (d: any, ...rest: any[]) => {
      if (broken && d._id === 'x1') throw new Error('boom')
      await (update as any)(d, ...rest)
    }

    await expect(run(fake, params(), derived)).rejects.toThrow('boom')
    // nothing is lost: the sources are still listed, the status exists, part of the tasks moved
    expect(doc('T1').statuses).toEqual(['a', 'b', 'o'])
    expect(fake.docs.some((d) => d._id === 'b')).toBe(true)
    expect(['t1', 'x0', 'x1', 'x2'].map((id) => doc(id).status)).toEqual(['a', 'a', 'b', 'b'])

    broken = false
    expect(await run(fake, params(), derived)).toMatchObject({
      ok: true,
      merged: ['b'],
      tasksMoved: 2,
      removed: ['b'],
      conflicts: []
    })
    expect(['t1', 't2', 'x0', 'x1', 'x2'].map((id) => doc(id).status)).toEqual(['a', 'a', 'a', 'a', 'a'])
    expect(doc('T1').statuses).toEqual(['a', 'o'])
    expect(fake.docs.some((d) => d._id === 'b')).toBe(false)
  })

  it('reads only the tasks of the covered task types that sit in a source status', async () => {
    const fake = multi()
    await run(fake)
    const query = fake.queries.find((q) => q._class === task.class.Task && q.query.kind !== undefined)?.query
    expect(query).toEqual({ kind: { $in: ['T1', 'T3'] }, status: { $in: ['b'] } })
  })
})

describe('mergeStatuses rules', () => {
  it('rewrites subtask and parent rules of every workflow, listing the target next to the sources meanwhile', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    doc('tr1').validators[0].props.categories = { T1: ['won'] }
    doc('tr1').validators[0].props.statuses.T3 = null
    expect(await run(fake)).toMatchObject({ ok: true })

    expect(doc('tr1').validators).toEqual([
      { id: 'v1', rule: SUBTASK, props: { statuses: { T1: ['a', 'o'], T3: null }, categories: { T1: ['won'] } } }
    ])
    expect(doc('tr3').validators[0].props.statuses).toEqual({ T1: ['a'], T3: ['a', 'o'] })

    // a task that has not moved yet must still pass: both ids are allowed until the tasks are done
    const writes = fake.writes.filter((w) => w.id === 'tr3')
    expect(writes.map((w) => w.ops.validators[0].props.statuses)).toEqual([
      { T1: ['b', 'a'], T3: ['b', 'a', 'o'] },
      { T1: ['a'], T3: ['a', 'o'] }
    ])
    const moved = fake.writes.findIndex((w) => w.id === 't3')
    expect(fake.writes.indexOf(writes[0])).toBeLessThan(moved)
    expect(fake.writes.indexOf(writes[1])).toBeGreaterThan(moved)
    // the transition and its rules are written together
    expect(writes[0].ops).toMatchObject({ to: 'a', from: ['o'] })
  })

  it('keeps a source that a rule of another project type still names', async () => {
    const fake = fixture()
    fake.docs.push(
      { _id: 'w9', _class: WF, projectType: 'P2', taskType: 'T2', modifiedOn: 1, modifiedBy: 'u' },
      {
        _id: 'tr9',
        _class: TR,
        attachedTo: 'w9',
        rank: '1',
        name: 'other',
        from: null,
        to: 'o',
        validators: [{ id: 'v9', rule: SUBTASK, props: { statuses: { T2: ['b'] } } }],
        modifiedOn: 1,
        modifiedBy: 'u'
      }
    )
    expect(await run(fake)).toMatchObject({ ok: true, removed: [], kept: ['b'] })
    expect(fake.docs.find((d) => d._id === 'tr9').validators[0].props.statuses).toEqual({ T2: ['b'] })
  })
})

describe('mergeStatuses scope', () => {
  const scoped = (taskTypes: string[] = ['T1']): any => ({ ...params(), taskTypes })

  it('moves only the covered task types and keeps the source for the others', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    const res = await run(fake, scoped())
    expect(res).toMatchObject({ ok: true, merged: ['b'], tasksMoved: 1, removed: [], kept: ['b'], conflicts: [] })

    expect(doc('T1').statuses).toEqual(['a', 'o'])
    expect(doc('T3').statuses).toEqual(['a', 'b', 'o'])
    expect(doc('P').statuses).toEqual([
      { _id: 'a', taskType: 'T1', color: 1 },
      { _id: 'o', taskType: 'T1' },
      { _id: 'a', taskType: 'T3', color: 1 },
      { _id: 'b', taskType: 'T3', color: 2 },
      { _id: 'o', taskType: 'T3' }
    ])
    expect(doc('t1').status).toBe('a')
    expect(doc('t3').status).toBe('b')
    // workflows and transitions of the covered task types only
    expect(doc('w1').initialStatuses).toEqual(['a', 'o'])
    expect(doc('w3').initialStatuses).toEqual(['b'])
    expect(doc('tr1').to).toBe('a')
    expect(doc('tr3').to).toBe('b')
    // rules of every workflow, but only the lists of the covered task types
    expect(doc('tr1').validators[0].props.statuses).toEqual({ T1: ['a', 'o'], T3: ['b'] })
    expect(doc('tr3').validators[0].props.statuses).toEqual({ T1: ['a'], T3: ['b', 'o'] })
    // T3 still lists the source, so the project keeps it and nothing else refers elsewhere
    expect(doc('prj').defaultIssueStatus).toBe('b')
    expect(doc('f1').filters).toBe('{"status":["b"]}')
    expect(fake.docs.some((d) => d._id === 'b')).toBe(true)
  })

  it('rewrites the history of the moved tasks only', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    await run(fake, scoped())
    expect(doc('m1').attributeUpdates.set).toEqual(['a'])
    expect(doc('m3').attributeUpdates.set).toEqual(['b'])
    expect(doc('m2').attributeUpdates).toEqual({ attrKey: 'status', set: ['a'], prevValue: 'b' })
    expect(fake.queries.filter((q) => q._class === DUM).map((q) => q.query.attachedTo)).toEqual([{ $in: ['t1'] }])
  })

  it('maps the order for the covered task types: a listed source stays and the target joins it', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    doc('P').statusOrder = ['x', 'b', 'o']
    await run(fake, scoped())
    expect(doc('P').statusOrder).toEqual(['x', 'b', 'a', 'o'])

    const all = multi()
    all.docs.find((d) => d._id === 'P').statusOrder = ['x', 'b', 'o']
    await run(all, scoped(['T1', 'T3']))
    expect(all.docs.find((d) => d._id === 'P').statusOrder).toEqual(['x', 'a', 'o'])
  })

  it('moves the project default when no task type lists the source any more', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    // T3 does not use the source: nothing outside the scope refers to it
    doc('T3').statuses = ['a', 'o']
    doc('P').statuses = doc('P').statuses.filter((s: any) => !(s._id === 'b' && s.taskType === 'T3'))
    doc('t3').status = 'a'
    doc('tr1').validators[0].props.statuses.T3 = ['o']
    fake.docs.splice(
      fake.docs.findIndex((d) => d._id === 'tr3'),
      1
    )
    expect(await run(fake, scoped())).toMatchObject({ ok: true, removed: ['b'], kept: [] })
    expect(doc('prj').defaultIssueStatus).toBe('a')
  })

  it('covering every task type is the same merge, except for the history of tasks that stay', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    expect(await run(fake, scoped(['T1', 'T3']))).toMatchObject({ ok: true, tasksMoved: 2, removed: ['b'], kept: [] })
    expect(doc('T1').statuses).toEqual(['a', 'o'])
    expect(doc('T3').statuses).toEqual(['a', 'o'])
    expect(doc('m1').attributeUpdates.set).toEqual(['a'])
    expect(doc('m3').attributeUpdates.set).toEqual(['a'])
    // t2 did not move: with a scope its history stays as it is
    expect(doc('m2').attributeUpdates.prevValue).toBe('b')
  })

  it('refuses task types that do not belong to the project type, without writing', async () => {
    const fake = multi()
    const res = await run(fake, scoped(['T1', 'T2']))
    expect(res.ok).toBe(false)
    expect(res.conflicts[0].message).toContain('T2')
    expect(fake.writes).toEqual([])
  })
})

describe('mergeStatuses history', () => {
  it('reads the status messages by pages of _id and rewrites the ones that name a source', async () => {
    const fake = multi()
    const doc = (id: string): any => fake.docs.find((d) => d._id === id)
    // 2300 messages, three pages of 1000: every hundredth one names the source
    for (let i = 0; i < 2300; i++) {
      fake.docs.push({
        _id: `h${String(i).padStart(4, '0')}`,
        _class: DUM,
        action: 'update',
        space: 'prj',
        attachedTo: 't2',
        attributeUpdates: { attrKey: 'status', set: [i % 100 === 0 ? 'b' : 'o'] },
        modifiedOn: 1,
        modifiedBy: 'u'
      })
    }
    await run(fake)

    const pages = fake.queries.filter((q) => q._class === DUM)
    const base = { action: 'update', 'attributeUpdates.attrKey': 'status', space: { $in: ['prj'] } }
    expect(pages.map((p) => p.query)).toEqual([
      base,
      { ...base, _id: { $gt: 'h0999' } },
      { ...base, _id: { $gt: 'h1999' } }
    ])
    expect(pages[0].options).toEqual({ limit: 1000, sort: { _id: 1 } })
    // 23 of the generated ones, plus m1, m2 and m3 of the fixture
    expect(fake.writes.filter((w) => w._class === DUM)).toHaveLength(26)
    expect(doc('h0100').attributeUpdates.set).toEqual(['a'])
    expect(doc('h0101').attributeUpdates.set).toEqual(['o'])
    // an update of another attribute is not history of the status
    expect(doc('m4').attributeUpdates.set).toEqual(['b'])
  })
})

describe('request params', () => {
  const good = { projectType: 'P', target: 'a', sources: ['b'] }

  it('accepts a good request, with the optional fields', () => {
    expect(checkMergeParams(good)).toBeUndefined()
    expect(checkMergeParams({ ...good, transfer: true, taskTypes: ['T1'] })).toBeUndefined()
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['an operator in place of the project type', { ...good, projectType: { $ne: '' } }],
    ['an empty target', { ...good, target: '' }],
    ['no sources', { ...good, sources: [] }],
    ['a source that is not a string', { ...good, sources: [{ $ne: '' }] }],
    ['sources that are not a list', { ...good, sources: 'b' }],
    ['transfer that is not a boolean', { ...good, transfer: 'yes' }],
    ['empty task types', { ...good, taskTypes: [] }],
    ['a task type that is not a string', { ...good, taskTypes: [1] }]
  ])('refuses %s', (_name, params) => {
    expect(typeof checkMergeParams(params)).toBe('string')
  })
})

describe('TaskMiddleware status merge request', () => {
  const ctx = (role: AccountRole, extra: object = {}): MeasureContext =>
    ({ contextData: { account: { role }, ...extra } }) as any
  const code = (c: string): object => ({ status: { code: c } })

  it('is refused below the Maintainer role', async () => {
    const mw = await TaskMiddleware.create({} as any, {} as any)
    const forbidden = code(platform.status.Forbidden)
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

  describe('a caller that may not write', () => {
    // The merge writes as the system account, so the limits that guard tx apply to the caller here
    const apiKey = { canWrite: true, opsOnly: false, spaces: [] as string[], grantsSpaces: false }
    const refusal = async (extra: object): Promise<any> => {
      const mw = await TaskMiddleware.create({} as any, {} as any)
      return await mw.domainRequest(ctx(AccountRole.Maintainer, extra), statusMergeDomain, params()).catch((e) => e)
    }

    it('is refused in a read-only session with the status the tx path uses', async () => {
      expect(await refusal({ readOnly: true })).toMatchObject(code(platform.status.WorkspaceReadOnly))
    })

    it('is refused for an API key without write access, with named operations only, or limited to spaces', async () => {
      const forbidden = code(platform.status.Forbidden)
      expect(await refusal({ apiKey: { ...apiKey, canWrite: false } })).toMatchObject(forbidden)
      expect(await refusal({ apiKey: { ...apiKey, opsOnly: true } })).toMatchObject(forbidden)
      expect(await refusal({ apiKey: { ...apiKey, spaces: ['prj'] } })).toMatchObject(forbidden)
    })

    it('is refused for a member without a seat', async () => {
      expect(await refusal({ seatReadOnly: true })).toMatchObject(code(platform.status.Forbidden))
    })

    it('goes on for a session and an unrestricted API key that may write', async () => {
      const allowed = [{}, { readOnly: false }, { apiKey }, { apiKey: { ...apiKey, opsOnly: true }, opsApi: true }]
      for (const extra of allowed) {
        // refused later, on the missing pipeline head, not for the limits
        const err = await refusal(extra)
        expect(err).not.toMatchObject(code(platform.status.Forbidden))
        expect(err).not.toMatchObject(code(platform.status.WorkspaceReadOnly))
      }
    })
  })

  describe('malformed params', () => {
    const good = { projectType: 'P', target: 'a', sources: ['b'] }
    const badRequest = code(platform.status.BadRequest)

    it.each([
      ['null', null],
      ['an operator in place of the project type', { ...good, projectType: { $ne: '' } }],
      ['no sources', { ...good, sources: [] }],
      ['a task type that is not a string', { ...good, taskTypes: [{ $ne: '' }] }]
    ])('refuses %s with BadRequest before anything is read', async (_name, bad) => {
      const mw = await TaskMiddleware.create({} as any, {} as any)
      await expect(mw.domainRequest(ctx(AccountRole.Maintainer), statusMergeDomain, bad as any)).rejects.toMatchObject(
        badRequest
      )
    })
  })
})

describe('status usage request', () => {
  const real = (role: AccountRole, extra: object = {}): MeasureContext => {
    const c = new MeasureMetricsContext('test', {})
    ;(c as any).contextData = { account: { role }, sessionId: 's', ...extra }
    return c
  }
  // 3 tasks of T1 and 4 of T2 are in the status, two projects have it as the default
  const totals = (_class: string, query: any): number => {
    if (_class === task.class.Project) return 2
    return query.kind === 'T1' ? 3 : query.kind === 'T2' ? 4 : 7
  }
  const middleware = async (): Promise<{ mw: TaskMiddleware, queries: any[] }> => {
    const queries: any[] = []
    const head = {
      findAll: async (_ctx: unknown, _class: string, query: any, options: any) => {
        queries.push({ _class, query, options })
        return Object.assign([], { total: totals(_class, query) })
      }
    }
    const modelDb = { findAllSync: () => [{ _id: 'P', tasks: ['T1', 'T2'] }] }
    const mw = (await TaskMiddleware.create({} as any, { head, modelDb, workspace: {} } as any)) as TaskMiddleware
    return { mw, queries }
  }
  const usage = { projectType: 'P', status: 'b' }

  it('counts the tasks of the workspace, per task type and the projects with the default', async () => {
    const { mw, queries } = await middleware()
    const res = await mw.domainRequest(real(AccountRole.Maintainer), statusUsageDomain, usage)
    expect(res).toEqual({ domain: statusUsageDomain, value: { tasks: 7, byKind: { T1: 3, T2: 4 }, projects: 2 } })

    // one query per number, as the system account: a total only, archived spaces included
    expect(queries.map((q) => [q._class, q.query])).toEqual([
      [task.class.Task, { status: 'b', kind: 'T1' }],
      [task.class.Task, { status: 'b', kind: 'T2' }],
      [task.class.Task, { status: 'b' }],
      [task.class.Project, { type: 'P', defaultIssueStatus: 'b' }]
    ])
    const options = { limit: 1, total: true, showArchived: true }
    expect(queries.every((q) => JSON.stringify(q.options) === JSON.stringify(options))).toBe(true)
  })

  it('needs the Maintainer role but not the right to write', async () => {
    const { mw } = await middleware()
    await expect(mw.domainRequest(real(AccountRole.User), statusUsageDomain, usage)).rejects.toMatchObject({
      status: { code: platform.status.Forbidden }
    })
    const limited = { readOnly: true, seatReadOnly: true, apiKey: { canWrite: false, opsOnly: true, spaces: ['x'] } }
    const res = mw.domainRequest(real(AccountRole.Maintainer, limited), statusUsageDomain, usage)
    await expect(res).resolves.toMatchObject({ value: { tasks: 7 } })
  })

  it('refuses malformed params and an unknown project type', async () => {
    const { mw } = await middleware()
    const badRequest = { status: { code: platform.status.BadRequest } }
    const operator = { projectType: { $ne: '' }, status: 'b' }
    for (const bad of [null, { projectType: 'P' }, operator, { projectType: 'P', status: 1 }]) {
      await expect(mw.domainRequest(real(AccountRole.Maintainer), statusUsageDomain, bad as any)).rejects.toMatchObject(
        badRequest
      )
    }
    const noProjectType = { head: {}, modelDb: { findAllSync: () => [] }, workspace: {} }
    const empty = await TaskMiddleware.create({} as any, noProjectType as any)
    await expect(empty.domainRequest(real(AccountRole.Maintainer), statusUsageDomain, usage)).rejects.toMatchObject(
      badRequest
    )
  })

  it('counts through the injected query, nothing else', async () => {
    const asked: string[] = []
    const count = async (_class: string, query: Record<string, unknown>): Promise<number> => {
      asked.push(`${_class} ${JSON.stringify(query)}`)
      return 1
    }
    const res = await countStatusUsage(count as any, { _id: 'P', tasks: ['T1'] } as any, { status: 'b' as any })
    expect(res).toEqual({ tasks: 1, byKind: { T1: 1 }, projects: 1 })
    expect(asked).toHaveLength(3)
  })
})
