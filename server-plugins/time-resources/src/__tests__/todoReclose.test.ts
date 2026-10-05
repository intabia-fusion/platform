//
// Copyright © 2026 Intabia Fusion.
//

import core, {
  generateId,
  type Class,
  type Doc,
  type MeasureContext,
  type PersonId,
  type Ref,
  toFindResult,
  type Tx,
  TxFactory,
  type TxUpdateDoc
} from '@hcengineering/core'
import time, { type ToDo, type WorkSlot } from '@hcengineering/time'
import type { TriggerControl } from '@hcengineering/server-core'

import { OnToDoUpdate } from '../index'

const todoRef = 'todo:1' as Ref<ToDo>
const todo = { _id: todoRef, _class: time.class.ToDo, space: time.space.ToDos } as unknown as ToDo
const futureSlot = {
  _id: 'slot:1',
  _class: time.class.WorkSlot,
  space: time.space.ToDos,
  attachedTo: todoRef,
  attachedToClass: time.class.ToDo,
  collection: 'workslots',
  date: Date.now() + 1000,
  dueDate: Date.now() + 2000
} as unknown as WorkSlot

function doneTx (doneOn: number): TxUpdateDoc<ToDo> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.Tx,
    objectId: todoRef,
    objectClass: time.class.ToDo,
    objectSpace: time.space.ToDos,
    modifiedOn: Date.now(),
    modifiedBy: 'user' as PersonId,
    operations: { doneOn }
  } as unknown as TxUpdateDoc<ToDo>
}

// Minimal matcher: equality plus $exists, with dotted paths, enough for the query under test.
function matches (doc: any, query: Record<string, any>): boolean {
  return Object.entries(query).every(([key, cond]) => {
    const value = key.split('.').reduce((o, k) => o?.[k], doc)
    if (cond !== null && typeof cond === 'object' && '$exists' in cond) return (value !== undefined) === cond.$exists
    return value === cond
  })
}

function createControl (stored: Tx[]): TriggerControl {
  const findAll = (_class: Ref<Class<Doc>>, query: any): Doc[] => {
    if (_class === time.class.ToDo) return [todo]
    if (_class === time.class.WorkSlot) return [futureSlot]
    if (_class === core.class.TxUpdateDoc) return stored.filter((tx) => matches(tx, query))
    return []
  }
  return {
    ctx: { contextData: {} } as unknown as MeasureContext,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>, query: any) => toFindResult(findAll(_class, query))),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: { isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) => _class === base } as any
  } as unknown as TriggerControl
}

describe('OnToDoUpdate', () => {
  it('cuts work slots on the first close', async () => {
    const first = doneTx(Date.now())
    const res = await OnToDoUpdate([first], createControl([first]))
    expect(res).toHaveLength(1)
  })

  it('does not cut work slots again when the todo was already closed', async () => {
    const first = doneTx(Date.now() - 1000)
    const second = doneTx(Date.now())
    const res = await OnToDoUpdate([second], createControl([first, second]))
    expect(res).toHaveLength(0)
  })
})
