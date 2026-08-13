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

import core, { type Class, type Ref, type Status } from '@hcengineering/core'
import task, { type Task, type TaskType } from '@hcengineering/task'
import tracker from '@hcengineering/tracker'

import workflow from '../plugin'
import { isEmpty, FieldRequired, SubtaskStatus, ParentStatus } from '../validators'
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
    if (options?.attributes !== undefined && fieldKey in options.attributes) {
      return options.attributes[fieldKey]
    }
    return { label: fieldKey }
  })

  const as = jest.fn((doc: any, mixin: Ref<Class<any>>) => {
    return doc[mixin] ?? doc
  })

  const hierarchy = {
    findAttribute,
    as
  }

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
    getHierarchy: () => hierarchy as any,
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
    _id: 'trans-1' as any,
    name: 'Resolve Task',
    from: [statusOpen, statusInProgress],
    to: statusDone,
    rank: '0'
  } as unknown as WorkflowTransition

  describe('isEmpty', () => {
    it('should return true for undefined and null', () => {
      expect(isEmpty(undefined)).toBe(true)
      expect(isEmpty(null)).toBe(true)
    })

    it('should return true for empty or whitespace-only strings', () => {
      expect(isEmpty('')).toBe(true)
      expect(isEmpty('   ')).toBe(true)
      expect(isEmpty('\t\n')).toBe(true)
    })

    it('should return false for non-empty strings', () => {
      expect(isEmpty('hello')).toBe(false)
      expect(isEmpty('  a  ')).toBe(false)
    })

    it('should handle arrays correctly', () => {
      expect(isEmpty([])).toBe(true)
      expect(isEmpty([1])).toBe(false)
      expect(isEmpty([null])).toBe(false)
      expect(isEmpty([''])).toBe(false)
    })

    it('should handle Map and Set instances', () => {
      expect(isEmpty(new Map())).toBe(true)
      expect(isEmpty(new Set())).toBe(true)
      expect(isEmpty(new Map([['key', 'val']]))).toBe(false)
      expect(isEmpty(new Set([1]))).toBe(false)
    })

    it('should handle plain objects', () => {
      expect(isEmpty({})).toBe(true)
      expect(isEmpty({ key: 'val' })).toBe(false)
      expect(isEmpty({ key: undefined })).toBe(false)
    })

    it('should handle primitive non-string values correctly', () => {
      expect(isEmpty(0)).toBe(true)
      expect(isEmpty(42)).toBe(false)
      expect(isEmpty(NaN)).toBe(true)
      expect(isEmpty(false)).toBe(false)
      expect(isEmpty(true)).toBe(false)
      expect(isEmpty(Symbol('test'))).toBe(false)
      expect(isEmpty(() => {})).toBe(false)
    })
  })

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
        fields: [{ fieldKey: '' }, { fieldKey: null as any }]
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
          statuses: { [taskTypeBug]: [null as any] }
        })
      ).toEqual({ ok: true })
    })

    it('should return ok: true when allowed statuses prop is not an array', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }]
      })

      const result = await SubtaskStatus(client, taskDoc, dummyTransition, {
        statuses: { [taskTypeBug]: 'not-an-array' as any }
      })

      expect(result).toEqual({ ok: true })
    })

    it('should return ok: true when taskType is mapped to null or undefined in statuses', async () => {
      const client = createMockValidatorClient({
        subtasks: [{ kind: taskTypeBug, status: statusOpen }]
      })

      expect(
        await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: null as any }
        })
      ).toEqual({ ok: true })

      expect(
        await SubtaskStatus(client, taskDoc, dummyTransition, {
          statuses: { [taskTypeBug]: undefined as any }
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
