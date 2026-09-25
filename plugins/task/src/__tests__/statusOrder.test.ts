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
import { getOrderedTaskTypes, getStatusCategoryOrder, mergeStatusOrder, statusOrderComparator } from '../utils'

const { UnStarted, ToDo, Active, Won, Lost } = task.statusCategory

function status (id: string, name: string, category: Ref<StatusCategory> | undefined): Status {
  return { _id: id as Ref<Status>, name, category } as any as Status
}

function taskType (id: string, name: string, statuses: string[]): TaskType {
  return { _id: id as Ref<TaskType>, name, statuses: statuses as Array<Ref<Status>> } as any as TaskType
}

// RAIDRUSH-like setup: Issue was created before Epic, so `type.tasks` lists it first,
// while the settings screen shows Epic first (sorted by name).
const epic = taskType('epic', 'Epic', ['epic-backlog', 'epic-todo', 'focus', 'epic-done', 'epic-canceled'])
const issue = taskType('issue', 'Issue', [
  'issue-backlog',
  'inbox',
  'reopen',
  'todo',
  'in-progress',
  'ready-for-test',
  'in-review',
  'approved',
  'issue-done',
  'issue-canceled'
])
const projectType = { _id: 'pt', tasks: [issue._id, epic._id] } as any as ProjectType
const taskTypes: IdMap<TaskType> = new Map([
  [issue._id, issue],
  [epic._id, epic]
])

const statuses: IdMap<Status> = new Map(
  [
    status('epic-backlog', 'Backlog', UnStarted),
    status('epic-todo', '(not used) Todo', ToDo),
    status('focus', 'Focus', Active),
    status('epic-done', 'Done', Won),
    status('epic-canceled', 'Canceled', Lost),
    status('issue-backlog', 'Backlog', UnStarted),
    status('inbox', 'Inbox', ToDo),
    status('reopen', 'Reopen', ToDo),
    status('todo', 'Todo', ToDo),
    status('in-progress', 'In Progress', Active),
    status('ready-for-test', 'Ready for test', Active),
    status('in-review', 'In Review', Active),
    status('approved', 'Approved', Active),
    status('issue-done', 'Done', Won),
    status('issue-canceled', 'Canceled', Lost),
    status('foreign', 'Foreign', Active),
    status('foreign-2', 'Another foreign', Active),
    status('no-category', 'No category', undefined)
  ].map((s) => [s._id, s])
)

const listOrder = [Active, ToDo, UnStarted, Won, Lost]

function sort (
  ids: string[],
  order: ReadonlyArray<Ref<StatusCategory>> = listOrder,
  types = getOrderedTaskTypes(projectType, taskTypes)
): string[] {
  return [...(ids as Array<Ref<Status>>)].sort(statusOrderComparator(order, types, statuses))
}

describe('getOrderedTaskTypes', () => {
  it('orders task types by name, as the settings screen does, not by ProjectType.tasks', () => {
    expect(getOrderedTaskTypes(projectType, taskTypes).map((t) => t._id)).toEqual(['epic', 'issue'])
  })

  it('skips unknown task types and tolerates a missing project type', () => {
    const pt = { _id: 'pt2', tasks: ['missing', issue._id] } as any as ProjectType
    expect(getOrderedTaskTypes(pt, taskTypes)).toEqual([issue])
    expect(getOrderedTaskTypes(undefined, taskTypes)).toEqual([])
  })
})

describe('mergeStatusOrder', () => {
  it('ranks the statuses of the first task type before the ones only the second has', () => {
    const rank = mergeStatusOrder(getOrderedTaskTypes(projectType, taskTypes))
    expect([...rank.keys()].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))).toEqual([
      ...epic.statuses,
      ...issue.statuses
    ])
  })
})

describe('statusOrderComparator', () => {
  it('groups by category first, then by task type, then by position inside the task type', () => {
    const shuffled = [
      'in-progress',
      'ready-for-test',
      'in-review',
      'focus',
      'inbox',
      'reopen',
      'todo',
      'issue-backlog',
      'epic-backlog',
      'issue-done',
      'epic-done',
      'issue-canceled',
      'approved',
      'epic-todo'
    ]
    expect(sort(shuffled)).toEqual([
      'focus',
      'in-progress',
      'ready-for-test',
      'in-review',
      'approved',
      'epic-todo',
      'inbox',
      'reopen',
      'todo',
      'epic-backlog',
      'issue-backlog',
      'epic-done',
      'issue-done',
      'issue-canceled'
    ])
  })

  it('respects the given category order (kanban / settings order)', () => {
    expect(sort(['focus', 'todo', 'issue-backlog', 'issue-done', 'issue-canceled'], getStatusCategoryOrder())).toEqual([
      'issue-backlog',
      'todo',
      'focus',
      'issue-done',
      'issue-canceled'
    ])
  })

  it('puts a selected task type first when it leads the ordered list', () => {
    expect(sort(['focus', 'in-progress'], listOrder, [issue, epic])).toEqual(['in-progress', 'focus'])
  })

  it('places statuses outside the task types after known ones, by name, and unknown categories last', () => {
    expect(sort(['no-category', 'foreign', 'in-progress', 'focus'])).toEqual([
      'focus',
      'in-progress',
      'foreign',
      'no-category'
    ])
    expect(sort(['foreign', 'foreign-2', 'in-progress'])).toEqual(['in-progress', 'foreign-2', 'foreign'])
  })

  it('keeps the order of every task type for a shared status', () => {
    const shared = taskType('shared', 'Aaa shared', ['in-progress', 'focus'])
    expect(sort(['in-progress', 'focus'], listOrder, [shared, epic, issue])).toEqual(['in-progress', 'focus'])
  })

  it('lets a later task type push a shared status after its own predecessors (Classic project)', () => {
    // Feature, Issue and Task share Backlog/Todo/In Progress/Canceled. Feature lists In Progress first among
    // active statuses, Issue lists On Hold before it: On Hold goes first, as Issue's settings show.
    const feature = taskType('feature', 'Feature', ['backlog', 'todo', 'in-progress', 'good', 'complete', 'canceled'])
    const classicIssue = taskType('c-issue', 'Issue', [
      'backlog',
      'clarify',
      'todo',
      'on-hold',
      'in-progress',
      'implemented',
      'under-review',
      'merged',
      'deployed',
      'canceled',
      'duplicate'
    ])
    const classicTask = taskType('c-task', 'Task', ['backlog', 'todo', 'new-state', 'won', 'lost'])
    const classic: IdMap<Status> = new Map(
      [
        status('backlog', 'Backlog', UnStarted),
        status('clarify', 'Clarify', UnStarted),
        status('todo', 'Todo', ToDo),
        status('in-progress', 'In Progress', Active),
        status('good', 'Good', Active),
        status('on-hold', 'On Hold', Active),
        status('implemented', 'Implemented', Active),
        status('under-review', 'Under review', Active),
        status('new-state', 'New state', Active),
        status('complete', 'Complete', Won),
        status('merged', 'Merged', Won),
        status('deployed', 'Deployed', Won),
        status('won', 'Won', Won),
        status('canceled', 'Canceled', Lost),
        status('duplicate', 'Duplicate', Lost),
        status('lost', 'Lost', Lost)
      ].map((s) => [s._id, s])
    )
    const ids = [...classic.keys()].reverse()
    const sorted = ids.sort(statusOrderComparator(listOrder, [feature, classicIssue, classicTask], classic))
    expect(sorted).toEqual([
      'on-hold',
      'in-progress',
      'good',
      'implemented',
      'under-review',
      'new-state',
      'todo',
      'backlog',
      'clarify',
      'complete',
      'merged',
      'deployed',
      'won',
      'canceled',
      'duplicate',
      'lost'
    ])
  })

  it('falls back to task type order when task types disagree on the order', () => {
    const first = taskType('first', 'A', ['s-a', 's-b'])
    const second = taskType('second', 'B', ['s-b', 's-a'])
    const pair: IdMap<Status> = new Map([
      ['s-a' as Ref<Status>, status('s-a', 'A', Active)],
      ['s-b' as Ref<Status>, status('s-b', 'B', Active)]
    ])
    const cmp = statusOrderComparator(listOrder, [first, second], pair)
    expect((['s-b', 's-a'] as Array<Ref<Status>>).sort(cmp)).toEqual(['s-a', 's-b'])
  })
})
