/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import core, { type Ref, toFindResult, type Tx, TxFactory, type TxMixin, type TxUpdateDoc } from '@hcengineering/core'
import type { Employee } from '@hcengineering/contact'
import hr, { type Department, type Staff } from '@hcengineering/hr'
import type { TriggerControl } from '@hcengineering/server-core'
import { OnDepartmentStaff } from '../index'

const employee = 'emp:1' as Ref<Employee>
const dep = 'dep:1' as Ref<Department>

function mixinTx (id: string, department: Ref<Department> | null): TxMixin<Employee, Staff> {
  return {
    _id: id,
    _class: core.class.TxMixin,
    objectId: employee,
    attributes: { department }
  } as unknown as TxMixin<Employee, Staff>
}

function createControl (history: Array<TxMixin<Employee, Staff>>): TriggerControl {
  return {
    ctx: {},
    findAll: jest.fn(async () => toFindResult(history)),
    queryFind: jest.fn().mockResolvedValue([{ _id: dep, _class: hr.class.Department, members: [employee] }]),
    txFactory: new TxFactory(core.account.System, true)
  } as unknown as TriggerControl
}

describe('OnDepartmentStaff', () => {
  it('pulls the employee from the previous department once when department is cleared', async () => {
    const current = mixinTx('tx:2', null)
    const result: Tx[] = await OnDepartmentStaff([current], createControl([mixinTx('tx:1', dep), current]))

    const pulls = result.filter((tx) => (tx as TxUpdateDoc<Department>).operations?.$pull !== undefined)
    expect(pulls).toHaveLength(1)
  })
})
