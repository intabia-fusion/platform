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
import serverWorkflow from '@hcengineering/server-workflow'
import { type Workflow, type WorkflowTransition } from '@hcengineering/workflow'
import { PostFunctionsTrigger } from '../PostFunctions'
import { UpdateFieldValue, ClearFieldValue } from '../post-functions'
const contactPersonClass = 'contact:class:Person' as any

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    getResource: jest.fn().mockImplementation(async (res) => {
      if (res === 'UpdateFieldValue') return UpdateFieldValue
      if (res === 'ClearFieldValue') return ClearFieldValue
      return actual.getResource(res)
    })
  }
})

const testSpace = 'test-space' as Ref<Project>

function createMockTask (data: Partial<Task> & Record<string, any> = {}): WithLookup<Task> {
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
  const mockCtx = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    newChild: jest.fn().mockReturnThis(),
    contextData: { account: 'user-current' }
  } as any

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
    updateTx.meta = { fromStatus }

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
          rule: pfRuleId as any,
          props: { fields: [{ fieldKey: 'assignee', value: { type: 'const', value: 'user-2' } }] }
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
      serverExecutor: 'UpdateFieldValue'
    } as any

    const hierarchy = {
      isDerived: (c: any, target: any) => c === target || target === task.class.Task,
      hasMixin: () => true,
      as: (obj: any, mixin: any) => {
        if (mixin === workflow.mixin.ProjectWorkflow) return project
        if (
          mixin === serverWorkflow.mixin.PostFunctionImpl ||
          mixin === 'server-workflow:mixin:PostFunctionImpl' ||
          String(mixin).includes('PostFunctionImpl')
        ) {
          return pfRule
        }
        return obj
      }
    } as any

    const control: TriggerControl = {
      ctx: mockCtx,
      hierarchy,
      txFactory,
      modelDb: { findAllSync: () => [] } as any,
      findAll: jest.fn().mockImplementation(async (ctx, _class, query) => {
        if (_class === task.class.Project) return toFindResult([project])
        if (_class === task.class.Task) return toFindResult([oldTask])
        if (_class === workflow.class.WorkflowTransition) return toFindResult([transition])
        if (_class === workflow.class.WorkflowPostFunction) return toFindResult([pfRule])
        return toFindResult([])
      })
    } as any

    const resultTxes = await PostFunctionsTrigger([updateTx], control)
    expect(resultTxes.length).toBe(1)
    const pfTx = resultTxes[0] as TxUpdateDoc<Task>
    expect((pfTx.operations as any).assignee).toBe('user-2')
  })

  it('should evaluate presets, field functions, and parent references in UpdateFieldValue', async () => {
    const parentId = generateId<Task>()
    const parentTask = createMockTask({ _id: parentId, description: 'Parent Desc' })
    const currentTask = createMockTask({
      attachedTo: parentId,
      attachedToClass: task.class.Task,
      identifier: 'task-10'
    })

    const txFactoryUser = new TxFactory('email:user-current' as any)
    const control: TriggerControl = {
      ctx: mockCtx,
      hierarchy: {} as any,
      txFactory: txFactoryUser,
      modelDb: {
        findAllSync: () => [
          { _id: workflow.function.UpperCase, type: 'transform' },
          { _id: workflow.function.Append, type: 'transform' },
          { _id: workflow.function.FirstValue, type: 'transform' },
          { _id: workflow.function.Replace, type: 'transform' },
          { _id: workflow.function.ReplaceAll, type: 'transform' }
        ]
      } as any,
      findAll: jest.fn().mockImplementation(async (ctx, _class, query) => {
        if (_class === task.class.Task && query._id === parentId) {
          return toFindResult([parentTask])
        }
        if (String(_class).includes('SocialIdentity')) {
          return toFindResult([
            {
              _id: 'sid-1',
              space: 'test',
              modifiedOn: 0,
              modifiedBy: 'test',
              _class: 'contact:class:SocialIdentity',
              attachedTo: 'user-current',
              attachedToClass: contactPersonClass
            } as any
          ])
        }
        if (String(_class).includes('Person')) {
          return toFindResult([
            { _id: 'user-current', space: 'test', modifiedOn: 0, modifiedBy: 'test', _class: contactPersonClass } as any
          ])
        }
        return toFindResult([])
      })
    } as any

    const props = {
      fields: [
        {
          fieldKey: 'assignee',
          value: { type: 'preset', preset: '$currentUser' }
        },
        {
          fieldKey: 'titleUpper',
          value: {
            type: 'const',
            value: 'hello world',
            functions: [
              { func: workflow.function.UpperCase },
              { func: workflow.function.Append, props: { value: '!' } }
            ]
          }
        },
        {
          fieldKey: 'parentDesc',
          value: {
            type: 'parent',
            fieldKey: 'description'
          }
        },
        {
          fieldKey: 'firstItem',
          value: {
            type: 'const',
            value: ['val1', 'val2'],
            functions: [{ func: workflow.function.FirstValue }]
          }
        },
        {
          fieldKey: 'titleReplaced',
          value: {
            type: 'const',
            value: 'NEW TASK NEW',
            functions: [{ func: workflow.function.Replace, props: { search: 'NEW', replacement: 'ТУЦ' } }]
          }
        },
        {
          fieldKey: 'titleReplacedAll',
          value: {
            type: 'const',
            value: 'NEW TASK NEW',
            functions: [{ func: workflow.function.ReplaceAll, props: { search: 'NEW', replacement: 'ТУЦ' } }]
          }
        }
      ]
    }

    const transition: WorkflowTransition = { _id: 't-1' } as any
    const txes = await UpdateFieldValue(control, currentTask, transition, props as any)

    expect(txes.length).toBe(1)
    const ops = (txes[0] as TxUpdateDoc<Task>).operations as any
    expect(ops.assignee).toBe('user-current')
    expect(ops.titleUpper).toBe('HELLO WORLD!')
    expect(ops.parentDesc).toBe('Parent Desc')
    expect(ops.firstItem).toBe('val1')
    expect(ops.titleReplaced).toBe('ТУЦ TASK NEW')
    expect(ops.titleReplacedAll).toBe('ТУЦ TASK ТУЦ')
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
    updateTx.meta = { fromStatus }

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
          rule: pfRuleId as any,
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
      findAttribute: () => undefined,
      as: (obj: any, mixin: any) => {
        if (mixin === workflow.mixin.ProjectWorkflow) return project
        if (
          mixin === serverWorkflow.mixin.PostFunctionImpl ||
          mixin === 'server-workflow:mixin:PostFunctionImpl' ||
          String(mixin).includes('PostFunctionImpl')
        ) {
          return pfRule
        }
        return obj
      }
    } as any

    const control: TriggerControl = {
      ctx: mockCtx,
      hierarchy,
      txFactory,
      modelDb: { findAllSync: () => [] } as any,
      findAll: jest.fn().mockImplementation(async (ctx, _class, query) => {
        if (_class === task.class.Project) return toFindResult([project])
        if (_class === task.class.Task) return toFindResult([oldTask])
        if (_class === workflow.class.WorkflowTransition) return toFindResult([transition])
        if (_class === workflow.class.WorkflowPostFunction) return toFindResult([pfRule])
        return toFindResult([])
      })
    } as any

    const resultTxes = await PostFunctionsTrigger([updateTx], control)

    expect(resultTxes.length).toBe(1)
    const pfTx = resultTxes[0] as TxUpdateDoc<Task>
    expect((pfTx.operations as any).$unset?.resolution).toBe(true)
  })

  it('should handle ClearFieldValue directly with regular, mixin and collection fields', async () => {
    const currentTask = createMockTask({
      _id: 'task-1' as any,
      _class: task.class.Task,
      customField: 'value',
      'custom:mixin': { mixinField: 123 }
    })

    const collectionDoc = {
      _id: 'col-doc-1',
      _class: 'test:class:ColDoc',
      space: testSpace,
      attachedTo: 'task-1',
      attachedToClass: task.class.Task,
      collection: 'items'
    }

    const hierarchy = {
      isDerived: (c: any, target: any) => c === 'core:class:Collection' || target === task.class.Task,
      hasMixin: (doc: any, mixin: any) => mixin === 'custom:mixin',
      findAttribute: (cls: any, key: any) => {
        if (key === 'items') {
          return { _id: key, name: key, type: { _class: 'core:class:Collection', of: 'test:class:ColDoc' } }
        }
        return { _id: key, name: key, type: { _class: 'core:class:String' } }
      }
    } as any

    const control: TriggerControl = {
      ctx: mockCtx,
      hierarchy,
      txFactory,
      modelDb: { findAllSync: () => [] } as any,
      findAll: jest.fn().mockImplementation(async (ctx, _class, query) => {
        if (_class === 'test:class:ColDoc') return [collectionDoc]
        return []
      })
    } as any

    const transition: WorkflowTransition = { _id: 't-1' } as any

    const emptyResult = await ClearFieldValue(control, currentTask, transition, { fields: [] })
    expect(emptyResult).toEqual([])

    const res = await ClearFieldValue(control, currentTask, transition, {
      fields: [
        { fieldKey: '', attribute: '' as any },
        { fieldKey: 'simpleField', attribute: 'simpleField' as any },
        { fieldKey: 'mixinField', mixin: 'custom:mixin' as any, attribute: 'mixinField' as any },
        { fieldKey: 'ignoredMixin', mixin: 'other:mixin' as any, attribute: 'ignoredMixin' as any },
        { fieldKey: 'items', attribute: 'items' as any }
      ]
    })

    expect(res.length).toBe(2)

    // Collection remove CUD tx
    const collectionTx = res[0] as any
    expect(collectionTx._class).toBe('core:class:TxRemoveDoc')
    expect(collectionTx.collection).toBe('items')
    expect(collectionTx.attachedTo).toBe('task-1')

    // Document update with $unset tx
    const updateTx = res[1] as TxUpdateDoc<Task>
    expect(updateTx._class).toBe('core:class:TxUpdateDoc')
    expect((updateTx.operations as any).$unset).toEqual({
      simpleField: true,
      'custom:mixin.mixinField': true
    })
  })
})
