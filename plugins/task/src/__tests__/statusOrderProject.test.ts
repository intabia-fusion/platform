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

import { type IdMap, type Ref, type Status } from '@hcengineering/core'

import task, { type ProjectType, type TaskType } from '../index'
import {
  calculateStatuses,
  getOrphanStatuses,
  getProjectStatusRank,
  getStatusIconPosition,
  statusOrderComparator
} from '../utils'

const ref = (id: string): Ref<Status> => id as Ref<Status>
const tt = (id: string, statuses: string[]): TaskType => ({ _id: id, name: id, statuses }) as any as TaskType
const taskTypes: IdMap<TaskType> = new Map([
  ['a', tt('a', ['todo', 'review', 'done'])],
  ['b', tt('b', ['todo', 'done'])]
] as any)

describe('calculateStatuses', () => {
  const tasks = ['a', 'b'] as any as ProjectType['tasks']

  it('keeps an entry without a task type for a status no task type uses', () => {
    const res = calculateStatuses({ statuses: [{ _id: ref('free'), color: 3 }], tasks }, taskTypes as any, [])
    expect(res.find((it) => it._id === 'free')).toEqual({ _id: 'free', color: 3 })
    expect(res.filter((it) => it.taskType === undefined)).toHaveLength(1)
  })

  it('has no entry without a task type for a status that is in a task type', () => {
    const res = calculateStatuses({ statuses: [{ _id: ref('todo') }], tasks }, taskTypes as any, [])
    expect(res.filter((it) => it._id === 'todo').map((it) => it.taskType)).toEqual(['a', 'b'])
  })

  it('moves a status that leaves its last task type to an entry without a task type', () => {
    const type = {
      statuses: [
        { _id: ref('review'), taskType: 'a' as any, color: 5 },
        { _id: ref('todo'), taskType: 'a' as any }
      ],
      tasks
    }
    const res = calculateStatuses(type, taskTypes as any, [{ taskTypeId: 'a' as any, statuses: [ref('todo')] }])
    expect(res.find((it) => it._id === 'review')).toEqual({ _id: 'review', color: 5 })
    expect(res.find((it) => it._id === 'todo' && it.taskType === 'a')).toBeDefined()
  })
})

describe('getProjectStatusRank', () => {
  const type = (statusOrder?: string[]): ProjectType =>
    ({
      _id: 'pt',
      name: 'PT',
      tasks: ['a', 'b'],
      statuses: [ref('todo'), ref('review'), ref('done'), ref('free')].map((_id) => ({ _id })),
      ...(statusOrder !== undefined ? { statusOrder } : {})
    }) as any as ProjectType
  const order = (rank: Map<Ref<Status>, number>): string[] => [...rank].sort((x, y) => x[1] - y[1]).map(([id]) => id)

  it('is the merged task type order without statusOrder, statuses of no task type are not ranked', () => {
    expect(order(getProjectStatusRank([type()], taskTypes))).toEqual(['todo', 'review', 'done'])
  })

  it('puts statusOrder first and the rest after it in merged order', () => {
    expect(order(getProjectStatusRank([type(['done', 'free'])], taskTypes))).toEqual(['done', 'free', 'todo', 'review'])
  })

  it('counts a status listed twice in statusOrder once', () => {
    const rank = getProjectStatusRank([type(['review', 'review', 'todo'])], taskTypes)
    expect(order(rank)).toEqual(['review', 'todo', 'done', 'free'])
  })

  it('drives the icon position and the comparator', () => {
    const statuses: IdMap<Status> = new Map(
      ['todo', 'review', 'done', 'free'].map((id) => [
        ref(id),
        { _id: ref(id), name: id, category: task.statusCategory.Active }
      ])
    ) as any
    const pt = type(['review', 'done', 'todo'])
    expect(getStatusIconPosition(pt, taskTypes, statuses, ref('review')).index).toBe(1)
    expect(getStatusIconPosition(pt, taskTypes, statuses, ref('todo')).index).toBe(3)
    const cmp = statusOrderComparator([task.statusCategory.Active], [], statuses, getProjectStatusRank([pt], taskTypes))
    expect(['todo', 'done', 'review'].map(ref).sort(cmp)).toEqual(['review', 'done', 'todo'])
  })
})

describe('getOrphanStatuses', () => {
  it('returns statuses of the attributes that no project type and no task type lists', () => {
    const st = (id: string, ofAttribute: string): Status => ({ _id: ref(id), ofAttribute }) as any as Status
    const res = getOrphanStatuses(
      [st('in-type', 'attr'), st('in-task-type', 'attr'), st('orphan', 'attr'), st('other', 'other')],
      [{ statuses: [{ _id: ref('in-type') }] }],
      [{ statuses: [ref('in-task-type')] }],
      new Set(['attr' as any])
    )
    expect(res.map((it) => it._id)).toEqual(['orphan'])
  })
})
