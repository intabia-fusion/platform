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

import core, { type Ref } from '@hcengineering/core'
import task, { type TaskType } from '@hcengineering/task'
import { OnTaskTypeRemove } from '../index'

// P lists T1 and T2; T1 is removed. s1 is in both, s2 only in T1, s3 only in T2.
function run (): any[] {
  const taskTypes = [
    { _id: 'T2', parent: 'P', statuses: ['s1', 's3'] },
    { _id: 'T1', parent: 'P', statuses: ['s1', 's2'] }
  ]
  const projectType = {
    _id: 'P',
    tasks: ['T1', 'T2'],
    statuses: [
      { _id: 's1', taskType: 'T1', color: 1 },
      { _id: 's2', taskType: 'T1', color: 2 },
      { _id: 's1', taskType: 'T2' },
      { _id: 's3', taskType: 'T2' }
    ]
  }
  const removed = { _id: 'T1', parent: 'P', statuses: ['s1', 's2'], ofClass: 'c', targetClass: 'c' }
  const control: any = {
    removedMap: new Map([['T1', removed]]),
    modelDb: {
      findAllSync: (_class: string, query: any) => {
        if (_class === task.class.ProjectType) return [projectType]
        if (_class === task.class.TaskType) {
          return taskTypes.filter((it) => (query._id.$in as string[]).includes(it._id))
        }
        return []
      }
    },
    txFactory: {
      createTxUpdateDoc: (_class: string, space: string, id: string, operations: any) => ({
        _class,
        space,
        id,
        operations
      })
    }
  }
  return [control, { objectId: 'T1' as Ref<TaskType> }] as any
}

describe('OnTaskTypeRemove', () => {
  it('pulls the task type from the project type and keeps an unused status without a task type', async () => {
    const [control, tx] = run() as any
    const res = await OnTaskTypeRemove([tx], control)
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ _class: task.class.ProjectType, space: core.space.Model, id: 'P' })
    const { tasks, statuses } = (res[0] as any).operations
    expect(tasks).toEqual(['T2'])
    expect(statuses.filter((it: any) => it._id === 's1')).toEqual([{ _id: 's1', color: 1, taskType: 'T2' }])
    expect(statuses.find((it: any) => it._id === 's2')).toEqual({ _id: 's2', color: 2 })
    expect(statuses.find((it: any) => it._id === 's3')).toEqual({ _id: 's3', taskType: 'T2' })
  })
})
