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

import core, {
  type Doc,
  generateId,
  type Ref,
  type Space,
  type TxCreateDoc,
  type TxUpdateDoc,
  TxFactory,
  type Class,
  toFindResult,
  type Status,
  type WithLookup
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import task, { type Task, type Project, type TaskType, type Rank } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import { type Workflow, type WorkflowTransition } from '@hcengineering/workflow'
import { ValidateTransition } from '../ValidateTransition'

const testSpace = 'test-space' as Ref<Project>
const testAccount = 'test-account' as any

function createMockTask (data: Partial<Task> = {}): WithLookup<Task> {
  return {
    _id: data._id ?? generateId(),
    _class: task.class.Task,
    space: data.space ?? testSpace,
    status: data.status ?? generateId(),
    kind: data.kind ?? generateId(),
    number: 1,
    identifier: 'TASK-1',
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    createdOn: Date.now()
  } as unknown as WithLookup<Task>
}

function createCreateTx (t: WithLookup<Task>): TxCreateDoc<Task> {
  const { _id, _class, space, ...attributes } = t
  return {
    _id: generateId(),
    _class: core.class.TxCreateDoc,
    space: core.space.DerivedTx,
    objectId: _id,
    objectClass: _class,
    objectSpace: space,
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    attributes: attributes as any
  } satisfies TxCreateDoc<Task>
}

function createUpdateTx (
  taskId: Ref<Task>,
  operations: Partial<Task>,
  space: Ref<Space> = testSpace
): TxUpdateDoc<Task> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.DerivedTx,
    objectId: taskId,
    objectClass: task.class.Task,
    objectSpace: space,
    modifiedOn: Date.now(),
    modifiedBy: testAccount,
    createdBy: testAccount,
    operations
  } satisfies TxUpdateDoc<Task>
}

type FindAllFn = (ctx: any, _class: Ref<Class<Doc>>, query: any, options?: any) => Promise<Doc[]>

function createMockControl (findAllImpl: FindAllFn): TriggerControl {
  return {
    ctx: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      newChild: jest.fn().mockReturnThis(),
      contextData: { account: null }
    } as any,
    workspace: { url: 'test-ws', uuid: 'test-ws-uuid', dataId: 'test-data', accountsUrl: '' } as any,
    branding: null,
    findAll: jest.fn(async (...args: Parameters<FindAllFn>) => toFindResult(await findAllImpl(...args))),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) => {
        return _class === base
      },
      hasMixin: (doc: any, _class: any) => {
        return doc.workflows !== undefined
      },
      as: (doc: any, _class: any) => doc
    } as any,
    modelDb: {} as any,
    removedMap: new Map(),
    userStatusMap: new Map(),
    cache: new Map(),
    contextCache: new Map(),
    withScope: async <T>(_scope: string, fn: () => Promise<T>) => await fn(),
    txes: [],
    apply: jest.fn().mockResolvedValue({}),
    queryFind: jest.fn().mockResolvedValue([])
  } as unknown as TriggerControl
}

describe('ValidateTransition Trigger', () => {
  it('should allow all transitions if project has no workflow scheme', async () => {
    const project: Partial<Project> = {
      _id: testSpace as any,
      _class: task.class.Project,
      space: core.space.Model
    }

    const t = createMockTask()
    const tx = createUpdateTx(t._id, { status: generateId() })

    const control = createMockControl(async (ctx, cl, query) => {
      if (cl === task.class.Project && query._id === testSpace) {
        return [project as Doc]
      }
      if (cl === task.class.Task && query._id === t._id) {
        return [t]
      }
      return []
    })

    await expect(ValidateTransition([tx], control)).resolves.not.toThrow()
  })

  it('should allow creation with valid start status', async () => {
    const statusTodo = 'todo-status' as Ref<Status>
    const wfId = 'wf-1' as Ref<Workflow>

    const t = createMockTask({ status: statusTodo })
    const tx = createCreateTx(t)

    const project: Doc & any = {
      _id: testSpace as any,
      _class: task.class.Project,
      space: core.space.Model,
      workflows: {
        [t.kind]: wfId
      }
    }

    const transition: Doc & WorkflowTransition = {
      _id: 't-1' as any,
      _class: workflow.class.WorkflowTransition,
      space: testSpace,
      attachedTo: wfId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Create',
      from: [],
      to: statusTodo,
      rank: 'a0' as Rank,
      modifiedOn: 0,
      modifiedBy: testAccount
    }

    const control = createMockControl(async (ctx, cl, query) => {
      if (cl === task.class.Project && query._id === testSpace) {
        return [project]
      }
      if (cl === workflow.class.WorkflowTransition && query.attachedTo === wfId) {
        return [transition]
      }
      return []
    })

    await expect(ValidateTransition([tx], control)).resolves.not.toThrow()
  })

  it('should throw error on creation with invalid start status', async () => {
    const statusTodo = 'todo-status' as Ref<Status>
    const statusDone = 'done-status' as Ref<Status>
    const wfId = 'wf-1' as Ref<Workflow>

    const t = createMockTask({ status: statusDone })
    const tx = createCreateTx(t)

    const project: Doc & any = {
      _id: testSpace as any,
      _class: task.class.Project,
      space: core.space.Model,
      workflows: {
        [t.kind]: wfId
      }
    }

    const transition: Doc & WorkflowTransition = {
      _id: 't-1' as any,
      _class: workflow.class.WorkflowTransition,
      space: testSpace,
      attachedTo: wfId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Create',
      from: [],
      to: statusTodo,
      rank: 'a0' as Rank,
      modifiedOn: 0,
      modifiedBy: testAccount
    }

    const control = createMockControl(async (ctx, cl, query) => {
      if (cl === task.class.Project && query._id === testSpace) {
        return [project]
      }
      if (cl === workflow.class.WorkflowTransition && query.attachedTo === wfId) {
        return [transition]
      }
      return []
    })

    await expect(ValidateTransition([tx], control)).rejects.toThrow()
  })

  it('should allow valid transition on update', async () => {
    const statusTodo = 'todo-status' as Ref<Status>
    const statusInProgress = 'in-progress-status' as Ref<Status>
    const wfId = 'wf-1' as Ref<Workflow>

    const t = createMockTask({ status: statusTodo })
    const tx = createUpdateTx(t._id, { status: statusInProgress })

    const project: Doc & any = {
      _id: testSpace as any,
      _class: task.class.Project,
      space: core.space.Model,
      workflows: {
        [t.kind]: wfId
      }
    }

    const transition: Doc & WorkflowTransition = {
      _id: 't-2' as any,
      _class: workflow.class.WorkflowTransition,
      space: testSpace,
      attachedTo: wfId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Start Work',
      from: [statusTodo],
      to: statusInProgress,
      rank: 'a0' as Rank,
      modifiedOn: 0,
      modifiedBy: testAccount
    }

    const control = createMockControl(async (ctx, cl, query) => {
      if (cl === task.class.Project && query._id === testSpace) {
        return [project]
      }
      if (cl === task.class.Task && query._id === t._id) {
        return [t]
      }
      if (cl === workflow.class.WorkflowTransition && query.attachedTo === wfId) {
        return [transition]
      }
      return []
    })

    await expect(ValidateTransition([tx], control)).resolves.not.toThrow()
  })

  it('should throw error on invalid transition on update', async () => {
    const statusTodo = 'todo-status' as Ref<Status>
    const statusDone = 'done-status' as Ref<Status>
    const wfId = 'wf-1' as Ref<Workflow>

    const t = createMockTask({ status: statusTodo })
    const tx = createUpdateTx(t._id, { status: statusDone })

    const project: Doc & any = {
      _id: testSpace as any,
      _class: task.class.Project,
      space: core.space.Model,
      workflows: {
        [t.kind]: wfId
      }
    }

    const transition: Doc & WorkflowTransition = {
      _id: 't-2' as any,
      _class: workflow.class.WorkflowTransition,
      space: testSpace,
      attachedTo: wfId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Start Work',
      from: [statusTodo],
      to: 'in-progress-status' as Ref<Status>,
      rank: 'a0' as Rank,
      modifiedOn: 0,
      modifiedBy: testAccount
    }

    const control = createMockControl(async (ctx, cl, query) => {
      if (cl === task.class.Project && query._id === testSpace) {
        return [project]
      }
      if (cl === task.class.Task && query._id === t._id) {
        return [t]
      }
      if (cl === workflow.class.WorkflowTransition && query.attachedTo === wfId) {
        return [transition]
      }
      return []
    })

    await expect(ValidateTransition([tx], control)).rejects.toThrow()
  })

  it('should resolve workflow mapping using project workflows array for task types', async () => {
    const taskTypeBug = 'bug-type' as Ref<TaskType>
    const statusTodo = 'todo-status' as Ref<Status>
    const statusInProgress = 'in-progress-status' as Ref<Status>
    const wfBugId = 'wf-bug' as Ref<Workflow>

    const project: Doc & any = {
      _id: testSpace as any,
      _class: task.class.Project,
      space: core.space.Model,
      workflows: {
        [taskTypeBug]: wfBugId
      }
    }

    const transition: Doc & WorkflowTransition = {
      _id: 't-bug-1' as any,
      _class: workflow.class.WorkflowTransition,
      space: testSpace,
      attachedTo: wfBugId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Fix Bug',
      from: [statusTodo],
      to: statusInProgress,
      rank: 'a0' as Rank,
      modifiedOn: 0,
      modifiedBy: testAccount
    }

    const t = createMockTask({ status: statusTodo, kind: taskTypeBug })
    const tx = createUpdateTx(t._id, { status: statusInProgress })

    const control = createMockControl(async (ctx, cl, query) => {
      if (cl === task.class.Project && query._id === testSpace) {
        return [project]
      }
      if (cl === task.class.Task && query._id === t._id) {
        return [t]
      }
      if (cl === workflow.class.WorkflowTransition && query.attachedTo === wfBugId) {
        return [transition]
      }
      return []
    })

    await expect(ValidateTransition([tx], control)).resolves.not.toThrow()
  })
})
