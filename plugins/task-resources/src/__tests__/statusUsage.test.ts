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

import type { Status, TxOperations } from '@hcengineering/core'
import type { ProjectType, TaskType } from '@hcengineering/task'
import workflow from '@hcengineering/workflow'
import { loadWorkflowUsage, removeStatusFromType } from '../statusUsage'

// A plain string where the code wants a Ref
const ref = (value: string): any => value

interface Fixture {
  workflows: any[]
  transitions: any[]
}

// The part of TxOperations the helpers use, with the order of the calls recorded
function fakeClient (fixture: Fixture): { client: TxOperations, calls: string[] } {
  const calls: string[] = []
  const client = {
    findAll: async (_class: string, query: any) => {
      if (_class === workflow.class.Workflow) {
        calls.push('read workflows')
        return fixture.workflows.filter((it) => it.projectType === query.projectType)
      }
      calls.push('read transitions')
      return fixture.transitions.filter((it) => (query.attachedTo.$in as string[]).includes(it.attachedTo))
    },
    update: async (doc: any, ops: any) => {
      calls.push(`update ${doc._id} ${JSON.stringify(ops)}`)
    },
    remove: async (doc: any) => {
      calls.push(`remove ${doc._id}`)
    }
  } as unknown as TxOperations
  return { client, calls }
}

const subtaskRule = (statuses: Record<string, string[] | null>): any => ({
  id: 'v',
  rule: workflow.validator.SubtaskStatus,
  props: { statuses }
})

describe('loadWorkflowUsage', () => {
  const taskTypes = [{ _id: 'tt1', name: 'Bug' }] as unknown as TaskType[]
  const fixture = (): Fixture => ({
    workflows: [
      { _id: 'w1', projectType: 'pt', taskType: 'tt1', name: 'w1', initialStatuses: ['init'] },
      { _id: 'w2', projectType: 'pt', taskType: 'other', name: 'Second' },
      { _id: 'foreign', projectType: 'other-pt', name: 'Foreign', initialStatuses: ['init'] }
    ],
    transitions: [
      { _id: 'tr1', attachedTo: 'w1', from: ['from'], to: 'to' },
      { _id: 'tr2', attachedTo: 'w2', from: null, to: 'a', validators: [subtaskRule({ tt1: ['ruled'], tt2: null })] },
      {
        _id: 'tr3',
        attachedTo: 'w2',
        to: 'a',
        validators: [{ id: 'f', rule: workflow.validator.FieldRequired, props: { statuses: { tt1: ['field'] } } }]
      }
    ]
  })
  const usage = async (f: Fixture): Promise<Awaited<ReturnType<typeof loadWorkflowUsage>>> =>
    await loadWorkflowUsage(fakeClient(f).client, ref('pt'), taskTypes)

  it('counts a workflow where the status is initial, the source or the target of a transition', async () => {
    const res = await usage(fixture())
    expect(res.get(ref('init'))).toEqual([{ id: 'w1', name: 'Bug' }])
    expect(res.get(ref('from'))).toEqual([{ id: 'w1', name: 'Bug' }])
    expect(res.get(ref('to'))).toEqual([{ id: 'w1', name: 'Bug' }])
  })

  it('counts a workflow whose subtask or parent status rule lists the status', async () => {
    const res = await usage(fixture())
    expect(res.get(ref('ruled'))).toEqual([{ id: 'w2', name: 'Second' }])
  })

  it('does not count a rule of another kind or a workflow of another project type', async () => {
    const res = await usage(fixture())
    expect(res.has(ref('field'))).toBe(false)
    expect(res.get(ref('init'))?.map((it) => it.id)).toEqual(['w1'])
  })
})

describe('removeStatusFromType', () => {
  const entry = (statusId: string): any => ({ _id: statusId, taskType: 'tt1' })
  const type = (): ProjectType =>
    ({
      _id: 'pt',
      tasks: ['tt1'],
      statuses: [entry('s1'), entry('s2')],
      statusOrder: ['s1', 's2']
    }) as unknown as ProjectType
  const taskType = (): TaskType => ({ _id: 'tt1', parent: 'pt', statuses: ['s1', 's2'] }) as unknown as TaskType
  const status = (statusId: string): Status => ({ _id: statusId }) as unknown as Status
  const nothingElse = { types: [] as ProjectType[], taskTypes: [] as TaskType[], tasks: 0 }
  const empty = (): Fixture => ({ workflows: [], transitions: [] })

  it('takes the status out of the lists and deletes the document when nothing refers to it', async () => {
    const { client, calls } = fakeClient(empty())
    await removeStatusFromType(client, type(), status('s1'), [taskType()], nothingElse)
    expect(calls).toContain('update tt1 {"statuses":["s2"]}')
    expect(calls).toContain('update pt {"statuses":[{"_id":"s2","taskType":"tt1"}],"statusOrder":["s2"]}')
    expect(calls).toContain('remove s1')
  })

  it('reads the workflows before the task types change', async () => {
    const { client, calls } = fakeClient(empty())
    await removeStatusFromType(client, type(), status('s1'), [taskType()], nothingElse)
    expect(calls.indexOf('read workflows')).toBeLessThan(calls.findIndex((it) => it.startsWith('update tt1')))
  })

  it('keeps the document of a status defined by the model', async () => {
    const { client, calls } = fakeClient(empty())
    const model = { ...type(), statuses: [entry('tracker:status:Done'), entry('s2')], statusOrder: undefined }
    const tt: TaskType = { ...taskType(), statuses: [ref('tracker:status:Done'), ref('s2')] }
    await removeStatusFromType(client, model as ProjectType, status('tracker:status:Done'), [tt], nothingElse)
    expect(calls).toContain('update tt1 {"statuses":["s2"]}')
    expect(calls.some((it) => it.startsWith('remove'))).toBe(false)
  })

  it('keeps the document while tasks anywhere are in the status', async () => {
    const { client, calls } = fakeClient(empty())
    await removeStatusFromType(client, type(), status('s1'), [taskType()], { ...nothingElse, tasks: 3 })
    expect(calls).toContain('update tt1 {"statuses":["s2"]}')
    expect(calls.some((it) => it.startsWith('remove'))).toBe(false)
  })

  it('keeps the document while a subtask or parent status rule lists the status', async () => {
    const fixture: Fixture = {
      workflows: [{ _id: 'w1', projectType: 'pt', taskType: 'tt1', name: 'w1' }],
      transitions: [{ _id: 'tr1', attachedTo: 'w1', to: 's2', validators: [subtaskRule({ tt1: ['s1'] })] }]
    }
    const { client, calls } = fakeClient(fixture)
    await removeStatusFromType(client, type(), status('s1'), [taskType()], nothingElse)
    expect(calls.some((it) => it.startsWith('remove'))).toBe(false)
  })

  it('keeps the document while a transition or another project type or task type refers to it', async () => {
    const fixture: Fixture = {
      workflows: [{ _id: 'w1', projectType: 'pt', taskType: 'tt1', name: 'w1' }],
      transitions: [{ _id: 'tr1', attachedTo: 'w1', from: ['s1'], to: 's2' }]
    }
    const inTransition = fakeClient(fixture)
    await removeStatusFromType(inTransition.client, type(), status('s1'), [taskType()], nothingElse)
    expect(inTransition.calls.some((it) => it.startsWith('remove'))).toBe(false)

    const otherType = { _id: 'pt2', statuses: [entry('s1')] } as unknown as ProjectType
    const byType = fakeClient(empty())
    await removeStatusFromType(byType.client, type(), status('s1'), [taskType()], {
      ...nothingElse,
      types: [otherType]
    })
    expect(byType.calls.some((it) => it.startsWith('remove'))).toBe(false)

    const otherTask = { _id: 'tt9', parent: 'pt2', statuses: ['s1'] } as unknown as TaskType
    const byTaskType = fakeClient(empty())
    await removeStatusFromType(byTaskType.client, type(), status('s1'), [taskType()], {
      ...nothingElse,
      taskTypes: [otherTask]
    })
    expect(byTaskType.calls.some((it) => it.startsWith('remove'))).toBe(false)
  })
})
