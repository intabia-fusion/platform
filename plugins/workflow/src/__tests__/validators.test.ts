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
  type TxCreateDoc,
  type TxRemoveDoc
} from '@hcengineering/core'
import task, { type Task, type TaskType } from '@hcengineering/task'
import tracker from '@hcengineering/tracker'

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
  statuses?: Array<Pick<Status, '_id' | 'name'>>
  subtasks?: Array<Pick<Task, 'kind' | 'status'>>
  parentTasks?: Array<Pick<Task, 'kind' | 'status'>>
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
  const taskTypeBug = 'task-type-bug' as Ref<TaskType>
  const taskTypeFeature = 'task-type-feature' as Ref<TaskType>

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
        reason: 'Field "Due Date" is required for transition Open, status-in-progress ➜ Done.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field: 'Due Date', transition: 'Open, status-in-progress ➜ Done' },
        intlParamsNotLocalized: { field: 'Due Date' }
      })
    })

    it('should handle transition with no `from` statuses (Any status)', async () => {
      const client = createMockValidatorClient({
        attributes: {
          due: { label: 'Due Date' }
        },
        statuses: [{ _id: statusDone, name: 'Done' }]
      })

      const transitionWithoutFrom: WorkflowTransition = {
        ...dummyTransition,
        from: null
      }

      const taskWithEmptyDue = { ...taskDoc, due: null } as unknown as Task

      const result = await FieldRequired(client, taskWithEmptyDue, transitionWithoutFrom, {
        fields: [{ fieldKey: 'due' }]
      })

      expect(result).toEqual({
        ok: false,
        reason: 'Field "Due Date" is required for transition Any ➜ Done.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field: 'Due Date', transition: 'Any ➜ Done' },
        intlParamsNotLocalized: { field: 'Due Date' }
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
        reason: 'Field "Due Date" is required for transition status-open ➜ status-done.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field: 'Due Date', transition: 'status-open ➜ status-done' },
        intlParamsNotLocalized: { field: 'Due Date' }
      })
    })

    it('should handle transition with empty `from` statuses array', async () => {
      const client = createMockValidatorClient({
        attributes: {
          due: { label: 'Due Date' }
        },
        statuses: [{ _id: statusDone, name: 'Done' }]
      })

      const transitionWithEmptyFrom: WorkflowTransition = {
        ...dummyTransition,
        from: []
      }

      const taskWithEmptyDue = { ...taskDoc, due: null } as unknown as Task

      const result = await FieldRequired(client, taskWithEmptyDue, transitionWithEmptyFrom, {
        fields: [{ fieldKey: 'due' }]
      })

      expect(result).toEqual({
        ok: false,
        reason: 'Field "Due Date" is required for transition Any ➜ Done.',
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field: 'Due Date', transition: 'Any ➜ Done' },
        intlParamsNotLocalized: { field: 'Due Date' }
      })
    })

    it('should validate mixin fields when mixin is specified', async () => {
      const mixinClass = 'tracker:class:ExtendedTask' as Ref<Class<any>>
      const taskWithMixin = {
        ...taskDoc,
        [mixinClass]: { extraInfo: 'Present' }
      } as unknown as Task

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
      } as unknown as Task

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

      it('should return true (empty) when value is undefined and no txes exist', () => {
        const h = createHierarchy()
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, undefined, [])).toBe(true)
      })

      it('should return true (empty) when value is 0 and no txes exist', () => {
        const h = createHierarchy()
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 0, [])).toBe(true)
      })

      it('should return true (empty) when value is empty array and no txes exist', () => {
        const h = createHierarchy()
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, [], [])).toBe(true)
      })

      it('should return false (not empty) when value is positive number without txes', () => {
        const h = createHierarchy()
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 1, [])).toBe(false)
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 3, [])).toBe(false)
      })

      it('should return false (not empty) when value is non-empty array without txes', () => {
        const h = createHierarchy()
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, ['att-1'], [])).toBe(false)
      })

      it('should return false (not empty) when value is 0 but txes has TxCreateDoc', () => {
        const h = createHierarchy()
        const txes = [makeCreateTx('att-new')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 0, txes)).toBe(false)
      })

      it('should return false (not empty) when value is undefined but txes has TxCreateDoc', () => {
        const h = createHierarchy()
        const txes = [makeCreateTx('att-new')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, undefined, txes)).toBe(false)
      })

      it('should return true (empty) when value is 1 but txes has TxRemoveDoc removing the only item', () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 1, txes)).toBe(true)
      })

      it('should return false (not empty) when value is 2 and txes has 1 TxRemoveDoc (1 item remaining)', () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 2, txes)).toBe(false)
      })

      it('should return true (empty) when value is 2 and txes has 2 TxRemoveDocs (0 items remaining)', () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1'), makeRemoveTx('att-2')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 2, txes)).toBe(true)
      })

      it('should return false (not empty) when value is 1 and txes has 1 TxRemoveDoc and 1 TxCreateDoc', () => {
        const h = createHierarchy()
        const txes = [makeRemoveTx('att-1'), makeCreateTx('att-2')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 1, txes)).toBe(false)
      })

      it('should return true (empty) when a doc is created and then removed in the same tx batch', () => {
        const h = createHierarchy()
        const txes = [makeCreateTx('att-temp'), makeRemoveTx('att-temp')]
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 0, txes)).toBe(true)
      })

      it('should ignore TxCreateDoc and TxRemoveDoc for different tasks or different collections', () => {
        const h = createHierarchy()
        const otherTaskTx = makeCreateTx('att-1', 'other-task-id')
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 0, [otherTaskTx])).toBe(true)

        const otherCollectionTx = makeCreateTx('att-2', 'task-1', 'labels')
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 0, [otherCollectionTx])).toBe(true)

        const otherTaskRemoveTx = makeRemoveTx('att-3', 'other-task-id')
        expect(isEmptyAttribute(h, taskDoc, collectionAttr, 1, [otherTaskRemoveTx])).toBe(false)
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
        reason: 'Subtasks must be in allowed statuses (Done) for transition status-open, status-in-progress ➜ Done.',
        reasonIntl: workflow.string.SubtaskStatusError,
        intlParams: { transition: 'status-open, status-in-progress ➜ Done', statuses: 'Done' }
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
        reason:
          'Subtasks must be in allowed statuses (In Progress, Done) for transition status-open, In Progress ➜ Done.',
        reasonIntl: workflow.string.SubtaskStatusError,
        intlParams: { transition: 'status-open, In Progress ➜ Done', statuses: 'In Progress, Done' }
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
        parentTasks: [{ kind: taskTypeBug, status: statusOpen }],
        statuses: [{ _id: statusDone, name: 'Done' }]
      })

      const result = await ParentStatus(client, taskDocWithParent, dummyTransition, {
        statuses: { [taskTypeBug]: [statusDone] }
      })

      expect(result).toEqual({
        ok: false,
        reason: 'Parent task must be in allowed statuses (Done) for transition status-open, status-in-progress ➜ Done.',
        reasonIntl: workflow.string.ParentStatusError,
        intlParams: { transition: 'status-open, status-in-progress ➜ Done', statuses: 'Done' }
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
  })
})
