//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import core, {
  type Class,
  type Doc,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  type Tx,
  TxFactory,
  type TxCreateDoc,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import contact, { type Employee, type Person } from '@hcengineering/contact'
import task from '@hcengineering/task'
import time, { type ToDo, type WorkSlot } from '@hcengineering/time'
import tracker, { type Issue } from '@hcengineering/tracker'
import type { TriggerControl } from '@hcengineering/server-core'

import { IssueToDoFactory } from '../index'

const HOUR = 60 * 60 * 1000

const issueRef = 'issue:1' as Ref<Issue>
const todoRef = 'todo:1' as Ref<ToDo>
const projectSpace = 'project:1' as Ref<Space>
const oldUser = 'employee:old' as Ref<Employee>
const newUser = 'employee:new' as Ref<Person>

const issue = {
  _id: issueRef,
  _class: tracker.class.Issue,
  space: projectSpace,
  status: 'status:active',
  kind: 'taskType:1',
  title: 'Issue',
  attachedTo: tracker.ids.NoParent,
  attachedToClass: tracker.class.Issue,
  collection: 'subIssues'
} as unknown as Issue

const todo = {
  _id: todoRef,
  _class: time.class.ProjectToDo,
  space: time.space.ToDos,
  attachedTo: issueRef,
  attachedToClass: tracker.class.Issue,
  user: oldUser,
  doneOn: null,
  title: 'Issue'
} as unknown as ToDo

function slot (id: string, date: number, dueDate: number): WorkSlot {
  return {
    _id: id as Ref<WorkSlot>,
    _class: time.class.WorkSlot,
    space: projectSpace,
    attachedTo: todoRef,
    attachedToClass: time.class.ProjectToDo,
    collection: 'workslots',
    date,
    dueDate
  } as unknown as WorkSlot
}

function createMockControl (now: number, statusCategory: Ref<Doc> = task.statusCategory.Active): TriggerControl {
  const findAll = (_class: Ref<Class<Doc>>, query: any): Doc[] => {
    if (_class === tracker.class.Issue) return [issue]
    if (_class === task.class.Project) return [{ _id: projectSpace, type: 'projectType:1' } as unknown as Doc]
    if (_class === time.class.ToDo) {
      // rank lookup for the new todo asks for the user's own open todos
      return query.user !== undefined ? [] : [todo]
    }
    if (_class === time.class.WorkSlot) {
      return [slot('slot:past', now - 2 * HOUR, now - HOUR), slot('slot:future', now + HOUR, now + 2 * HOUR)]
    }
    if (_class === contact.mixin.Employee) return [{ _id: newUser } as unknown as Doc]
    return []
  }

  return {
    ctx: { contextData: {} } as unknown as MeasureContext,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>, query: any) => toFindResult(findAll(_class, query))),
    modelDb: {
      findAll: jest.fn(async (_class: Ref<Class<Doc>>) => {
        if (_class === task.class.ProjectType) return [{ classic: true }]
        if (_class === core.class.Status) return [{ category: statusCategory }]
        return []
      })
    } as any,
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) => _class === base
    } as any,
    removedMap: new Map(),
    apply: jest.fn().mockResolvedValue({})
  } as unknown as TriggerControl
}

function updateAssigneeTx (): TxUpdateDoc<Issue> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.Tx,
    objectId: issueRef,
    objectClass: tracker.class.Issue,
    objectSpace: projectSpace,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId,
    operations: { assignee: newUser }
  } as unknown as TxUpdateDoc<Issue>
}

describe('issue reassignment', () => {
  it('keeps the old todo open, marks it and frees the time planned ahead', async () => {
    const now = Date.now()
    const res: Tx[] = await IssueToDoFactory(updateAssigneeTx(), createMockControl(now))

    const todoUpdates = res.filter(
      (tx) => tx._class === core.class.TxUpdateDoc && (tx as TxUpdateDoc<ToDo>).objectId === todoRef
    ) as Array<TxUpdateDoc<ToDo>>
    expect(todoUpdates).toHaveLength(1)
    expect(todoUpdates[0].operations.reassignedTo).toBe(newUser)
    expect(todoUpdates[0].operations.doneOn).toBeUndefined()

    const slotRemovals = res.filter(
      (tx) => tx._class === core.class.TxRemoveDoc && (tx as TxRemoveDoc<Doc>).objectClass === time.class.WorkSlot
    ) as Array<TxRemoveDoc<WorkSlot>>
    expect(slotRemovals.map((tx) => tx.objectId)).toEqual(['slot:future'])

    const created = res.filter(
      (tx) => tx._class === core.class.TxCreateDoc && (tx as TxCreateDoc<Doc>).objectClass === time.class.ProjectToDo
    ) as Array<TxCreateDoc<ToDo>>
    expect(created).toHaveLength(1)
    expect(created[0].attributes.user).toBe(newUser)
  })

  it('frees the planned time even when the issue is out of work', async () => {
    const now = Date.now()
    const control = createMockControl(now, task.statusCategory.UnStarted)

    const res: Tx[] = await IssueToDoFactory(updateAssigneeTx(), control)

    const todoUpdates = res.filter(
      (tx) => tx._class === core.class.TxUpdateDoc && (tx as TxUpdateDoc<ToDo>).objectId === todoRef
    ) as Array<TxUpdateDoc<ToDo>>
    expect(todoUpdates).toHaveLength(1)
    expect(todoUpdates[0].operations.reassignedTo).toBe(newUser)

    const slotRemovals = res.filter(
      (tx) => tx._class === core.class.TxRemoveDoc && (tx as TxRemoveDoc<Doc>).objectClass === time.class.WorkSlot
    )
    expect(slotRemovals).toHaveLength(1)

    // A backlog issue gets no todo of its own, the old one is just released.
    const created = res.filter(
      (tx) => tx._class === core.class.TxCreateDoc && (tx as TxCreateDoc<Doc>).objectClass === time.class.ProjectToDo
    )
    expect(created).toHaveLength(0)
  })
})
