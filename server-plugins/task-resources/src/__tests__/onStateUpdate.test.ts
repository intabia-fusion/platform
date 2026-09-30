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

import core, { type Doc, type TxCUD } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import task from '@hcengineering/task'
import { OnStateUpdate } from '../index'

function mockControl (category: string): { control: TriggerControl, findAll: jest.Mock } {
  const findAll = jest.fn(async () => [{ _id: 'issue', _class: 'tracker:class:Issue', space: 'space' }])
  const control = {
    ctx: {},
    findAll,
    hierarchy: { isDerived: () => true, hasMixin: () => false },
    modelDb: { findAllSync: () => [{ _id: 'status', category }] },
    txFactory: {
      createTxUpdateDoc: (...args: unknown[]) => ({ kind: 'update', args }),
      createTxMixin: (...args: unknown[]) => ({ kind: 'mixin', args })
    }
  }
  return { control: control as unknown as TriggerControl, findAll }
}

const statusUpdate = {
  _class: core.class.TxUpdateDoc,
  objectId: 'issue',
  objectClass: 'tracker:class:Issue',
  objectSpace: 'space',
  modifiedOn: 10,
  operations: { status: 'status' }
} as unknown as TxCUD<Doc>

describe('OnStateUpdate TimeManaged lookup', () => {
  it('does not read the task for a status that sets no dates', async () => {
    const { control, findAll } = mockControl(task.statusCategory.UnStarted)
    await OnStateUpdate([statusUpdate], control)
    expect(findAll).not.toHaveBeenCalled()
  })

  it('reads the task and writes the start for an Active status', async () => {
    const { control, findAll } = mockControl(task.statusCategory.Active)
    const res = await OnStateUpdate([statusUpdate], control)
    expect(findAll).toHaveBeenCalledTimes(1)
    expect(res).toContainEqual(expect.objectContaining({ kind: 'mixin' }))
  })
})
