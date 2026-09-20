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
  type TxCUD,
  TxFactory,
  type TxUpdateDoc
} from '@hcengineering/core'
import contact, { type Employee } from '@hcengineering/contact'
import task from '@hcengineering/task'
import time, { type ToDo, type WorkSlot } from '@hcengineering/time'
import tracker, { type Issue } from '@hcengineering/tracker'
import type { TriggerControl } from '@hcengineering/server-core'

import { IssueToDoFactory, OnToDoUpdate } from '../index'

const HOUR = 60 * 60 * 1000

const issueRef = 'issue:1' as Ref<Issue>
const todoRef = 'todo:1' as Ref<ToDo>
const projectSpace = 'project:1' as Ref<Space>
const user = 'employee:1' as Ref<Employee>

const issue = {
  _id: issueRef,
  _class: tracker.class.Issue,
  space: projectSpace,
  status: 'status:done',
  kind: 'taskType:1',
  title: 'Issue',
  assignee: user
} as unknown as Issue

const todo = {
  _id: todoRef,
  _class: time.class.ProjectToDo,
  space: time.space.ToDos,
  attachedTo: issueRef,
  attachedToClass: tracker.class.Issue,
  user,
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

function createMockControl (now: number, statusCategory: Ref<Doc>): TriggerControl {
  const applied: Tx[] = []
  const findAll = (_class: Ref<Class<Doc>>): Doc[] => {
    if (_class === tracker.class.Issue) return [issue]
    if (_class === task.class.Project) return [{ _id: projectSpace, type: 'projectType:1' } as unknown as Doc]
    if (_class === time.class.ToDo) return [todo]
    if (_class === time.class.WorkSlot) {
      return [slot('slot:past', now - 2 * HOUR, now - HOUR), slot('slot:future', now + HOUR, now + 2 * HOUR)]
    }
    if (_class === contact.mixin.Employee) return [{ _id: user } as unknown as Doc]
    if (_class === core.class.TxUpdateDoc) return []
    return []
  }

  const control = {
    ctx: { contextData: {} } as unknown as MeasureContext,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>) => toFindResult(findAll(_class))),
    modelDb: {
      findAll: jest.fn(async (_class: Ref<Class<Doc>>) => {
        if (_class === task.class.ProjectType) return [{ classic: true }]
        if (_class === core.class.Status) return [{ category: statusCategory }]
        return []
      })
    } as any,
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) =>
        _class === base || (_class === time.class.ProjectToDo && base === time.class.ToDo)
    } as any,
    removedMap: new Map(),
    apply: jest.fn(async (_ctx: any, txes: Tx[]) => {
      applied.push(...txes)
    })
  } as unknown as TriggerControl

  ;(control as any).applied = applied
  return control
}

function closeTodoTx (doneOn: number): TxUpdateDoc<ToDo> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.Tx,
    objectId: todoRef,
    objectClass: time.class.ProjectToDo,
    objectSpace: time.space.ToDos,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId,
    operations: { doneOn }
  } as unknown as TxUpdateDoc<ToDo>
}

function closeIssueTx (): TxUpdateDoc<Issue> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.Tx,
    objectId: issueRef,
    objectClass: tracker.class.Issue,
    objectSpace: projectSpace,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId,
    operations: { status: 'status:done' as any }
  } as unknown as TxUpdateDoc<Issue>
}

describe('todo and issue status are independent', () => {
  it('closing a todo trims its slots and leaves the issue status alone', async () => {
    const now = Date.now()
    const control = createMockControl(now, task.statusCategory.Active)

    const res: Tx[] = await OnToDoUpdate([closeTodoTx(now)], control)

    expect(res.length).toBeGreaterThan(0)
    const touchedClasses = new Set(res.map((tx) => (tx as TxCUD<Doc>).objectClass))
    expect(touchedClasses).toEqual(new Set([time.class.WorkSlot]))
    expect((control as any).applied).toHaveLength(0)
  })

  it('closing an issue leaves the todo open', async () => {
    const control = createMockControl(Date.now(), task.statusCategory.Won)

    const res: Tx[] = await IssueToDoFactory(closeIssueTx(), control)

    const todoTxes = [...res, ...(control as any).applied].filter(
      (tx) => (tx as TxCUD<Doc>).objectId === todoRef
    ) as Array<TxUpdateDoc<ToDo>>
    expect(todoTxes).toHaveLength(0)
  })
})
