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

import type { Employee } from '@hcengineering/contact'
import type { AccountUuid, Ref, Role } from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'
import type { Component, Issue, IssueStatus, IssueTemplate, Milestone } from '@hcengineering/tracker'
import type { Workflow } from '@hcengineering/workflow'
import {
  type BaseSettings,
  copyTemplate,
  defaultCopyOptions,
  keepAssignee,
  selectionState,
  settingsFromBase,
  translateRef
} from '../projectCopyLogic'

const acc = (id: string): AccountUuid => id as AccountUuid
const me = acc('me')
const role = 'r1' as Ref<Role>

const base: BaseSettings = {
  members: [acc('a'), acc('b')],
  owners: [acc('a')],
  assignment: { [role]: [acc('b')] },
  isPrivate: true,
  defaultAssignee: 'emp-b' as Ref<Employee>,
  defaultStatus: 'todo' as Ref<IssueStatus>,
  workflows: { ['task' as Ref<TaskType>]: 'wf' as Ref<Workflow> }
}

describe('settingsFromBase', () => {
  it('takes the checked groups and keeps the creator a member and an owner', () => {
    const res = settingsFromBase(base, defaultCopyOptions([]), me)
    expect(res.owners).toEqual(['me', 'a'])
    expect(res.members).toEqual(['me', 'a', 'b'])
    expect(res.assignment).toEqual(base.assignment)
    expect(res.isPrivate).toBe(true)
    expect(res.defaultAssignee).toBe('emp-b')
    expect(res.defaultStatus).toBe('todo')
    expect(res.workflows).toEqual(base.workflows)
  })

  it('leaves unchecked groups empty', () => {
    const options = { ...defaultCopyOptions([]), members: false, privacy: false, defaults: false, workflows: false }
    const res = settingsFromBase(base, options, me)
    expect(res).toEqual({
      members: ['me'],
      owners: ['me'],
      assignment: {},
      isPrivate: false,
      defaultAssignee: undefined,
      defaultStatus: undefined,
      workflows: {}
    })
  })

  it('gives the empty project without a base', () => {
    expect(settingsFromBase(undefined, defaultCopyOptions([]), me).members).toEqual(['me'])
  })
})

describe('keepAssignee', () => {
  const emp = 'emp-b' as Ref<Employee>
  it('drops an assignee who is not a member', () => {
    expect(keepAssignee(emp, ['emp-me' as Ref<Employee>, undefined])).toBeUndefined()
    expect(keepAssignee(emp, [emp])).toBe(emp)
    expect(keepAssignee(undefined, [emp])).toBeUndefined()
  })
})

describe('selectionState', () => {
  it('tells all, some and none', () => {
    expect(selectionState(['a', 'b'], ['a', 'b'])).toBe('all')
    expect(selectionState(['a'], ['a', 'b'])).toBe('some')
    expect(selectionState([], ['a', 'b'])).toBe('none')
    expect(selectionState(['x'], ['a'])).toBe('none')
  })
})

describe('template copy', () => {
  const c1 = 'c1' as Ref<Component>
  const c2 = 'c2' as Ref<Component>
  const m1 = 'm1' as Ref<Milestone>
  const template = {
    _id: 't1',
    _class: 'tracker:class:IssueTemplate',
    space: 'base',
    modifiedOn: 1,
    modifiedBy: 'x',
    title: 'Bug',
    description: '<p>d</p>',
    priority: 1,
    assignee: null,
    component: c1,
    milestone: m1,
    estimation: 2,
    labels: ['l1'],
    kind: 'task',
    dueDate: null,
    comments: 3,
    attachments: 4,
    relations: [],
    children: [
      {
        id: 'child' as Ref<Issue>,
        title: 'Sub',
        description: '',
        priority: 0,
        assignee: null,
        component: c2,
        milestone: null,
        estimation: 0
      }
    ]
  } as unknown as IssueTemplate

  it('translates a reference to the copy or clears it', () => {
    const copies = new Map([[c1, 'new-c1' as Ref<Component>]])
    expect(translateRef(c1, copies)).toBe('new-c1')
    expect(translateRef(c2, copies)).toBeNull()
    expect(translateRef(null, copies)).toBeNull()
    expect(translateRef(undefined, copies)).toBeUndefined()
  })

  it('copies the fields without the base ids and counters', () => {
    const res = copyTemplate(
      template,
      new Map([[c1, 'new-c1' as Ref<Component>]]),
      new Map(),
      () => 'new-child' as Ref<Issue>
    ) as unknown as Record<string, unknown>
    expect(res._id).toBeUndefined()
    expect(res.space).toBeUndefined()
    expect(res.modifiedOn).toBeUndefined()
    expect(res).toMatchObject({
      title: 'Bug',
      description: '<p>d</p>',
      priority: 1,
      component: 'new-c1',
      milestone: null,
      estimation: 2,
      labels: ['l1'],
      kind: 'task',
      dueDate: null,
      comments: 0,
      attachments: 0
    })
    expect(res.children).toEqual([expect.objectContaining({ id: 'new-child', title: 'Sub', component: null })])
  })
})
