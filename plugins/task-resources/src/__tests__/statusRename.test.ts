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

import core, { type TxOperations } from '@hcengineering/core'
import task, { type MergeStatusesResult, type StatusUsageResult } from '@hcengineering/task'
import workflow from '@hcengineering/workflow'
import { renameStatusByMerge, type StatusRename, type StatusRequests } from '../statusRename'

// The real module is a Svelte package that jest cannot load
jest.mock('@hcengineering/presentation', () => ({ getClient: jest.fn() }))

const attr = 'attr'
const active = 'active'

interface State {
  type: any
  taskTypes: any[]
  statuses: any[]
  workflows: any[]
  transitions: any[]
}

// In-memory stand-in for the part of TxOperations the rename uses
function fakeClient (state: State): TxOperations {
  const pick = (list: any[], ids: string[] | undefined): any[] => list.filter((it) => ids?.includes(it._id) ?? true)
  return {
    findOne: async (_class: string, query: any) =>
      _class === task.class.ProjectType ? state.type : state.statuses.find((it) => it._id === query._id),
    findAll: async (_class: string, query: any) => {
      if (_class === core.class.Status) return pick(state.statuses, query._id?.$in)
      if (_class === task.class.TaskType) return pick(state.taskTypes, query._id.$in)
      if (_class === workflow.class.Workflow) {
        return state.workflows.filter((it) => it.projectType === query.projectType)
      }
      return state.transitions.filter((it) => (query.attachedTo.$in as string[]).includes(it.attachedTo))
    },
    update: async (doc: any, ops: any) => {
      Object.assign(doc, ops)
    },
    remove: async (doc: any) => {
      state.statuses = state.statuses.filter((it) => it._id !== doc._id)
    },
    apply: () => {
      const created: any[] = []
      const updates: Array<[any, any]> = []
      const op: any = {
        match: () => {},
        createDoc: async (_c: any, _s: any, data: any, id: string) => created.push({ ...data, _id: id }),
        update: async (doc: any, ops: any) => updates.push([doc, ops]),
        commit: async () => {
          state.statuses.push(...created)
          for (const [doc, ops] of updates) Object.assign(doc, ops)
          return { result: true }
        }
      }
      return op
    }
  } as unknown as TxOperations
}

const entry = (id: string, taskType: string, extra: object = {}): any => ({ _id: id, taskType, ...extra })
const status = (id: string, name: string): any => ({ _id: id, name, ofAttribute: attr, category: active })

function base (): State {
  return {
    type: {
      _id: 'pt',
      modifiedOn: 1,
      tasks: ['tt1', 'tt2'],
      statuses: [
        entry('a', 'tt1'),
        entry('old', 'tt1', { color: 3 }),
        entry('b', 'tt1'),
        entry('old', 'tt2', { color: 3 })
      ]
    },
    taskTypes: [
      { _id: 'tt1', statuses: ['a', 'old', 'b'] },
      { _id: 'tt2', statuses: ['old'] }
    ],
    statuses: [status('a', 'A'), status('old', 'In Progress'), status('b', 'B')],
    workflows: [{ _id: 'w1', projectType: 'pt', taskType: 'tt1', name: 'w1' }],
    transitions: []
  }
}

const unused: StatusUsageResult = { tasks: 0, byKind: {}, projects: 0 }
const refused = (message = 'refused'): MergeStatusesResult => ({
  ok: false,
  merged: [],
  tasksMoved: 0,
  removed: [],
  kept: [],
  conflicts: [{ kind: 'conflict', message }]
})
const accepted: MergeStatusesResult = { ok: true, merged: [], tasksMoved: 0, removed: [], kept: [], conflicts: [] }

function rename (name: string, taskTypes: string[] = ['tt1']): StatusRename {
  return {
    type: 'pt' as any,
    status: 'old' as any,
    statusClass: core.class.Status,
    data: { ofAttribute: attr as any, name, category: active as any },
    taskTypes: taskTypes as any
  }
}

function requests (
  merge: (state: State) => MergeStatusesResult,
  state: State,
  usage: () => Promise<StatusUsageResult> = async () => unused
): StatusRequests & { calls: any[] } {
  const calls: any[] = []
  return {
    calls,
    merge: async (params) => {
      calls.push(params)
      return merge(state)
    },
    usage
  }
}

const listOf = (state: State, id: string): string[] => state.taskTypes.find((it) => it._id === id).statuses
const entryKeys = (state: State): string[] => state.type.statuses.map((it: any) => `${it._id}:${it.taskType}`)

describe('renameStatusByMerge', () => {
  it('puts a new status right after the old one in the task types and merges the old one into it', async () => {
    const state = base()
    const req = requests(() => accepted, state)
    const res = await renameStatusByMerge(fakeClient(state), req, rename('In progress'))

    expect(res.ok).toBe(true)
    const id = res.ok ? res.id : ''
    expect(id).not.toBe('old')
    expect(state.statuses.find((it) => it._id === id)?.name).toBe('In progress')
    expect(listOf(state, 'tt1')).toEqual(['a', 'old', id, 'b'])
    expect(listOf(state, 'tt2')).toEqual(['old'])
    expect(entryKeys(state)).toContain(`${id}:tt1`)
    expect(entryKeys(state)).not.toContain(`${id}:tt2`)
    expect(req.calls).toEqual([{ projectType: 'pt', target: id, sources: ['old'], taskTypes: ['tt1'] }])
  })

  it('scopes the merge to every given task type', async () => {
    const state = base()
    const req = requests(() => accepted, state)
    await renameStatusByMerge(fakeClient(state), req, rename('Doing', ['tt1', 'tt2']))
    expect(req.calls[0].taskTypes).toEqual(['tt1', 'tt2'])
    expect(listOf(state, 'tt2')).toHaveLength(2)
  })

  it('takes the new status out again when the merge is refused and nothing was written', async () => {
    const state = base()
    const req = requests(() => refused(), state)
    const res = await renameStatusByMerge(fakeClient(state), req, rename('In progress'))

    expect(res).toEqual({ ok: false, conflicts: [{ kind: 'conflict', message: 'refused' }] })
    expect(listOf(state, 'tt1')).toEqual(['a', 'old', 'b'])
    expect(entryKeys(state)).toEqual(['a:tt1', 'old:tt1', 'b:tt1', 'old:tt2'])
    expect(state.statuses.map((it) => it._id)).toEqual(['a', 'old', 'b'])
  })

  it('keeps a reused status and the project type entry it had', async () => {
    const state = base()
    state.statuses.push(status('review', 'Review'))
    state.type.statuses.push({ _id: 'review', color: 5 })
    const req = requests(() => refused(), state)
    const res = await renameStatusByMerge(fakeClient(state), req, rename('review'))

    expect(res.ok).toBe(false)
    expect(req.calls).toHaveLength(1)
    expect(listOf(state, 'tt1')).toEqual(['a', 'old', 'b'])
    expect(state.statuses.some((it) => it._id === 'review')).toBe(true)
    expect(state.type.statuses.filter((it: any) => it._id === 'review')).toEqual([{ _id: 'review', color: 5 }])
  })

  it('undoes the placement of a reused status whose tasks sit in other task types only', async () => {
    const state = base()
    state.statuses.push(status('review', 'Review'))
    state.taskTypes[1].statuses.push('review')
    state.type.statuses.push(entry('review', 'tt2', { color: 5 }))
    const usage = async (): Promise<StatusUsageResult> => ({ tasks: 3, byKind: { tt1: 0, tt2: 3 }, projects: 0 })
    const res = await renameStatusByMerge(
      fakeClient(state),
      requests(() => refused(), state, usage),
      rename('review')
    )

    expect(res.ok).toBe(false)
    expect(listOf(state, 'tt1')).toEqual(['a', 'old', 'b'])
    expect(listOf(state, 'tt2')).toEqual(['old', 'review'])
    expect(entryKeys(state)).toEqual(['a:tt1', 'old:tt1', 'b:tt1', 'old:tt2', 'review:tt2'])
    expect(state.statuses.some((it) => it._id === 'review')).toBe(true)
  })

  it('leaves the placement when the failed merge already used the new status', async () => {
    const used = async (check: (state: State) => void): Promise<State> => {
      const state = base()
      const req = requests((s) => {
        check(s)
        return refused()
      }, state)
      await renameStatusByMerge(fakeClient(state), req, rename('In progress'))
      return state
    }
    const newId = (state: State): string => listOf(state, 'tt1')[2]

    // a transition of the workflow now leads to the new status
    const byTransition = await used((s) => {
      s.transitions.push({ _id: 'tr', attachedTo: 'w1', from: ['a'], to: listOf(s, 'tt1')[2] })
    })
    expect(listOf(byTransition, 'tt1')).toContain(newId(byTransition))

    // a subtask rule lists it
    const byRule = await used((s) => {
      const rule = {
        id: 'v',
        rule: workflow.validator.SubtaskStatus,
        props: { statuses: { tt1: [listOf(s, 'tt1')[2]] } }
      }
      s.transitions.push({ _id: 'tr', attachedTo: 'w1', from: ['a'], to: 'b', validators: [rule] })
    })
    expect(listOf(byRule, 'tt1')).toHaveLength(4)

    // the old status already left the task type
    const byLists = await used((s) => {
      s.taskTypes[0].statuses = s.taskTypes[0].statuses.filter((it: string) => it !== 'old')
    })
    expect(listOf(byLists, 'tt1')).toHaveLength(3)
    expect(byLists.statuses).toHaveLength(4)
  })

  it('leaves the placement when tasks or project defaults use the new status, or the count fails', async () => {
    for (const usage of [
      async () => ({ ...unused, tasks: 2, byKind: { tt1: 2 } }),
      async () => ({ ...unused, projects: 1 }),
      async () => await Promise.reject(new Error('no answer'))
    ]) {
      const state = base()
      const res = await renameStatusByMerge(
        fakeClient(state),
        requests(() => refused(), state, usage),
        rename('Doing')
      )
      expect(res.ok).toBe(false)
      expect(listOf(state, 'tt1')).toHaveLength(4)
      expect(state.statuses).toHaveLength(4)
    }
  })

  it('creates a new status for a case-only rename instead of resolving to the renamed one', async () => {
    const state = base()
    const res = await renameStatusByMerge(
      fakeClient(state),
      requests(() => accepted, state),
      rename('in progress')
    )
    expect(res.ok && res.id).not.toBe('old')
    expect(state.statuses).toHaveLength(4)
  })
})
