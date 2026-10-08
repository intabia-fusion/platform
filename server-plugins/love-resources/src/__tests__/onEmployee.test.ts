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

import contact, { type Employee, type Person } from '@hcengineering/contact'
import core, { generateId, TxFactory, type Ref, type Tx, type TxMixin, type TxUpdateDoc } from '@hcengineering/core'
import love, { type Office } from '@hcengineering/love'
import { type TriggerControl } from '@hcengineering/server-core'

import { OnEmployee } from '../index'

function createControl (
  employees: Array<{ _id: Ref<Employee>, role: string }>,
  offices: Array<{ _id: Ref<Office>, person: Ref<Employee> | null }>
): TriggerControl {
  const findAll = async (_ctx: any, _class: any, query: any): Promise<any[]> => {
    if (_class === contact.mixin.Employee) return employees.filter((it) => it._id === query._id)
    if (_class === love.class.Office) {
      return offices
        .filter((it) => it.person === query.person)
        .map((it) => ({ ...it, _class: love.class.Office, space: core.space.Workspace }))
    }
    return []
  }
  const control: any = { ctx: {}, findAll, txFactory: new TxFactory(core.account.System) }
  return control
}

function activeTx (person: Ref<Employee>, active: boolean): Tx {
  const tx: Partial<TxMixin<Person, Employee>> = {
    _id: generateId(),
    _class: core.class.TxMixin,
    space: core.space.Tx,
    objectId: person,
    objectClass: contact.class.Person,
    objectSpace: contact.space.Contacts,
    mixin: contact.mixin.Employee,
    attributes: { active },
    modifiedBy: core.account.System,
    modifiedOn: Date.now()
  }
  return tx as Tx
}

describe('OnEmployee', () => {
  const person = generateId<Employee>()
  const person2 = generateId<Employee>()

  it('assigns a free office to an activated employee', async () => {
    const office = generateId<Office>()
    const result = await OnEmployee(
      [activeTx(person, true)],
      createControl([{ _id: person, role: 'USER' }], [{ _id: office, person: null }])
    )
    expect(result).toHaveLength(1)
    expect((result[0] as TxUpdateDoc<Office>).objectId).toBe(office)
    expect((result[0] as TxUpdateDoc<Office>).operations.person).toBe(person)
  })

  it('skips a guest: the role is read from the stored employee, not from the mixin tx', async () => {
    const result = await OnEmployee(
      [activeTx(person, true)],
      createControl([{ _id: person, role: 'GUEST' }], [{ _id: generateId(), person: null }])
    )
    expect(result).toHaveLength(0)
  })

  it('does not assign an office to a person who already has one', async () => {
    const result = await OnEmployee(
      [activeTx(person, true)],
      createControl(
        [{ _id: person, role: 'USER' }],
        [
          { _id: generateId(), person },
          { _id: generateId(), person: null }
        ]
      )
    )
    expect(result).toHaveLength(0)
  })

  it('gives different offices to employees activated in one batch', async () => {
    const result = await OnEmployee(
      [activeTx(person, true), activeTx(person2, true)],
      createControl(
        [
          { _id: person, role: 'USER' },
          { _id: person2, role: 'USER' }
        ],
        [
          { _id: generateId(), person: null },
          { _id: generateId(), person: null }
        ]
      )
    )
    expect(result).toHaveLength(2)
    expect(new Set(result.map((it) => (it as TxUpdateDoc<Office>).objectId)).size).toBe(2)
  })

  it('releases the offices of a deactivated employee', async () => {
    const office = generateId<Office>()
    const result = await OnEmployee(
      [activeTx(person, false)],
      createControl([{ _id: person, role: 'USER' }], [{ _id: office, person }])
    )
    expect(result).toHaveLength(1)
    expect((result[0] as TxUpdateDoc<Office>).objectId).toBe(office)
    expect((result[0] as TxUpdateDoc<Office>).operations.person).toBeNull()
  })
})
