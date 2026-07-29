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

import {
  generateId,
  type Ref,
  type TxUpdateDoc,
  TxFactory,
  type Status,
  type WithLookup,
  toFindResult
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import task, { type Task, type Project, type TaskType, type Rank } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import { type Workflow, type WorkflowTransition } from '@hcengineering/workflow'
import { ValidateTransitionTrigger } from '../ValidateTransition'
import { SetFieldValue, ClearFieldValue } from '../ExecutePostFunctions'

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    getResource: jest.fn().mockImplementation(async (res) => {
      if (res === 'SetFieldValue') return SetFieldValue
      if (res === 'ClearFieldValue') return ClearFieldValue
      return actual.getResource(res)
    })
  }
})

const testSpace = 'test-space' as Ref<Project>

function createMockTask (data: Partial<Task> = {}): WithLookup<Task> {
  return {
    _id: data._id ?? generateId(),
    _class: task.class.Task,
    space: data.space ?? testSpace,
    status: data.status ?? generateId(),
    kind: data.kind ?? generateId(),
    number: 1,
    identifier: 'TASK-1',
    description: '',
    rank: '0|i00000:' as Rank,
    modifiedBy: 'user-1' as any,
    modifiedOn: Date.now(),
    createdOn: Date.now(),
    createdBy: 'user-1' as any,
    ...data
  } as any
}

describe('Workflow Post-Functions', () => {
  const txFactory = new TxFactory('test-account' as any)

  it('should execute SetFieldValue post-function on status transition', async () => {
    const fromStatus = generateId<Status>()
    const toStatus = generateId<Status>()
    const taskTypeId = generateId<TaskType>()
    const workflowId = generateId<Workflow>()
    const pfRuleId = generateId()

    const oldTask = createMockTask({ status: fromStatus, kind: taskTypeId })
    const updateTx: TxUpdateDoc<Task> = txFactory.createTxUpdateDoc(task.class.Task, testSpace, oldTask._id, {
      status: toStatus
    })

    const project: Project = {
      _id: testSpace,
      _class: task.class.Project,
      space: testSpace,
      name: 'Test Project',
      rank: '0|i00000:' as Rank,
      modifiedBy: 'user-1' as any,
      modifiedOn: Date.now(),
      createdOn: Date.now(),
      createdBy: 'user-1' as any,
      workflows: { [taskTypeId]: workflowId }
    } as any

    const transition: WorkflowTransition = {
      _id: generateId(),
      _class: workflow.class.WorkflowTransition,
      space: testSpace as any,
      modifiedOn: Date.now(),
      modifiedBy: 'user-1' as any,
      attachedTo: workflowId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Close',
      from: [fromStatus],
      to: toStatus,
      rank: '0|i00000:' as Rank,
      postFunctions: [
        {
          id: 'pf-1',
          postFunction: pfRuleId as any,
          props: { fieldKey: 'assignee', value: 'user-2' }
        }
      ]
    } as any

    const pfRule = {
      _id: pfRuleId,
      _class: workflow.class.WorkflowPostFunction,
      space: testSpace,
      modifiedOn: Date.now(),
      modifiedBy: 'user-1',
      label: 'Set field value',
      description: '',
      order: 10,
      editor: 'editor',
      serverExecutor: 'SetFieldValue'
    } as any

    const hierarchy = {
      isDerived: (c: any, target: any) => c === target || target === task.class.Task,
      hasMixin: () => true,
      as: (obj: any, mixin: any) => {
        if (mixin === workflow.mixin.ProjectWorkflow) return project
        if (mixin === 'server-workflow:mixin:PostFunctionImpl') return pfRule
        return obj
      }
    } as any

    const control: TriggerControl = {
      ctx: {} as any,
      hierarchy,
      txFactory,
      modelDb: {} as any,
      findAll: jest.fn().mockImplementation(async (ctx, _class, query) => {
        if (_class === task.class.Project) return toFindResult([project])
        if (_class === task.class.Task) return toFindResult([oldTask])
        if (_class === workflow.class.WorkflowTransition) return toFindResult([transition])
        if (_class === workflow.class.WorkflowPostFunction) return toFindResult([pfRule])
        return toFindResult([])
      })
    } as any

    const resultTxes = await ValidateTransitionTrigger([updateTx], control)

    expect(resultTxes.length).toBe(1)
    const pfTx = resultTxes[0] as TxUpdateDoc<Task>
    expect((pfTx.operations as any).assignee).toBe('user-2')
  })

  it('should execute ClearFieldValue post-function on status transition', async () => {
    const fromStatus = generateId<Status>()
    const toStatus = generateId<Status>()
    const taskTypeId = generateId<TaskType>()
    const workflowId = generateId<Workflow>()
    const pfRuleId = generateId()

    const oldTask = createMockTask({ status: fromStatus, kind: taskTypeId, resolution: 'fixed' } as any)
    const updateTx: TxUpdateDoc<Task> = txFactory.createTxUpdateDoc(task.class.Task, testSpace, oldTask._id, {
      status: toStatus
    })

    const project: Project = {
      _id: testSpace,
      _class: task.class.Project,
      space: testSpace,
      name: 'Test Project',
      rank: '0|i00000:' as Rank,
      modifiedBy: 'user-1' as any,
      modifiedOn: Date.now(),
      createdOn: Date.now(),
      createdBy: 'user-1' as any,
      workflows: { [taskTypeId]: workflowId }
    } as any

    const transition: WorkflowTransition = {
      _id: generateId(),
      _class: workflow.class.WorkflowTransition,
      space: testSpace as any,
      modifiedOn: Date.now(),
      modifiedBy: 'user-1' as any,
      attachedTo: workflowId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Reopen',
      from: [fromStatus],
      to: toStatus,
      rank: '0|i00000:' as Rank,
      postFunctions: [
        {
          id: 'pf-1',
          postFunction: pfRuleId as any,
          props: { fields: [{ fieldKey: 'resolution' }] }
        }
      ]
    } as any

    const pfRule = {
      _id: pfRuleId,
      _class: workflow.class.WorkflowPostFunction,
      space: testSpace,
      modifiedOn: Date.now(),
      modifiedBy: 'user-1',
      label: 'Clear field value',
      description: '',
      order: 20,
      editor: 'editor',
      serverExecutor: 'ClearFieldValue'
    } as any

    const hierarchy = {
      isDerived: (c: any, target: any) => c === target || target === task.class.Task,
      hasMixin: () => true,
      as: (obj: any, mixin: any) => {
        if (mixin === workflow.mixin.ProjectWorkflow) return project
        if (mixin === 'server-workflow:mixin:PostFunctionImpl') return pfRule
        return obj
      }
    } as any

    const control: TriggerControl = {
      ctx: {} as any,
      hierarchy,
      txFactory,
      modelDb: {} as any,
      findAll: jest.fn().mockImplementation(async (ctx, _class, query) => {
        if (_class === task.class.Project) return toFindResult([project])
        if (_class === task.class.Task) return toFindResult([oldTask])
        if (_class === workflow.class.WorkflowTransition) return toFindResult([transition])
        if (_class === workflow.class.WorkflowPostFunction) return toFindResult([pfRule])
        return toFindResult([])
      })
    } as any

    const resultTxes = await ValidateTransitionTrigger([updateTx], control)

    expect(resultTxes.length).toBe(1)
    const pfTx = resultTxes[0] as TxUpdateDoc<Task>
    expect((pfTx.operations as any).resolution).toBeNull()
  })
})
