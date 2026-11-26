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

import core from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import { OnProjectTypeStatusesChanged } from '../boardStatusCleanup'

const condition = (ids: string[], mode = 'in'): string =>
  JSON.stringify([
    { key: { key: 'status' }, value: ids, mode },
    { key: { key: 'priority' }, value: [1] }
  ])
function fixture (extra: object = {}): any {
  const board = {
    _id: 'board',
    _class: tracker.class.Board,
    space: 'private-space',
    projects: ['project'],
    filter: condition(['removed']),
    columns: [{ statuses: ['removed'] }],
    quickFilters: [{ id: 'q', condition: condition(['removed', 'kept'], 'not-in') }],
    swimlanes: [
      { id: 'lane', condition: condition(['removed', 'kept']) },
      { id: 'rest', condition: '' }
    ],
    colorRules: [{ id: 'c', condition: condition(['removed']) }],
    ...extra
  }
  const types = [
    { _id: 'type', statuses: [{ _id: 'kept', taskType: 'task' }] },
    { _id: 'other-type', statuses: [{ _id: 'removed', taskType: 'other-task' }] }
  ]
  const projects = [
    { _id: 'project', type: 'type' },
    { _id: 'other-project', type: 'other-type' }
  ]
  const control = {
    ctx: {},
    modelDb: { findAllSync: () => types },
    findAll: jest.fn(async (_ctx: unknown, cls: string) => (cls === tracker.class.Project ? projects : [board])),
    txFactory: {
      createTxUpdateDoc: jest.fn(
        (
          cls: string,
          space: string,
          id: string,
          patch: object,
          _retrieve: unknown,
          _on: unknown,
          _by: unknown,
          meta: object
        ) => ({ cls, space, id, patch, meta })
      )
    }
  }
  const tx = {
    _class: core.class.TxUpdateDoc,
    objectClass: task.class.ProjectType,
    objectId: 'type',
    operations: { statuses: types[0].statuses }
  }
  return { board, types, control, tx }
}

describe('board conditions after project type status removal', () => {
  it.each([{ name: 'Renamed' }, { description: 'Changed' }, { statusOrder: ['kept'] }, { $set: { name: 'Renamed' } }])(
    'does not query boards or projects for unrelated changes: %j',
    async (operations) => {
      const { control, tx } = fixture()
      tx.operations = operations
      expect(await OnProjectTypeStatusesChanged([tx] as any, control as any)).toEqual([])
      expect(control.findAll).not.toHaveBeenCalled()
    }
  )
  it.each([
    { statuses: [] },
    { $push: { statuses: { _id: 'kept', taskType: 'task' } } },
    { $pull: { statuses: { _id: 'removed' } } },
    { $set: { statuses: [] } },
    { $unset: { statuses: true } },
    { $update: { statuses: { $query: { _id: 'removed' }, $update: { taskType: 'task' } } } },
    { 'statuses.0.taskType': 'task' }
  ])('checks conditions for status list changes: %j', async (operations) => {
    const { control, tx } = fixture()
    tx.operations = operations
    expect(await OnProjectTypeStatusesChanged([tx] as any, control as any)).toHaveLength(1)
  })

  it('queues a personal board without copying its conditions into the marker', async () => {
    const { control, tx } = fixture()
    const [update] = (await OnProjectTypeStatusesChanged([tx] as any, control as any)) as any
    expect(update.patch).toEqual({})
    expect(update.meta).toEqual({ boardStatusCleanup: true })
    expect(update.space).toBe('private-space')
  })

  it('queues boards even when another project keeps the status or project data is incomplete', async () => {
    for (const projects of [
      ['project', 'other-project'],
      ['project', 'unavailable']
    ]) {
      const { control, tx } = fixture({ projects })
      expect(await OnProjectTypeStatusesChanged([tx] as any, control as any)).toHaveLength(1)
    }
    const { control } = fixture()
    expect(await OnProjectTypeStatusesChanged([] as any, control as any)).toEqual([])
  })

  it('queues a clean snapshot for rechecking after pending board writes', async () => {
    const { control, tx } = fixture({ filter: '', quickFilters: [], swimlanes: [], colorRules: [] })
    const updates = await OnProjectTypeStatusesChanged([tx] as any, control as any)
    expect(updates).toHaveLength(1)
    expect((updates[0] as any).patch).toEqual({})
    expect((updates[0] as any).meta).toEqual({ boardStatusCleanup: true })
  })
})
