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

import core, { toIdMap } from '@hcengineering/core'
import type { Attribute, Ref, Status, StatusCategory, TxOperations } from '@hcengineering/core'
import { addStringsLoader, PlatformError, Severity, Status as PlatformStatus } from '@hcengineering/platform'
import task from '../index'
import type { ProjectType } from '../index'
import {
  countTasksByStatus,
  createProjectTypeStates,
  createStatusAtomic,
  createStatusesAtomic,
  findDuplicateStatusGroups,
  canRenameStatusInPlace,
  chooseMergeTarget,
  getExistingStatusOptions,
  getProjectTypeStates,
  getStates,
  getStatusErrorText,
  getStatusNameBlock,
  getStatusNameSuffixes,
  isStatusOnlyInType,
  placeStatusAfter,
  resolveStatusReuse,
  statusKey
} from '../utils'

const attr = 'attr' as Ref<Attribute<Status>>
const otherAttr = 'other' as Ref<Attribute<Status>>
const active = 'active' as Ref<StatusCategory>
const won = 'won' as Ref<StatusCategory>

const st = (id: string, name: string, category = active, ofAttribute = attr): Status =>
  ({ _id: id as Ref<Status>, name, category, ofAttribute }) as unknown as Status

describe('statusKey', () => {
  it('ignores case and outer spaces', () => {
    expect(statusKey(attr, ' Code Review ')).toBe(statusKey(attr, 'code review'))
  })

  it('keeps inner spaces and the attribute', () => {
    expect(statusKey(attr, 'a b')).not.toBe(statusKey(attr, 'ab'))
    expect(statusKey(attr, 'a')).not.toBe(statusKey(otherAttr, 'a'))
  })
})

describe('resolveStatusReuse', () => {
  const existing = [st('s1', 'Done', won), st('s2', 'In Progress')]

  it('creates when the key is new', () => {
    expect(resolveStatusReuse(existing, { ofAttribute: attr, name: 'Review', category: active })).toEqual({
      action: 'create'
    })
  })

  it('reuses the same key and category', () => {
    const res = resolveStatusReuse(existing, { ofAttribute: attr, name: ' done ', category: won })
    expect(res.action === 'reuse' && res.status._id).toBe('s1')
  })

  it('conflicts when the category differs', () => {
    const res = resolveStatusReuse(existing, { ofAttribute: attr, name: 'DONE', category: active })
    expect(res.action).toBe('conflict')
  })

  it('prefers the same category when several match', () => {
    const list = [st('a', 'Done', active), st('b', 'Done', won)]
    const res = resolveStatusReuse(list, { ofAttribute: attr, name: 'done', category: won })
    expect(res.action === 'reuse' && res.status._id).toBe('b')
  })

  it('ignores the status being renamed', () => {
    const res = resolveStatusReuse(existing, { ofAttribute: attr, name: 'done', category: won }, 's1' as Ref<Status>)
    expect(res.action).toBe('create')
  })

  it('does not match another attribute', () => {
    const res = resolveStatusReuse(existing, { ofAttribute: otherAttr, name: 'Done', category: won })
    expect(res.action).toBe('create')
  })
})

describe('findDuplicateStatusGroups', () => {
  it('returns only groups with several statuses', () => {
    const groups = findDuplicateStatusGroups([st('1', 'Done'), st('2', 'done '), st('3', 'Todo')])
    expect([...groups.values()].map((g) => g.map((s) => s._id))).toEqual([['1', '2']])
  })
})

describe('countTasksByStatus', () => {
  it('counts per status', () => {
    const counts = countTasksByStatus([
      { status: 'a' as Ref<Status> },
      { status: 'a' as Ref<Status> },
      { status: 'b' as Ref<Status> }
    ])
    expect(counts.get('a' as Ref<Status>)).toBe(2)
    expect(counts.get('b' as Ref<Status>)).toBe(1)
  })
})

describe('isStatusOnlyInType', () => {
  const entry = (id: string): any => ({ _id: id, taskType: 't' })
  const types: any[] = [
    { _id: 'p1', statuses: [entry('s1'), entry('s2')] },
    { _id: 'p2', statuses: [entry('s2')] }
  ]

  it('is true when no other project type lists the status', () => {
    expect(isStatusOnlyInType('s1' as Ref<Status>, 'p1' as any, types)).toBe(true)
  })

  it('is false when another project type lists it', () => {
    expect(isStatusOnlyInType('s2' as Ref<Status>, 'p1' as any, types)).toBe(false)
  })
})

describe('getProjectTypeStates and getStates', () => {
  const statuses = toIdMap([st('a', 'A'), st('b', 'B'), st('lonely', 'Lonely')])
  // 'lonely' is a status of the project type that no task type lists
  const entries: any[] = [
    { _id: 'a', taskType: 't1' },
    { _id: 'a', taskType: 't2' },
    { _id: 'lonely' },
    { _id: 'b', taskType: 't1' }
  ]
  const types = toIdMap<ProjectType>([{ _id: 'pt', statuses: entries }] as any)
  const ids = (list: Status[]): string[] => list.map((it) => it._id)

  it('getProjectTypeStates lists each status once, the ones of no task type included', () => {
    expect(ids(getProjectTypeStates('pt' as Ref<ProjectType>, types, statuses))).toEqual(['a', 'lonely', 'b'])
  })

  it('getProjectTypeStates leaves the ones of no task type out on request', () => {
    expect(ids(getProjectTypeStates('pt' as Ref<ProjectType>, types, statuses, true))).toEqual(['a', 'b'])
  })

  it('getStates skips the ones of no task type', () => {
    expect(ids(getStates({ type: 'pt' } as any, types, statuses))).toEqual(['a', 'b'])
  })

  it('getStates keeps a status whose entry of no task type comes before the one with a task type', () => {
    const mixed = toIdMap<ProjectType>([{ _id: 'pt', statuses: [{ _id: 'a' }, { _id: 'a', taskType: 't1' }] }] as any)
    expect(ids(getStates({ type: 'pt' } as any, mixed, statuses))).toEqual(['a'])
  })

  it('are empty without a project or a project type', () => {
    expect(getStates(undefined, types, statuses)).toEqual([])
    expect(getStates({ type: 'missing' } as any, types, statuses)).toEqual([])
    expect(getProjectTypeStates(undefined, types, statuses)).toEqual([])
  })
})

describe('getStatusNameBlock', () => {
  const s1 = st('s1', 'Done', won)
  const types = [{ statuses: ['s1' as Ref<Status>] }, { statuses: [] }]

  it('does not block a new name', () => {
    expect(getStatusNameBlock({ action: 'create' }, types, 5)).toBeUndefined()
  })

  it('blocks another category', () => {
    expect(getStatusNameBlock({ action: 'conflict', status: s1 }, types, 0)).toBe('conflict')
  })

  it('blocks a status the task types already list', () => {
    expect(getStatusNameBlock({ action: 'reuse', status: s1 }, types, 0)).toBe('exists')
  })

  it('blocks re-pointing when tasks would move, allows it without tasks', () => {
    expect(getStatusNameBlock({ action: 'reuse', status: s1 }, [types[1]], 3)).toBe('duplicateWithTasks')
    expect(getStatusNameBlock({ action: 'reuse', status: s1 }, [types[1]], 0)).toBeUndefined()
  })
})

describe('canRenameStatusInPlace', () => {
  const own: any[] = [
    { _id: 'p1', statuses: [{ _id: 's1' }] },
    { _id: 'p2', statuses: [] }
  ]
  const user = { _id: 's1' as Ref<Status> }

  it('renames a user status used only by the project type', () => {
    expect(canRenameStatusInPlace(user, { action: 'create' }, 'p1' as any, own)).toBe(true)
  })

  it('renames an imported status even though it was created by System', () => {
    const imported = { _id: '6a75b1aee1d133917d7eeb4e' as Ref<Status>, createdBy: core.account.System }
    const types: any[] = [{ _id: 'p1', statuses: [{ _id: imported._id }] }]
    expect(canRenameStatusInPlace(imported, { action: 'create' }, 'p1' as any, types)).toBe(true)
  })

  it('does not rename a status defined by the model', () => {
    const id = 'tracker:status:Backlog' as Ref<Status>
    const types: any[] = [{ _id: 'p1', statuses: [{ _id: id }] }]
    expect(canRenameStatusInPlace({ _id: id }, { action: 'create' }, 'p1' as any, types)).toBe(false)
  })

  it('does not rename a status shared with another project type', () => {
    const shared = [...own, { _id: 'p3', statuses: [{ _id: 's1' }] }]
    expect(canRenameStatusInPlace(user, { action: 'create' }, 'p1' as any, shared)).toBe(false)
  })

  it('does not rename when another status has the name', () => {
    expect(canRenameStatusInPlace(user, { action: 'reuse', status: st('s2', 'Other') }, 'p1' as any, own)).toBe(false)
  })
})

describe('createStatusAtomic', () => {
  const type: any = { _id: 'pt', modifiedOn: 1, tasks: ['tt'], statuses: [] }
  const taskType: any = { _id: 'tt', statuses: [] }
  const data = { ofAttribute: attr, name: 'Review', category: active }
  const placement = { taskType: 'tt' as any, place: (list: any[], id: any) => [...list, id] }

  function fakeClient (
    commits: boolean[],
    statusesPerAttempt: Status[][]
  ): { client: TxOperations, ops: any[], attempts: () => number } {
    const ops: any[] = []
    let read = 0
    const client = {
      findOne: async () => type,
      findAll: async (cls: any) => {
        if (cls === 'core:class:Status') return statusesPerAttempt[Math.min(read++, statusesPerAttempt.length - 1)]
        return [taskType]
      },
      apply: () => {
        const op: any = { created: [] as string[], matches: [] as any[] }
        op.match = (_c: any, q: any) => op.matches.push(q)
        op.createDoc = async (_c: any, _s: any, d: any, id: string) => op.created.push(id)
        op.update = async () => {}
        const index = ops.length
        op.commit = async () => ({ result: commits[index] })
        ops.push(op)
        return op
      }
    } as unknown as TxOperations
    return { client, ops, attempts: () => ops.length }
  }

  const noDelay = { delay: async () => {} }

  it('checks the project type version and creates the status', async () => {
    const { client, ops } = fakeClient([true], [[]])
    const res = await createStatusAtomic(client, 'pt' as any, 'cls' as any, data, [placement], undefined, noDelay)
    expect(res.reused).toBe(false)
    expect(ops[0].created).toEqual([res.id])
    expect(ops[0].matches).toEqual([{ _id: 'pt', modifiedOn: 1 }])
  })

  it('re-resolves after a failed commit and reuses the status the other side created', async () => {
    const other = st('other', 'review', active)
    const { client, ops } = fakeClient([false, true], [[], [other]])
    const res = await createStatusAtomic(client, 'pt' as any, 'cls' as any, data, [placement], undefined, noDelay)
    expect(res).toEqual({ id: 'other', reused: true })
    expect(ops).toHaveLength(2)
    expect(ops[1].created).toEqual([])
  })

  it('gives up after the bounded number of retries', async () => {
    const { client, attempts } = fakeClient([false, false, false, false, false], [[]])
    await expect(
      createStatusAtomic(client, 'pt' as any, 'cls' as any, data, [placement], undefined, { retries: 2, ...noDelay })
    ).rejects.toMatchObject({ status: { code: task.status.StatusesChangedConcurrently } })
    expect(attempts()).toBe(3)
  })

  it('rejects a name that exists in another category with a translatable status', async () => {
    const { client } = fakeClient([true], [[st('w', 'Review', won)]])
    await expect(
      createStatusAtomic(client, 'pt' as any, 'cls' as any, data, [placement], undefined, noDelay)
    ).rejects.toMatchObject({
      status: { code: task.status.StatusExistsInOtherCategory, params: { name: 'Review' } }
    })
  })

  it('does not match the excluded status in the name rule', async () => {
    const renamed = st('s1', 'In Progress')
    const rename = { ofAttribute: attr, name: 'In progress', category: active }

    const plain = fakeClient([true], [[renamed]])
    expect(await createStatusAtomic(plain.client, 'pt' as any, 'cls' as any, rename, [placement])).toEqual({
      id: 's1',
      reused: true
    })

    const { client, ops } = fakeClient([true], [[renamed]])
    const res = await createStatusAtomic(client, 'pt' as any, 'cls' as any, rename, [placement], undefined, {
      exclude: renamed._id,
      ...noDelay
    })
    expect(res.reused).toBe(false)
    expect(ops[0].created).toEqual([res.id])
  })

  it('creates a new status for a case-only rename when the renamed one is excluded', async () => {
    const renamed = st('s1', 'In Progress')
    const rename = { ofAttribute: attr, name: 'In progress', category: active }
    const target = { placements: [placement] }

    const plain = fakeClient([true], [[renamed]])
    const items = [{ data: rename }]
    const same = await createStatusesAtomic(plain.client, 'pt' as any, 'cls' as any, items, target, noDelay)
    expect(same).toEqual([{ id: 's1', reused: true }])

    const { client, ops } = fakeClient([true], [[renamed]])
    const [res] = await createStatusesAtomic(
      client,
      'pt' as any,
      'cls' as any,
      [{ data: rename, exclude: renamed._id }],
      target,
      noDelay
    )
    expect(res.reused).toBe(false)
    expect(res.id).not.toBe('s1')
    expect(ops[0].created).toEqual([res.id])
  })
})

describe('chooseMergeTarget', () => {
  const m = (_id: string, tasks = 0, system = false, createdOn?: number): any => ({ _id, tasks, system, createdOn })

  it('prefers the most tasks', () => {
    expect(chooseMergeTarget([m('a', 1, true, 1), m('b', 5)])).toBe('b')
  })

  it('then the model-defined status', () => {
    expect(chooseMergeTarget([m('a', 2, false, 1), m('b', 2, true, 9)])).toBe('b')
  })

  it('then the oldest, a missing date counts as newest', () => {
    expect(chooseMergeTarget([m('a', 0, false, 9), m('b', 0, false, 5), m('c')])).toBe('b')
  })

  it('then the smallest id', () => {
    expect(chooseMergeTarget([m('b'), m('a')])).toBe('a')
  })
})

describe('createProjectTypeStates', () => {
  function fakeClient (
    type: any,
    known: Status[]
  ): { client: TxOperations, created: Array<{ id: string, name: string }>, ops: any[] } {
    const created: Array<{ id: string, name: string }> = []
    const ops: any[] = []
    const client = {
      findOne: async (cls: any) => (cls === 'task:class:ProjectType' ? type : undefined),
      findAll: async (cls: any) => (cls === 'core:class:Status' ? known : []),
      getModel: () => ({
        findAllSync: (_c: any, q: any) => [{ _id: q._id, defaultStatusName: q._id === won ? 'Done' : 'Active' }]
      }),
      apply: () => {
        const op: any = { entries: undefined }
        op.match = () => {}
        op.createDoc = async (_c: any, _s: any, d: any, id: string) => created.push({ id, name: d.name })
        op.update = async (_d: any, u: any) => {
          op.entries = u.statuses
        }
        op.commit = async () => ({ result: true })
        ops.push(op)
        return op
      }
    } as unknown as TxOperations
    return { client, created, ops }
  }
  const type = (statuses: any[] = []): any => ({ _id: 'pt', modifiedOn: 1, tasks: [], statuses })

  it('reuses known statuses and shares new ones inside one call', async () => {
    const { client, created, ops } = fakeClient(type([{ _id: 's1', taskType: 't' }]), [st('s1', 'Done', won)])
    const res = await createProjectTypeStates(
      client,
      'pt' as any,
      [
        { ofAttribute: attr, name: 'done', category: won },
        { ofAttribute: attr, name: 'Review', category: active },
        { ofAttribute: attr, name: 'review', category: active }
      ],
      'cls' as any,
      'new-tt' as any
    )
    expect(res[0]).toBe('s1')
    expect(res).toHaveLength(2)
    expect(created.map((it) => it.name)).toEqual(['Review'])
    // The new status and the reused one are reserved for the new task type
    expect(ops[0].entries.map((it: any) => `${it._id}:${it.taskType}`)).toEqual([
      's1:t',
      's1:new-tt',
      `${res[1]}:new-tt`
    ])
  })

  it('renames a status that exists in another category instead of duplicating the name', async () => {
    const { client, created } = fakeClient(type([{ _id: 's1', taskType: 't' }]), [st('s1', 'Closed', active)])
    await createProjectTypeStates(
      client,
      'pt' as any,
      [{ ofAttribute: attr, name: 'Closed', category: won }],
      'cls' as any,
      'new-tt' as any
    )
    expect(created.map((it) => it.name)).toEqual(['Closed (Done)'])
  })

  it('keeps the excluded status out of the name rule after the category name is appended', async () => {
    const replaced = st('s1', 'Review (Active)')
    const { client, created } = fakeClient(type([{ _id: 's1', taskType: 't' }]), [replaced, st('s2', 'Review', won)])
    const [res] = await createStatusesAtomic(
      client,
      'pt' as any,
      'cls' as any,
      [{ data: { ofAttribute: attr, name: 'Review', category: active }, exclude: replaced._id }],
      { newTaskType: 'new-tt' as any },
      { onConflict: 'rename' }
    )
    expect(res.reused).toBe(false)
    expect(created.map((it) => it.name)).toEqual(['Review (Active)'])
  })

  it('two concurrent creators of one key end with one Status', async () => {
    // A shared "database": the project type and statuses change on commit, the version check decides who wins
    const db = { type: { _id: 'pt', modifiedOn: 1, tasks: [], statuses: [] as any[] }, statuses: [] as Status[] }
    let pending: Promise<void> = Promise.resolve()
    const clientFor = (): TxOperations =>
      ({
        findOne: async () => ({ ...db.type }),
        findAll: async (cls: any) => (cls === 'core:class:Status' ? [...db.statuses] : []),
        getModel: () => ({ findAllSync: () => [] }),
        apply: () => {
          const op: any = { checks: [] as any[], docs: [] as any[], entries: undefined }
          op.match = (_c: any, q: any) => op.checks.push(q)
          op.createDoc = async (_c: any, _s: any, d: any, id: string) => op.docs.push({ ...d, _id: id })
          op.update = async (_d: any, u: any) => {
            op.entries = u.statuses
          }
          op.commit = async () => {
            // Applies of one scope run one after another
            const run = pending.then(() => {
              const ok: boolean = op.checks.every((q: any) => q.modifiedOn === db.type.modifiedOn)
              if (ok) {
                db.statuses.push(...op.docs)
                db.type = { ...db.type, modifiedOn: db.type.modifiedOn + 1, statuses: op.entries }
              }
              return { result: ok }
            })
            pending = run.then(() => {})
            return await run
          }
          return op
        }
      }) as unknown as TxOperations
    const data = { ofAttribute: attr, name: 'Review', category: active }
    const [a, b] = await Promise.all([
      createProjectTypeStates(clientFor(), 'pt' as any, [data], 'cls' as any, 'tt-a' as any),
      createProjectTypeStates(clientFor(), 'pt' as any, [data], 'cls' as any, 'tt-b' as any)
    ])
    expect(db.statuses).toHaveLength(1)
    expect(a).toEqual(b)
  })
})

describe('getStatusNameSuffixes', () => {
  const entry = (id: string): any => ({ _id: id, taskType: 't' })
  const types: any[] = [
    { _id: 'ptB', name: 'Service', statuses: [entry('b1'), entry('shared')] },
    { _id: 'ptA', name: 'Classic', statuses: [entry('a1'), entry('shared')] }
  ]
  const projects: any[] = [
    { _id: 'p1', type: 'ptA', name: 'Classic project' },
    { _id: 'p2', type: 'ptB', name: 'Internal' },
    { _id: 'p3', type: 'ptB', name: 'External' }
  ]

  it('names the project when its type has one project, else the type', () => {
    const res = getStatusNameSuffixes([st('a1', 'To Do'), st('b1', ' to do ')], types, projects)
    expect(res.get('a1' as Ref<Status>)).toBe('Classic project')
    expect(res.get('b1' as Ref<Status>)).toBe('Service')
  })

  it('leaves unique names alone', () => {
    expect(getStatusNameSuffixes([st('a1', 'To Do'), st('b1', 'Done')], types, projects).size).toBe(0)
  })

  it('takes the first project type by name for a shared status', () => {
    const res = getStatusNameSuffixes([st('shared', 'To Do'), st('b1', 'To Do')], types, projects)
    expect(res.get('shared' as Ref<Status>)).toBe('Classic project')
  })

  it('skips statuses of no project type and the same status listed twice', () => {
    expect(getStatusNameSuffixes([st('x', 'To Do'), st('a1', 'To Do')], types, projects).has('x' as Ref<Status>)).toBe(
      false
    )
    expect(getStatusNameSuffixes([st('a1', 'To Do'), st('a1', 'To Do')], types, projects).size).toBe(0)
  })
})

describe('getExistingStatusOptions', () => {
  const order = [active, won] as any[]

  it('offers statuses of other task types grouped by category order', () => {
    const type = [st('a', 'Todo'), st('b', 'Closed', won), st('c', 'Review')]
    const res = getExistingStatusOptions(type, [st('a', 'Todo')], order)
    expect(res.map((g) => [g.category, g.statuses.map((s) => s._id)])).toEqual([
      [active, ['c']],
      [won, ['b']]
    ])
  })

  it('does not offer a status whose name the task type already has', () => {
    const type = [st('a', 'Todo'), st('a2', ' todo ')]
    expect(getExistingStatusOptions(type, [st('a', 'Todo')], order)).toEqual([])
  })

  it('lists a status once and puts unknown categories last', () => {
    const type = [st('x', 'X', 'unknown' as any), st('y', 'Y'), st('y', 'Y')]
    const res = getExistingStatusOptions(type, [], order)
    expect(res.map((g) => g.statuses.map((s) => s._id))).toEqual([['y'], ['x']])
  })
})

describe('getStatusNameSuffixes with task types', () => {
  const entry = (id: string): any => ({ _id: id, taskType: 't' })
  const types: any[] = [
    { _id: 'ptB', name: 'Service', statuses: [entry('b1')] },
    { _id: 'ptA', name: 'Classic', statuses: [entry('a1')] }
  ]
  const projects: any[] = [
    { _id: 'p1', type: 'ptA', name: 'Classic project' },
    { _id: 'p2', type: 'ptB', name: 'Internal' }
  ]

  it('uses task type names when the statuses come from one project type', () => {
    const sameType: any[] = [{ _id: 'ptA', name: 'Classic', statuses: [entry('d1'), entry('d2'), entry('d3')] }]
    const taskTypes: any[] = [
      { _id: 'tt1', name: 'Task', parent: 'ptA', statuses: ['d1'] },
      { _id: 'tt2', name: 'Bug', parent: 'ptA', statuses: ['d2'] },
      { _id: 'tt3', name: 'Story', parent: 'ptA', statuses: ['d3'] }
    ]
    const res = getStatusNameSuffixes(
      [st('d1', 'Done'), st('d2', 'Done'), st('d3', 'Done')],
      sameType,
      [{ _id: 'p1', type: 'ptA', name: 'Demo' }] as any[],
      taskTypes
    )
    expect([...res.values()]).toEqual(['Task', 'Bug', 'Story'])
  })

  it('keeps the project label for statuses of different projects', () => {
    const taskTypes: any[] = [{ _id: 'tt1', name: 'Task', parent: 'ptA', statuses: ['a1'] }]
    const res = getStatusNameSuffixes([st('a1', 'Done'), st('b1', 'Done')], types, projects, taskTypes)
    expect(res.get('a1' as Ref<Status>)).toBe('Classic project')
    expect(res.get('b1' as Ref<Status>)).toBe('Internal')
  })

  it('mixes: a clashing pair gets task types, the lone status keeps its project', () => {
    const mixed: any[] = [
      { _id: 'ptA', name: 'Classic', statuses: [entry('a1')] },
      { _id: 'ptB', name: 'Service', statuses: [entry('b1'), entry('b2')] }
    ]
    const taskTypes: any[] = [
      { _id: 't1', name: 'Bug', parent: 'ptB', statuses: ['b1'] },
      { _id: 't2', name: 'Task', parent: 'ptB', statuses: ['b2'] }
    ]
    const res = getStatusNameSuffixes(
      [st('a1', 'Done'), st('b1', 'Done'), st('b2', 'Done')],
      mixed,
      [
        { _id: 'p1', type: 'ptA', name: 'Alpha' },
        { _id: 'p2', type: 'ptB', name: 'Beta' },
        { _id: 'p3', type: 'ptB', name: 'Gamma' }
      ] as any[],
      taskTypes
    )
    expect(res.get('a1' as Ref<Status>)).toBe('Alpha')
    expect(res.get('b1' as Ref<Status>)).toBe('Bug')
    expect(res.get('b2' as Ref<Status>)).toBe('Task')
  })
})

describe('placeStatusAfter', () => {
  const ids = (list: string[]): Array<Ref<Status>> => list as Array<Ref<Status>>
  const place = (list: string[], after: string, id: string): string[] =>
    placeStatusAfter(ids(list), after as Ref<Status>, id as Ref<Status>)

  it('puts the status right after the one it follows, which stays', () => {
    expect(place(['a', 'old', 'b'], 'old', 'new')).toEqual(['a', 'old', 'new', 'b'])
    expect(place(['old'], 'old', 'new')).toEqual(['old', 'new'])
  })

  it('moves a status that is listed already instead of duplicating it', () => {
    expect(place(['new', 'a', 'old', 'b'], 'old', 'new')).toEqual(['a', 'old', 'new', 'b'])
    expect(place(['a', 'old', 'new'], 'old', 'new')).toEqual(['a', 'old', 'new'])
  })

  it('appends when the status to follow is not listed', () => {
    expect(place(['a', 'b'], 'old', 'new')).toEqual(['a', 'b', 'new'])
  })

  it('does not change the given list', () => {
    const list = ids(['a', 'old'])
    placeStatusAfter(list, 'old' as Ref<Status>, 'new' as Ref<Status>)
    expect(list).toEqual(['a', 'old'])
  })
})

describe('getStatusErrorText', () => {
  beforeAll(() => {
    addStringsLoader('task' as any, async () => ({
      status: { StatusExistsInOtherCategory: 'Status "{name}" exists in another category' }
    }))
  })

  it('translates a platform error by its status code and params', async () => {
    const err = new PlatformError(
      new PlatformStatus(Severity.ERROR, task.status.StatusExistsInOtherCategory, { name: 'Review' })
    )
    expect(await getStatusErrorText(err)).toBe('Status "Review" exists in another category')
  })

  it('gives the message of any other error', async () => {
    expect(await getStatusErrorText(new Error('boom'))).toBe('boom')
    expect(await getStatusErrorText('plain')).toBe('plain')
  })
})
