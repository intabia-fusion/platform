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
  type TxCreateDoc,
  TxFactory,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { Employee } from '@hcengineering/contact'
import type { TriggerControl } from '@hcengineering/server-core'
import time, { type ToDo, type WorkSlot } from '@hcengineering/time'
import tracker, { type Issue, type TimeSpendReport } from '@hcengineering/tracker'

import { OnWorkSlotCreate, OnWorkSlotRemove, OnWorkSlotUpdate } from '../index'

const HOUR = 60 * 60 * 1000
const slotStart = 1700000000000

const issueRef = 'issue:1' as Ref<Issue>
const todoRef = 'todo:1' as Ref<ToDo>
const slotRef = 'slot:1' as Ref<WorkSlot>
const reportRef = 'report:1' as Ref<TimeSpendReport>
const employeeRef = 'employee:1' as Ref<Employee>
const projectSpace = 'project:1' as Ref<Space>

const issue = {
  _id: issueRef,
  _class: tracker.class.Issue,
  space: projectSpace
} as unknown as Issue

const todo = {
  _id: todoRef,
  _class: time.class.ProjectToDo,
  space: time.space.ToDos,
  attachedTo: issueRef,
  attachedToClass: tracker.class.Issue,
  user: employeeRef
} as unknown as ToDo

function createSlot (dueDate: number): WorkSlot {
  return {
    _id: slotRef,
    _class: time.class.WorkSlot,
    space: projectSpace,
    attachedTo: todoRef,
    attachedToClass: time.class.ProjectToDo,
    date: slotStart,
    dueDate
  } as unknown as WorkSlot
}

const report = {
  _id: reportRef,
  _class: tracker.class.TimeSpendReport,
  space: projectSpace,
  attachedTo: issueRef,
  attachedToClass: tracker.class.Issue,
  collection: 'reports',
  employee: employeeRef,
  date: slotStart,
  value: 1,
  description: '',
  workslot: slotRef
} as unknown as TimeSpendReport

type FindAllFn = (_class: Ref<Class<Doc>>, query: any) => Doc[]

function createMockControl (findAllImpl: FindAllFn): TriggerControl {
  return {
    ctx: { contextData: {} } as unknown as MeasureContext,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>, query: any) =>
      toFindResult(findAllImpl(_class, query))
    ),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) => _class === base
    } as any,
    modelDb: {} as any,
    removedMap: new Map(),
    apply: jest.fn().mockResolvedValue({})
  } as unknown as TriggerControl
}

function buildFindAll (opts: { slot?: WorkSlot, reports?: TimeSpendReport[], noToDo?: boolean }): FindAllFn {
  return (_class) => {
    if (_class === time.class.ToDo) return opts.noToDo === true ? [] : [todo]
    if (_class === tracker.class.Issue) return [issue]
    if (_class === time.class.WorkSlot) return opts.slot !== undefined ? [opts.slot] : []
    if (_class === tracker.class.TimeSpendReport) return opts.reports ?? []
    return []
  }
}

function createSlotTx (slot: WorkSlot): TxCreateDoc<WorkSlot> {
  const { _id, _class, space, ...attributes } = slot as any
  return {
    _id: generateId(),
    _class: core.class.TxCreateDoc,
    space: core.space.Tx,
    objectId: slotRef,
    objectClass: time.class.WorkSlot,
    objectSpace: projectSpace,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId,
    attributes
  } as unknown as TxCreateDoc<WorkSlot>
}

function updateSlotTx (operations: Partial<WorkSlot>): TxUpdateDoc<WorkSlot> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.Tx,
    objectId: slotRef,
    objectClass: time.class.WorkSlot,
    objectSpace: projectSpace,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId,
    operations
  } as unknown as TxUpdateDoc<WorkSlot>
}

function removeSlotTx (): TxRemoveDoc<WorkSlot> {
  return {
    _id: generateId(),
    _class: core.class.TxRemoveDoc,
    space: core.space.Tx,
    objectId: slotRef,
    objectClass: time.class.WorkSlot,
    objectSpace: projectSpace,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId
  } as unknown as TxRemoveDoc<WorkSlot>
}

describe('work slot time reporting', () => {
  it('reports slot duration on creation', async () => {
    const slot = createSlot(slotStart + HOUR)
    const control = createMockControl(buildFindAll({ slot }))

    const res: Tx[] = await OnWorkSlotCreate([createSlotTx(slot)], control)

    expect(res).toHaveLength(1)
    const tx = res[0] as TxCreateDoc<TimeSpendReport>
    expect(tx._class).toBe(core.class.TxCreateDoc)
    expect(tx.objectClass).toBe(tracker.class.TimeSpendReport)
    expect(tx.attachedTo).toBe(issueRef)
    expect(tx.attributes.value).toBe(1)
    expect(tx.attributes.workslot).toBe(slotRef)
    expect(tx.attributes.employee).toBe(employeeRef)
  })

  it('keeps the report in sync when the slot is moved', async () => {
    const slot = createSlot(slotStart + 2 * HOUR)
    const control = createMockControl(buildFindAll({ slot, reports: [report] }))

    const res: Tx[] = await OnWorkSlotUpdate([updateSlotTx({ dueDate: slot.dueDate })], control)

    expect(res).toHaveLength(1)
    const tx = res[0] as TxUpdateDoc<TimeSpendReport>
    expect(tx.objectId).toBe(reportRef)
    expect(tx.attachedTo).toBe(issueRef)
    expect(tx.operations.value).toBe(2)
    expect(tx.operations.date).toBe(slotStart)
  })

  it('reports a slot that had no report yet when it is moved', async () => {
    const slot = createSlot(slotStart + 2 * HOUR)
    const control = createMockControl(buildFindAll({ slot }))

    const res: Tx[] = await OnWorkSlotUpdate([updateSlotTx({ dueDate: slot.dueDate })], control)

    expect(res).toHaveLength(1)
    const tx = res[0] as TxCreateDoc<TimeSpendReport>
    expect(tx._class).toBe(core.class.TxCreateDoc)
    expect(tx.attributes.value).toBe(2)
    expect(tx.attributes.workslot).toBe(slotRef)
  })

  it('survives a slot whose todo is already gone', async () => {
    const slot = createSlot(slotStart + HOUR)
    const control = createMockControl(buildFindAll({ slot, noToDo: true }))

    const res: Tx[] = await OnWorkSlotUpdate([updateSlotTx({ visibility: 'public' })], control)

    expect(res).toHaveLength(0)
  })

  it('drops the report when the slot is removed', async () => {
    const control = createMockControl(buildFindAll({ reports: [report] }))

    const res: Tx[] = await OnWorkSlotRemove([removeSlotTx()], control)

    expect(res).toHaveLength(1)
    const tx = res[0] as TxRemoveDoc<TimeSpendReport>
    expect(tx._class).toBe(core.class.TxRemoveDoc)
    expect(tx.objectId).toBe(reportRef)
    expect(tx.attachedTo).toBe(issueRef)
  })
})
