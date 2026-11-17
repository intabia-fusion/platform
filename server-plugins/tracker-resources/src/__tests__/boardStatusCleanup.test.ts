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
      createTxUpdateDoc: jest.fn((cls: string, space: string, id: string, patch: object) => ({ cls, space, id, patch }))
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

  it('cleans saved conditions on a closed personal board without changing columns', async () => {
    const { control, tx } = fixture()
    const [update] = (await OnProjectTypeStatusesChanged([tx] as any, control as any)) as any
    expect(JSON.parse(update.patch.filter)).toEqual([{ key: { key: 'priority' }, value: [1] }])
    expect(JSON.parse(update.patch.quickFilters[0].condition)[0].value).toEqual(['kept'])
    expect(JSON.parse(update.patch.colorRules[0].condition)).toHaveLength(1)
    expect(JSON.parse(update.patch.swimlanes[0].condition)[0].value).toEqual(['kept'])
    expect(update.patch.swimlanes[1]).toEqual({ id: 'rest', condition: '' })
    expect(update.patch).not.toHaveProperty('columns')
    expect(update.space).toBe('private-space')
  })
  it('removes the whole condition when its last status disappeared, including an already empty condition', async () => {
    for (const ids of [['removed'], []]) {
      const { control, tx } = fixture({ filter: JSON.stringify([{ key: { key: 'status' }, value: ids }]) })
      const [update] = (await OnProjectTypeStatusesChanged([tx] as any, control as any)) as any
      expect(update.patch.filter).toBe('')
    }
  })
  it('keeps a status still used by another type of a board project', async () => {
    const { control, tx } = fixture({ projects: ['project', 'other-project'] })
    expect(await OnProjectTypeStatusesChanged([tx] as any, control as any)).toEqual([])
  })
  it('does nothing on unrelated transactions or boards with incomplete project data', async () => {
    const { control, tx } = fixture({ projects: ['project', 'unavailable'] })
    expect(await OnProjectTypeStatusesChanged([tx] as any, control as any)).toEqual([])
    expect(await OnProjectTypeStatusesChanged([] as any, control as any)).toEqual([])
  })
  it('is idempotent after cleaning both delete and merge updates', async () => {
    const { board, control, tx } = fixture()
    const [update] = (await OnProjectTypeStatusesChanged([tx] as any, control as any)) as any
    Object.assign(board, update.patch)
    expect(await OnProjectTypeStatusesChanged([tx] as any, control as any)).toEqual([])
  })
})
