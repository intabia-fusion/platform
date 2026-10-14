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

/* eslint-disable @typescript-eslint/unbound-method */

import core, {
  type AnyAttribute,
  type AttachedDoc,
  type Class,
  Hierarchy,
  type Ref,
  type Status,
  type StatusCategory,
  type TxCreateDoc,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import task, { type Task, type TaskType } from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import type { IntlString } from '@hcengineering/platform'

import workflow from '../plugin'
import { FieldRequired, SubtaskStatus, ParentStatus, isEmptyAttribute } from '../validators'
import type { ValidatorClient, WorkflowTransition } from '../schema'

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    translate: jest.fn().mockImplementation(async (label: any) => {
      if (typeof label === 'string') return label
      if (label != null && typeof label === 'object' && label.defaultMessage != null) return label.defaultMessage
      return String(label)
    })
  }
})

function createMockValidatorClient (options?: {
  attributes?: Record<string, any>
  statuses?: Array<Pick<Status, '_id' | 'name' | 'category'>>
  categories?: Array<Pick<StatusCategory, '_id' | 'label'>>
  subtasks?: Array<Pick<Task, 'kind' | 'status'>>
  parentTasks?: Array<Pick<Task, 'kind' | 'status'> & { identifier?: string }>
  taskTypes?: Array<Pick<TaskType, '_id' | 'statuses'>>
}): ValidatorClient {
  const findAttribute = jest.fn((_class: Ref<Class<any>>, fieldKey: string) => {
    const attr = options?.attributes !== undefined && fieldKey in options.attributes ? options.attributes[fieldKey] : {}
    return {
      label: fieldKey,
      type: { _class: core.class.TypeString },
      ...attr
    }
  })

  const as = jest.fn((doc: any, mixin: Ref<Class<any>>) => {
    return doc[mixin] ?? doc
  })

  const isDerived = jest.fn((c: any, parent: any) => c === parent)

  const hierarchy = {
    findAttribute,
    as,
    isDerived
  } as any as Hierarchy

  const findAll = jest.fn().mockImplementation(async (_class: Ref<Class<any>>, query: any) => {
    if (_class === core.class.Status) {
      const ids: string[] = query?._id?.$in ?? []
      if (options?.statuses !== undefined) {
        return options.statuses.filter((s) => ids.includes(s._id))
      }
      return []
    }
    if (_class === core.class.StatusCategory) {
      const ids: string[] = query?._id?.$in ?? []
      return (options?.categories ?? []).filter((c) => ids.includes(c._id))
    }
    if (_class === task.class.TaskType) {
      return (options?.taskTypes ?? []).filter((t) => t._id === query?._id)
    }
    if (_class === task.class.Task) {
      if (query?.attachedTo !== undefined) {
        return options?.subtasks ?? []
      }
      if (query?._id !== undefined) {
        return options?.parentTasks ?? []
      }
    }
    return []
  })

  return {
    getHierarchy: () => hierarchy,
    findAll,
    findOne: jest.fn(),
    getModel: jest.fn()
  }
}

describe('Workflow Validators', () => {
  const statusOpen = 'status-open' as Ref<Status>
  const statusInProgress = 'status-in-progress' as Ref<Status>
  const statusDone = 'status-done' as Ref<Status>
  const statusCanceled = 'status-canceled' as Ref<Status>
  const taskTypeBug = 'task-type-bug' as Ref<TaskType>
  const taskTypeFeature = 'task-type-feature' as Ref<TaskType>
  const categoryActive = 'category-active' as Ref<StatusCategory>
  const categoryWon = 'category-won' as Ref<StatusCategory>
  const categoryLost = 'category-lost' as Ref<StatusCategory>
  const statusMeta = [
    { _id: statusOpen, name: 'Open', category: categoryActive },
    { _id: statusInProgress, name: 'In Progress', category: categoryActive },
    { _id: statusDone, name: 'Done', category: categoryWon },
    { _id: statusCanceled, name: 'Canceled', category: categoryLost }
  ]
  const typeStatuses = [statusOpen, statusInProgress, statusDone, statusCanceled]
  const taskTypeMeta = [
    { _id: taskTypeBug, statuses: typeStatuses },
    { _id: taskTypeFeature, statuses: typeStatuses }
  ]
  const categoryMeta = [
    { _id: categoryWon, label: 'Completed' as IntlString },
    { _id: categoryLost, label: 'Canceled' as IntlString }
  ]

  const dummyTransition: WorkflowTransition = {
    _id: 'trans-1',
    name: 'Resolve Task',
    from: [statusOpen, statusInProgress],
    to: statusDone,
    rank: '0'
  } as unknown as WorkflowTransition

  describe('FieldRequired', () => {
    const taskDoc = {
      _id: 'task-1' as Ref<Task>,
      _class: task.class.Task,
      title: 'Fix issue',
      description: 'Issue description',
      assignee: 'user-1'
    } as unknown as Task

    it('should return ok: true when props or fields are empty', async () => {
      const client = createMockValidatorClient()

      expect(await FieldRequired(client, taskDoc, dummyTransition, {})).toEqual({ ok: true })
      expect(await FieldRequired(client, taskDoc, dummyTransition, { fields: [] })).toEqual({ ok: true })
    })

    it('should skip fields with null or empty fieldKey', async () => {
      const client = createMockValidatorClient()

      const result = await FieldRequired(client, taskDoc, dummyTransition, {
        fields: [{ fieldKey: '' }, { fieldKey: null }]
      })

      expect(result).toEqual({ ok: true })
    })

    it('should skip fields when attribute is not found in hierarchy', async () => {
      const client = createMockValidatorClient({
        attributes: {}
      })
      const clientHierarchy = client.getHierarchy()
      jest.spyOn(clientHierarchy, 'findAttribute').mockReturnValue(null as any)

      const result = await FieldRequired(client, taskDoc, dummyTransition, {
        fields: [{ fieldKey: 'unknownField' }]
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return ok: true when all specified fields are non-empty', async () => {
      const client = createMockValidatorClient({
        attributes: {
          title: { label: 'Title' },
          assignee: { label: 'Assignee' }
        }
      })

      const result = await FieldRequired(client, taskDoc, dummyTransition, {
        fields: [{ fieldKey: 'title' }, { fieldKey: 'assignee' }]
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return validation error when a direct task field is empty', async () => {
      const client = createMockValidatorClient({
        attributes: {
          due: { label: 'Due Date' }
        },
        statuses: [
          { _id: statusOpen, name: 'Open' },
          { _id: statusDone, name: 'Done' }
        ]
      })

      const taskWithEmptyDue = { ...taskDoc, due: '' } as unknown as Task

      const result = await FieldRequired(client, taskWithEmptyDue, dummyTransition, {
        fields: [{ fieldKey: 'due' }]
      })

      expect(result).toEqual({
        ok: false,
        reason: 'To move the task to "Done", fill in: Due Date.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { to: 'Done', fields: 'Due Date', count: 1, refs: { to: statusDone, fields: ['Due Date'] } }
      })
    })

    it('should list every empty field, not only the first', async () => {
      const client = createMockValidatorClient({
        attributes: {
          due: { label: 'Due Date' },
          assignee: { label: 'Assignee' },
          estimation: { label: 'Estimation' }
        },
        statuses: [{ _id: statusDone, name: 'Done' }]
      })

      const task = { ...taskDoc, due: null, assignee: null, estimation: 4 } as unknown as Task

      const result = await FieldRequired(client, task, dummyTransition, {
        fields: [{ fieldKey: 'due' }, { fieldKey: 'estimation' }, { fieldKey: 'assignee' }, { fieldKey: 'due' }]
      })

      expect(result).toEqual({
        ok: false,
        reason: 'To move the task to "Done", fill in: Due Date, Assignee.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: {
          to: 'Done',
          fields: 'Due Date, Assignee',
          count: 2,
          refs: { to: statusDone, fields: ['Due Date', 'Assignee'] }
        }
      })
    })

    it('should use status ID string as fallback when status document is missing', async () => {
      const client = createMockValidatorClient({
        attributes: {
          due: { label: 'Due Date' }
        },
        statuses: []
      })

      const transitionWithMissingStatus: WorkflowTransition = {
        ...dummyTransition,
        from: [statusOpen],
        to: statusDone
      }

      const taskWithEmptyDue = { ...taskDoc, due: undefined } as unknown as Task

      const result = await FieldRequired(client, taskWithEmptyDue, transitionWithMissingStatus, {
        fields: [{ fieldKey: 'due' }]
      })

      expect(result).toEqual({
        ok: false,
        reason: 'To move the task to "status-done", fill in: Due Date.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: {
          to: 'status-done',
          fields: 'Due Date',
          count: 1,
          refs: { to: statusDone, fields: ['Due Date'] }
        }
      })
    })

    it('should validate mixin fields when mixin is specified', async () => {
      const mixinClass = 'tracker:class:ExtendedTask' as Ref<Class<any>>
      const taskWithMixin = {
        ...taskDoc,
        [mixinClass]: { extraInfo: 'Present' }
      }

      const client = createMockValidatorClient({
        attributes: {
          extraInfo: { label: 'Extra Info' }
        }
      })

      const validResult = await FieldRequired(client, taskWithMixin, dummyTransition, {
        fields: [{ mixin: mixinClass, fieldKey: 'extraInfo' }]
      })
      expect(validResult).toEqual({ ok: true })

      const emptyMixinTask = {
        ...taskDoc,
        [mixinClass]: { extraInfo: '' }
      }

      const invalidResult = await FieldRequired(client, emptyMixinTask, dummyTransition, {
        fields: [{ mixin: mixinClass, fieldKey: 'extraInfo' }]
      })
      expect(invalidResult.ok).toBe(false)
    })

    describe('Collection attributes', () => {
      const collectionAttr: AnyAttribute = {
        _id: 'attr-attachments',
        _class: core.class.Attribute,
        attributeOf: task.class.Task,
        name: 'attachments',
        label: 'Attachments',
        type: {
          _class: core.class.Collection,
          of: 'attachment:class:Attachment' as Ref<Class<AttachedDoc>>,
          label: 'Attachments'
        }
      } as unknown as AnyAttribute

      function createHierarchy (): Hierarchy {
        return {
          isDerived: jest.fn((c: any, parent: any) => c === parent || parent === core.class.Collection),
          findAttribute: jest.fn(),
          as: jest.fn()
        } as any
      }

      function makeCreateTx (
        objectId: string,
        taskId: string = 'task-1',
        collection: string = 'attachments',
        objectClass: string = 'attachment:class:Attachment'
      ): TxCreateDoc<AttachedDoc> {
        return {
          _id: `tx-create-${objectId}`,
          _class: core.class.TxCreateDoc,
          space: 'space-1',
          objectId,
          objectClass,
          objectSpace: 'space-1',
          attachedTo: taskId,
          collection,
          attributes: {
            attachedTo: taskId,
            collection,
            name: 'file.txt'
          },
          modifiedBy: 'user-1',
          modifiedOn: Date.now()
        } as any
      }

      function makeRemoveTx (
        objectId: string,
        taskId: string = 'task-1',
        collection: string = 'attachments',
        objectClass: string = 'attachment:class:Attachment'
      ): TxRemoveDoc<AttachedDoc> {
        return {
          _id: `tx-remove-${objectId}`,
          _class: core.class.TxRemoveDoc,
          space: 'space-1',
          objectId,
          objectClass,
          objectSpace: 'space-1',
          attachedTo: taskId,
          collection,
          modifiedBy: 'user-1',
          modifiedOn: Date.now()
        } as any
      }

      it('should return true (empty) when value is undefined and no txes exist', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, undefined, [])).toBe(true)
      })

      it('should return true (empty) when value is 0 and no txes exist', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 0, [])).toBe(true)
      })

      it('should return true (empty) when value is empty array and no txes exist', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, [], [])).toBe(true)
      })

      it('should return false (not empty) when value is positive number without txes', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 1, [])).toBe(false)
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 3, [])).toBe(false)
      })

      it('should return false (not empty) when value is non-empty array without txes', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, ['att-1'], [])).toBe(false)
      })

      it('should return false (not empty) when value is 0 but txes has TxCreateDoc', async () => {
        const h = createHierarchy()
        const txes = [makeCreateTx('att-new')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 0, txes)).toBe(false)
      })

      it('should return false (not empty) when value is undefined but txes has TxCreateDoc', async () => {
        const h = createHierarchy()
        const txes = [makeCreateTx('att-new')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, undefined, txes)).toBe(false)
      })

      it('should return true (empty) when value is 1 but txes has TxRemoveDoc removing the only item', async () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 1, txes)).toBe(true)
      })

      it('should return false (not empty) when value is 2 and txes has 1 TxRemoveDoc (1 item remaining)', async () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 2, txes)).toBe(false)
      })

      it('should return true (empty) when value is 2 and txes has 2 TxRemoveDocs (0 items remaining)', async () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1'), makeRemoveTx('att-2')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 2, txes)).toBe(true)
      })

      it('should return false (not empty) when value is 1 and txes has 1 TxRemoveDoc and 1 TxCreateDoc', async () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1'), makeCreateTx('att-2')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 1, txes)).toBe(false)
      })

      it('should return true (empty) when a doc is created and then removed in the same tx batch', async () => {
        const h = createHierarchy()
        const txes = [makeCreateTx('att-temp'), makeRemoveTx('att-temp')]
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 0, txes)).toBe(true)
      })

      it('should ignore TxCreateDoc and TxRemoveDoc for different tasks or different collections', async () => {
        const h = createHierarchy()
        const otherTaskTx = makeCreateTx('att-1', 'other-task-id')
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 0, [otherTaskTx])).toBe(true)

        const otherCollectionTx = makeCreateTx('att-2', 'task-1', 'labels')
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 0, [otherCollectionTx])).toBe(true)

        const otherTaskRemoveTx = makeRemoveTx('att-3', 'other-task-id')
        expect(await isEmptyAttribute(h, taskDoc, collectionAttr, 1, [otherTaskRemoveTx])).toBe(false)
      })

      it('should validate FieldRequired properly with context.txes', async () => {
        const client = createMockValidatorClient({
          attributes: {
            attachments: collectionAttr
          }
        })
        const clientHierarchy = client.getHierarchy()
        jest.spyOn(clientHierarchy, 'isDerived').mockImplementation((c: any, parent: any) => {
          return c === parent || parent === core.class.Collection
        })

        // Task with empty attachments (undefined) - should fail without txes
        const taskWithoutAtt = { ...taskDoc, attachments: undefined } as unknown as Task
        const resultFail = await FieldRequired(client, taskWithoutAtt, dummyTransition, {
          fields: [{ fieldKey: 'attachments' }]
        })
        expect(resultFail.ok).toBe(false)

        // Task with empty attachments + create tx in context - should pass
        const resultPass = await FieldRequired(
          client,
          taskWithoutAtt,
          dummyTransition,
          { fields: [{ fieldKey: 'attachments' }] },
          { txes: [makeCreateTx('att-new')] }
        )
        expect(resultPass.ok).toBe(true)

        // Task with 1 attachment + remove tx in context - should fail
        const taskWith1Att = { ...taskDoc, attachments: 1 } as unknown as Task
        const resultRemovedFail = await FieldRequired(
          client,
          taskWith1Att,
          dummyTransition,
          { fields: [{ fieldKey: 'attachments' }] },
          { txes: [makeRemoveTx('att-1')] }
        )
        expect(resultRemovedFail.ok).toBe(false)
      })
    })

    describe('TypeReportedTime attribute', () => {
      const reportedTimeAttr: AnyAttribute = {
        _id: 'tracker:class:Issue_reportedTime',
        _class: core.class.Attribute,
        attributeOf: tracker.class.Issue,
        name: 'reportedTime',
        label: 'ReportedTime',
        type: {
          _class: tracker.class.TypeReportedTime,
          label: 'ReportedTime',
          icon: 'core:icon:Time'
        }
      } as unknown as AnyAttribute

      function createHierarchy (): Hierarchy {
        return {
          isDerived: jest.fn((c: any, parent: any) => c === parent || parent === tracker.class.TypeReportedTime),
          findAttribute: jest.fn(),
          as: jest.fn()
        } as any
      }

      function makeCreateReportTx (
        objectId: string,
        taskId: string = 'task-1',
        value: number = 8
      ): TxCreateDoc<AttachedDoc> {
        return {
          _id: `tx-create-${objectId}`,
          _class: core.class.TxCreateDoc,
          space: 'space-1',
          objectId,
          objectClass: tracker.class.TimeSpendReport,
          objectSpace: 'space-1',
          attachedTo: taskId,
          collection: 'reports',
          attributes: {
            attachedTo: taskId,
            collection: 'reports',
            value
          },
          modifiedBy: 'user-1',
          modifiedOn: Date.now()
        } as any
      }

      function makeUpdateReportTx (
        objectId: string,
        taskId: string = 'task-1',
        value: number = 4
      ): TxUpdateDoc<AttachedDoc> {
        return {
          _id: `tx-update-${objectId}`,
          _class: core.class.TxUpdateDoc,
          space: 'space-1',
          objectId,
          objectClass: tracker.class.TimeSpendReport,
          objectSpace: 'space-1',
          attachedTo: taskId,
          collection: 'reports',
          operations: {
            value
          },
          modifiedBy: 'user-1',
          modifiedOn: Date.now()
        } as any
      }

      function makeRemoveReportTx (objectId: string, taskId: string = 'task-1'): TxRemoveDoc<AttachedDoc> {
        return {
          _id: `tx-remove-${objectId}`,
          _class: core.class.TxRemoveDoc,
          space: 'space-1',
          objectId,
          objectClass: tracker.class.TimeSpendReport,
          objectSpace: 'space-1',
          attachedTo: taskId,
          collection: 'reports',
          modifiedBy: 'user-1',
          modifiedOn: Date.now()
        } as any
      }

      it('should return true (empty) when value is 0 and no txes exist', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 0, [])).toBe(true)
      })

      it('should return true (empty) when value is undefined and task has 0 reportedTime', async () => {
        const h = createHierarchy()
        const taskWithZeroTime = { ...taskDoc, reportedTime: 0 } as unknown as Task
        expect(await isEmptyAttribute(h, taskWithZeroTime, reportedTimeAttr, undefined, [])).toBe(true)
      })

      it('should return false (not empty) when value is positive number without txes', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 5, [])).toBe(false)
      })

      it('should return false (not empty) when value is 0 but txes has TxCreateDoc for TimeSpendReport', async () => {
        const h = createHierarchy()
        const txes = [makeCreateReportTx('rep-1', 'task-1', 8)]
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 0, txes)).toBe(false)
      })

      it('should return true (empty) when value is 0 and txes has TxCreateDoc with value 0', async () => {
        const h = createHierarchy()
        const txes = [makeCreateReportTx('rep-1', 'task-1', 0)]
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 0, txes)).toBe(true)
      })

      it('should return true (empty) when report is created and then removed in the same tx batch', async () => {
        const h = createHierarchy()
        const txes = [makeCreateReportTx('rep-1', 'task-1', 8), makeRemoveReportTx('rep-1', 'task-1')]
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 0, txes)).toBe(true)
      })

      it('should return false (not empty) when report is created and updated in the same tx batch', async () => {
        const h = createHierarchy()
        const txes = [makeCreateReportTx('rep-1', 'task-1', 8), makeUpdateReportTx('rep-1', 'task-1', 4)]
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 0, txes)).toBe(false)
      })

      it('should ignore TimeSpendReport txes for other tasks', async () => {
        const h = createHierarchy()
        const otherTx = makeCreateReportTx('rep-1', 'other-task', 8)
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, 0, [otherTx])).toBe(true)
      })

      it('should return true (empty) when past report is removed resulting in 0 reported time', async () => {
        const h = createHierarchy()
        const mockClient = {
          findAll: jest.fn().mockResolvedValue([{ _id: 'rep-past-1', value: 5 }])
        } as unknown as ValidatorClient
        const taskWithPastTime = { ...taskDoc, reportedTime: 5 } as unknown as Task
        const txes = [makeRemoveReportTx('rep-past-1', 'task-1')]
        expect(await isEmptyAttribute(h, taskWithPastTime, reportedTimeAttr, 5, txes, mockClient)).toBe(true)
      })

      it('should return false (not empty) when past report is removed but remaining time > 0', async () => {
        const h = createHierarchy()
        const mockClient = {
          findAll: jest.fn().mockResolvedValue([{ _id: 'rep-past-1', value: 5 }])
        } as unknown as ValidatorClient
        const taskWithPastTime = { ...taskDoc, reportedTime: 8 } as unknown as Task
        const txes = [makeRemoveReportTx('rep-past-1', 'task-1')]
        expect(await isEmptyAttribute(h, taskWithPastTime, reportedTimeAttr, 8, txes, mockClient)).toBe(false)
      })

      it('should return false (not empty) when past report is updated to new positive value', async () => {
        const h = createHierarchy()
        const mockClient = {
          findAll: jest.fn().mockResolvedValue([{ _id: 'rep-past-1', value: 5 }])
        } as unknown as ValidatorClient
        const taskWithPastTime = { ...taskDoc, reportedTime: 5 } as unknown as Task
        const txes = [makeUpdateReportTx('rep-past-1', 'task-1', 2)]
        expect(await isEmptyAttribute(h, taskWithPastTime, reportedTimeAttr, 5, txes, mockClient)).toBe(false)
      })

      it('should return true (empty) when past report is updated to 0', async () => {
        const h = createHierarchy()
        const mockClient = {
          findAll: jest.fn().mockResolvedValue([{ _id: 'rep-past-1', value: 5 }])
        } as unknown as ValidatorClient
        const taskWithPastTime = { ...taskDoc, reportedTime: 5 } as unknown as Task
        const txes = [makeUpdateReportTx('rep-past-1', 'task-1', 0)]
        expect(await isEmptyAttribute(h, taskWithPastTime, reportedTimeAttr, 5, txes, mockClient)).toBe(true)
      })

      it('should support DraftTimeReportPayload object value', async () => {
        const h = createHierarchy()
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, { reportedTime: 8 }, [])).toBe(false)
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, { reportedTime: 0 }, [])).toBe(true)
        expect(await isEmptyAttribute(h, taskDoc, reportedTimeAttr, { draftReports: [{ value: 5 }] }, [])).toBe(false)
      })

      it('should validate FieldRequired properly with reportedTime and context.txes', async () => {
        const client = createMockValidatorClient({
          attributes: {
            reportedTime: reportedTimeAttr
          },
          statuses: [
            { _id: statusOpen, name: 'Backlog' },
            { _id: statusDone, name: 'Todo' }
          ]
        })
        const clientHierarchy = client.getHierarchy()
        jest.spyOn(clientHierarchy, 'isDerived').mockImplementation((c: any, parent: any) => {
          return c === parent || parent === tracker.class.TypeReportedTime
        })

        const taskWithZeroTime = { ...taskDoc, reportedTime: 0 } as unknown as Task

        // Fails without txes
        const resultFail = await FieldRequired(client, taskWithZeroTime, dummyTransition, {
          fields: [{ fieldKey: 'reportedTime' }]
        })
        expect(resultFail.ok).toBe(false)

        // Passes with TxCreateDoc<TimeSpendReport> in context.txes
        const resultPass = await FieldRequired(
          client,
          taskWithZeroTime,
          dummyTransition,
          { fields: [{ fieldKey: 'reportedTime' }] },
          { txes: [makeCreateReportTx('rep-1', 'task-1', 8)] }
        )
        expect(resultPass.ok).toBe(true)
      })
    })
  })

  describe('SubtaskStatus', () => {
    const taskDoc = {
      _id: 'task-1' as Ref<Task>,
      _class: task.class.Task
    } as unknown as Task

    it('should return ok: true when statuses prop is empty', async () => {
      const client = createMockValidatorClient()

      expect(await SubtaskStatus(client, taskDoc, dummyTransition, {})).toEqual({ ok: true })
      expect(await SubtaskStatus(client, taskDoc, dummyTransition, { statuses: {} })).toEqual({ ok: true })
    })

    it('should return ok: true when task has no subtasks', async () => {
      const client = createMockValidatorClient({ subtasks: [] })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return ok: true when all subtasks have allowed statuses', async () => {
      const client = createMockValidatorClient({
        subtasks: [
          { kind: taskTypeBug, status: statusDone },
          { kind: taskTypeFeature, status: statusDone }
        ]
      })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: {
          [taskTypeBug]: [statusDone],
          [taskTypeFeature]: [statusDone, statusInProgress]
        }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return validation error when a subtask is in an unallowed status', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }],
        statuses: [{ _id: statusDone, name: 'Done' }]
      })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({
        ok: false,
        reason: 'All subtasks must be in: Done.',
        reasonIntl: workflow.string.SubtaskStatusError,
        intlParams: { statuses: 'Done', count: 1, refs: { statuses: [statusDone] } }
      })
    })

    it('should return ok: true if subtask taskType is not defined in statuses map', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeFeature, status: statusOpen }]
      })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return ok: true when allowed statuses array is empty or contains nulls', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }]
      })

      expect(
        await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: [] }
        })
      ).toEqual({ ok: true })

      expect(
        await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: [null] }
        })
      ).toEqual({ ok: true })
    })

    it('should return ok: true when allowed statuses prop is not an array', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }]
      })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: { [taskTypeBug]: 'not-an-array' }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return ok: true when taskType is mapped to null or undefined in statuses', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }]
      })

      expect(
        await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: null }
        })
      ).toEqual({ ok: true })

      expect(
        await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: undefined }
        })
      ).toEqual({ ok: true })
    })

    it('should handle multiple allowed statuses in error message formatting', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }],
        statuses: [
          { _id: statusInProgress, name: 'In Progress' },
          { _id: statusDone, name: 'Done' }
        ]
      })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: { [taskTypeBug]: [statusInProgress, statusDone] }
      })

      expect(result).toEqual({
        ok: false,
        reason: 'All subtasks must be in: In Progress, Done.',
        reasonIntl: workflow.string.SubtaskStatusError,
        intlParams: {
          statuses: 'In Progress, Done',
          count: 2,
          refs: { statuses: [statusInProgress, statusDone] }
        }
      })
    })

    describe('categories', () => {
      it('should pass when a subtask status belongs to an allowed category', async () => {
        const client = createMockValidatorClient({
          subtasks: [{ kind: taskTypeBug, status: statusDone }],
          statuses: statusMeta
        })

        const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: {},
          categories: { [taskTypeBug]: [categoryWon, categoryLost] }
        })

        expect(result).toEqual({ ok: true })
      })

      it('should spell out allowed categories as the statuses of the task type', async () => {
        const client = createMockValidatorClient({
          subtasks: [{ kind: taskTypeBug, status: statusOpen }],
          statuses: statusMeta,
          categories: categoryMeta,
          taskTypes: taskTypeMeta
        })

        const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: [statusInProgress] },
          categories: { [taskTypeBug]: [categoryWon, categoryLost] }
        })

        expect(result).toEqual({
          ok: false,
          reason: 'All subtasks must be in: In Progress, Done, Canceled.',
          reasonIntl: workflow.string.SubtaskStatusError,
          intlParams: {
            statuses: 'In Progress, Done, Canceled',
            count: 3,
            refs: { statuses: [statusInProgress, statusDone, statusCanceled] }
          }
        })
      })

      it('should report no statuses when the task type has none in the allowed category', async () => {
        const client = createMockValidatorClient({
          subtasks: [{ kind: taskTypeBug, status: statusOpen }],
          statuses: statusMeta,
          taskTypes: [{ _id: taskTypeBug, statuses: [statusOpen, statusInProgress] }]
        })

        const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
          categories: { [taskTypeBug]: [categoryWon] }
        })

        expect(result).toMatchObject({ ok: false, intlParams: { statuses: '', count: 0 } })
      })

      it('should pass when a subtask is in an allowed status outside the allowed categories', async () => {
        const client = createMockValidatorClient({
          subtasks: [{ kind: taskTypeBug, status: statusInProgress }],
          statuses: statusMeta
        })

        const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: [statusInProgress] },
          categories: { [taskTypeBug]: [categoryWon] }
        })

        expect(result).toEqual({ ok: true })
      })

      it('should check task types without own settings against default categories', async () => {
        const client = createMockValidatorClient({
          subtasks: [{ kind: taskTypeFeature, status: statusOpen }],
          statuses: statusMeta,
          categories: categoryMeta,
          taskTypes: taskTypeMeta
        })

        const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: [statusDone] },
          defaultCategories: [categoryWon]
        })

        expect(result).toMatchObject({ ok: false, intlParams: { statuses: 'Done', count: 1 } })
      })

      it('should prefer own task type settings over default categories', async () => {
        const client = createMockValidatorClient({
          subtasks: [
            { kind: taskTypeBug, status: statusOpen },
            { kind: taskTypeFeature, status: statusInProgress }
          ],
          statuses: statusMeta
        })

        const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: null, [taskTypeFeature]: [statusInProgress] },
          defaultCategories: [categoryWon]
        })

        expect(result).toEqual({ ok: true })
      })
    })
  })

  describe('ParentStatus', () => {
    const taskDocWithParent = {
      _id: 'task-child' as Ref<Task>,
      _class: task.class.Task,
      attachedTo: 'task-parent' as Ref<Task>
    } as unknown as Task

    it('should return ok: true when statuses prop is empty', async () => {
      const client = createMockValidatorClient()

      expect(await ParentStatus(client, taskDocWithParent, dummyTransition, {})).toEqual({ ok: true })
      expect(await ParentStatus(client, taskDocWithParent, dummyTransition, { statuses: {} })).toEqual({ ok: true })
    })

    it('should return ok: true when task has no parent or parent is NoParent', async () => {
      const client = createMockValidatorClient()

      const taskWithoutParent = { ...taskDocWithParent, attachedTo: undefined } as unknown as Task
      expect(
        await ParentStatus(client, taskWithoutParent, dummyTransition, {
          statuses: { [taskTypeBug]: [statusDone] }
        })
      ).toEqual({ ok: true })

      const taskWithNoParentId = { ...taskDocWithParent, attachedTo: tracker.ids.NoParent } as unknown as Task
      expect(
        await ParentStatus(client, taskWithNoParentId, dummyTransition, {
          statuses: { [taskTypeBug]: [statusDone] }
        })
      ).toEqual({ ok: true })
    })

    it('should return ok: true when parent task is not found in database', async () => {
      const client = createMockValidatorClient({ parentTasks: [] })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return ok: true when parent task status is in allowed statuses', async () => {
      const client = createMockValidatorClient({
        parentTasks: [{ kind: taskTypeBug, status: statusDone }]
      })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return validation error when parent task status is not allowed', async () => {
      const client = createMockValidatorClient({
        parentTasks: [{ kind: taskTypeBug, status: statusOpen, identifier: 'TSK-1' }],
        statuses: [{ _id: statusDone, name: 'Done' }]
      })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({
        ok: false,
        reason: 'The parent task TSK-1 must be in: Done.',
        reasonIntl: workflow.string.ParentStatusError,
        intlParams: {
          parent: 'TSK-1',
          statuses: 'Done',
          count: 1,
          refs: { parent: 'task-parent', statuses: [statusDone] }
        }
      })
    })

    it('should return ok: true if parent task kind is not defined in statuses map', async () => {
      const client = createMockValidatorClient({
        parentTasks: [{ kind: taskTypeFeature, status: statusOpen }]
      })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({ ok: true })
    })
    it('should pass when parent status belongs to an allowed category', async () => {
      const client = createMockValidatorClient({
        parentTasks: [{ kind: taskTypeBug, status: statusOpen }],
        statuses: statusMeta
      })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: {},
        categories: { [taskTypeBug]: [categoryActive] }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should check a parent type without own settings against default categories', async () => {
      const client = createMockValidatorClient({
        parentTasks: [{ kind: taskTypeFeature, status: statusOpen, identifier: 'TSK-1' }],
        statuses: statusMeta,
        categories: categoryMeta,
        taskTypes: taskTypeMeta
      })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: {},
        defaultCategories: [categoryWon, categoryLost]
      })

      expect(result).toEqual({
        ok: false,
        reason: 'The parent task TSK-1 must be in: Done, Canceled.',
        reasonIntl: workflow.string.ParentStatusError,
        intlParams: {
          parent: 'TSK-1',
          statuses: 'Done, Canceled',
          count: 2,
          refs: { parent: 'task-parent', statuses: [statusDone, statusCanceled] }
        }
      })
    })
  })
})
