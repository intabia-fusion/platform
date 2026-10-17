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

import { type IdMap, type Ref, type Status, type StatusCategory } from '@hcengineering/core'

import task, { type ProjectType, type TaskType } from '../index'
import {
  getOrderedTaskTypes,
  getSingleQueryKind,
  getSingleStatusTaskType,
  getStatusCategoryOrder,
  getStatusIconPosition,
  getStatusOrderTaskTypes,
  getTaskTypeStatusIconPosition,
  statusOrderComparator
} from '../utils'

const { Active, Won } = task.statusCategory

const st = (id: string, category: Ref<StatusCategory> | undefined = Active): Status =>
  ({ _id: id as Ref<Status>, name: id, category }) as any as Status
const tt = (id: string, name: string, statuses: string[]): TaskType => ({ _id: id, name, statuses }) as any as TaskType
const ref = (id: string): Ref<Status> => id as Ref<Status>

const statuses: IdMap<Status> = new Map(
  [st('todo'), st('review'), st('done'), st('x'), st('closed', Won)].map((s) => [s._id, s])
)

// A: Todo, Review, Done. B: Todo, Done, Review. ProjectType.statuses has an entry per (status, task type).
const a = tt('a', 'A', ['todo', 'review', 'done'])
const b = tt('b', 'B', ['todo', 'done', 'review'])
const taskTypes: IdMap<TaskType> = new Map([
  [a._id, a],
  [b._id, b]
])
const entries = [a, b].flatMap((t) => t.statuses.map((s) => ({ _id: ref(s), taskType: t._id })))
entries.push({ _id: ref('closed'), taskType: a._id })
const type = { _id: 'pt', name: 'PT', tasks: [b._id, a._id], statuses: entries } as any as ProjectType

describe('getStatusIconPosition', () => {
  it('gives a shared status one position regardless of task type', () => {
    // Task types are ordered by name, so A decides: todo, review, done
    expect(getStatusIconPosition(type, taskTypes, statuses, ref('todo'))).toEqual({ index: 1, count: 4 })
    expect(getStatusIconPosition(type, taskTypes, statuses, ref('review'))).toEqual({ index: 2, count: 4 })
    expect(getStatusIconPosition(type, taskTypes, statuses, ref('done'))).toEqual({ index: 3, count: 4 })
  })

  it('counts unique statuses of the category only', () => {
    expect(getStatusIconPosition(type, taskTypes, statuses, ref('closed'))).toEqual({ index: 1, count: 2 })
  })

  it('puts statuses outside every task type after, in ProjectType.statuses order', () => {
    const t = { ...type, statuses: [...entries, { _id: ref('x'), taskType: 'a' }] } as any as ProjectType
    expect(getStatusIconPosition(t, taskTypes, statuses, ref('x'))).toEqual({ index: 4, count: 5 })
  })

  it('returns index 0 for a status missing from the project type', () => {
    expect(getStatusIconPosition(type, taskTypes, statuses, ref('x'))).toEqual({ index: 0, count: 4 })
    expect(getStatusIconPosition(undefined, taskTypes, statuses, ref('todo'))).toEqual({ index: 0, count: 1 })
    expect(getStatusIconPosition(type, taskTypes, statuses, ref('unknown'))).toEqual({ index: 0, count: 1 })
  })

  it('matches the order of the grouped list', () => {
    const sorted = [ref('done'), ref('todo'), ref('review')].sort(
      statusOrderComparator(getStatusCategoryOrder(), getOrderedTaskTypes(type, taskTypes), statuses)
    )
    const byIcon = [...sorted].sort(
      (p, q) =>
        getStatusIconPosition(type, taskTypes, statuses, p).index -
        getStatusIconPosition(type, taskTypes, statuses, q).index
    )
    expect(sorted).toEqual(['todo', 'review', 'done'])
    expect(byIcon).toEqual(sorted)
  })
})

describe('getStatusOrderTaskTypes', () => {
  it('orders project types by name, task types by name, without duplicates', () => {
    const other = { _id: 'p0', name: 'Alpha', tasks: ['c'], statuses: [] } as any as ProjectType
    const c = tt('c', 'Z', ['x'])
    const all: IdMap<TaskType> = new Map([...taskTypes, ['c' as Ref<TaskType>, c]])
    expect(getStatusOrderTaskTypes([type, other, type], all).map((it) => it._id)).toEqual(['c', 'a', 'b'])
  })
})

describe('getTaskTypeStatusIconPosition', () => {
  it('uses the order of the task type itself', () => {
    expect(getTaskTypeStatusIconPosition(b, statuses, ref('done'))).toEqual({ index: 2, count: 4 })
    expect(getTaskTypeStatusIconPosition(b, statuses, ref('review'))).toEqual({ index: 3, count: 4 })
  })

  it('counts statuses of the category only', () => {
    const t = tt('t', 'T', ['todo', 'closed', 'done'])
    expect(getTaskTypeStatusIconPosition(t, statuses, ref('closed'))).toEqual({ index: 1, count: 2 })
    expect(getTaskTypeStatusIconPosition(t, statuses, ref('done'))).toEqual({ index: 2, count: 3 })
  })

  it('is undefined for a status the task type does not list', () => {
    expect(getTaskTypeStatusIconPosition(a, statuses, ref('x'))).toBeUndefined()
    expect(getTaskTypeStatusIconPosition(undefined, statuses, ref('todo'))).toBeUndefined()
  })
})

describe('getSingleQueryKind', () => {
  it('accepts a ref or $in with one value only', () => {
    expect(getSingleQueryKind('a')).toBe('a')
    expect(getSingleQueryKind({ $in: ['a'] })).toBe('a')
    expect(getSingleQueryKind({ $in: ['a', 'b'] })).toBeUndefined()
    expect(getSingleQueryKind({ $nin: ['a'] })).toBeUndefined()
    expect(getSingleQueryKind(undefined)).toBeUndefined()
  })
})

describe('getSingleStatusTaskType', () => {
  const only = tt('only', 'Only', ['x'])
  const types: IdMap<TaskType> = new Map([...taskTypes, [only._id, only]])

  it('takes the only task type of the project type', () => {
    const one = { tasks: [only._id] } as any as ProjectType
    expect(getSingleStatusTaskType(one, types, [ref('todo')])).toBe('only')
  })

  it('finds the one task type listing the statuses', () => {
    const many = { tasks: [a._id, b._id, only._id] } as any as ProjectType
    expect(getSingleStatusTaskType(many, types, [ref('x')])).toBe('only')
    expect(getSingleStatusTaskType(many, types, [ref('todo')])).toBeUndefined()
    expect(getSingleStatusTaskType(many, types, [])).toBeUndefined()
  })
})
