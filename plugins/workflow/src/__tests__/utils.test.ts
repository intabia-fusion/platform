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

import core, { type Ref, type Status, type TxOperations } from '@hcengineering/core'
import task, { type Project, type ProjectType, type TaskType } from '@hcengineering/task'
import {
  createWorkflow,
  removeWorkflow,
  addTransition,
  removeTransition,
  updateTransition,
  addValidatorConfig,
  removeValidatorConfig,
  updateValidatorConfig,
  setWorkflow,
  findTransitionConflict,
  checkConflict,
  getTransitionConflict,
  hasTransitionConflict,
  hasSelfTransition,
  type Workflow,
  type WorkflowTransition,
  type WorkflowValidator
} from '../index'
import workflow from '../plugin'

describe('Workflow Utilities', () => {
  const projectTypeId = 'proj-type-1' as Ref<ProjectType>
  const taskTypeId = 'task-type-1' as Ref<TaskType>
  const workflowId = 'wf-1' as Ref<Workflow>
  const transitionId = 'trans-1' as Ref<WorkflowTransition>
  const statusOpen = 'status-open' as Ref<Status>
  const statusInProgress = 'status-in-progress' as Ref<Status>
  const statusDone = 'status-done' as Ref<Status>
  const validatorType = 'val-field-required' as Ref<WorkflowValidator>

  describe('Workflow CRUD', () => {
    it('should create a workflow', async () => {
      const mockClient: TxOperations = {
        createDoc: jest.fn().mockResolvedValue('wf-new-id' as Ref<Workflow>)
      } as any

      const res = await createWorkflow(mockClient, projectTypeId, taskTypeId, 'Default Workflow')

      expect(mockClient.createDoc).toHaveBeenCalledWith(workflow.class.Workflow, core.space.Workspace, {
        name: 'Default Workflow',
        projectType: projectTypeId,
        taskType: taskTypeId
      })
      expect(res).toBe('wf-new-id')
    })

    it('should remove a workflow', async () => {
      const mockClient: TxOperations = {
        removeDoc: jest.fn().mockResolvedValue(undefined)
      } as any

      await removeWorkflow(mockClient, workflowId)

      expect(mockClient.removeDoc).toHaveBeenCalledWith(workflow.class.Workflow, core.space.Workspace, workflowId)
    })
  })

  describe('Transition CRUD', () => {
    it('should add a transition', async () => {
      const mockClient: TxOperations = {
        findOne: jest.fn().mockResolvedValue(null),
        addCollection: jest.fn().mockResolvedValue('trans-new-id' as Ref<WorkflowTransition>)
      } as any

      const res = await addTransition(mockClient, workflowId, 'Start Work', [statusOpen], statusInProgress)

      expect(mockClient.findOne).toHaveBeenCalledWith(
        workflow.class.WorkflowTransition,
        { attachedTo: workflowId },
        { sort: { rank: 'desc' } }
      )
      expect(mockClient.addCollection).toHaveBeenCalledWith(
        workflow.class.WorkflowTransition,
        core.space.Workspace,
        workflowId,
        workflow.class.Workflow,
        'transitions',
        {
          name: 'Start Work',
          from: [statusOpen],
          to: statusInProgress,
          rank: 'a0'
        }
      )
      expect(res).toBe('trans-new-id')
    })

    it('should remove a transition', async () => {
      const mockClient: TxOperations = {
        removeCollection: jest.fn().mockResolvedValue(undefined)
      } as any

      await removeTransition(mockClient, workflowId, transitionId)

      expect(mockClient.removeCollection).toHaveBeenCalledWith(
        workflow.class.WorkflowTransition,
        core.space.Workspace,
        transitionId,
        workflowId,
        workflow.class.Workflow,
        'transitions'
      )
    })

    it('should update a transition', async () => {
      const mockClient: TxOperations = {
        updateCollection: jest.fn().mockResolvedValue(undefined)
      } as any

      await updateTransition(mockClient, workflowId, transitionId, { name: 'New Name' })

      expect(mockClient.updateCollection).toHaveBeenCalledWith(
        workflow.class.WorkflowTransition,
        core.space.Workspace,
        transitionId,
        workflowId,
        workflow.class.Workflow,
        'transitions',
        { name: 'New Name' }
      )
    })
  })

  describe('Validator Config CRUD', () => {
    let transition: WorkflowTransition

    const mockClient: TxOperations = {
      findOne: jest.fn().mockImplementation(async (cls, query) => {
        if (cls === workflow.class.WorkflowTransition && query._id === transitionId) {
          return transition
        }
        return null
      }),
      updateCollection: jest.fn().mockImplementation(async (cls, space, transId, wfId, wfCls, col, data) => {
        if (data.validators !== undefined) {
          transition.validators = data.validators
        } else if (data.$push?.validators != null) {
          transition.validators = [...(transition.validators ?? []), data.$push.validators]
        } else if (data.$pull?.validators != null) {
          const pullId = data.$pull.validators.id
          transition.validators = (transition.validators ?? []).filter((v) => v.id !== pullId)
        } else if (data.$update?.validators != null) {
          const queryId = data.$update.validators.$query?.id
          const updateData = data.$update.validators.$update
          transition.validators = (transition.validators ?? []).map((v) =>
            v.id === queryId ? { ...v, ...updateData } : v
          )
        }
      })
    } as any

    beforeEach(() => {
      transition = {
        _id: transitionId,
        _class: workflow.class.WorkflowTransition,
        space: core.space.Workspace,
        attachedTo: workflowId,
        attachedToClass: workflow.class.Workflow,
        collection: 'transitions',
        name: 'Start Work',
        from: null,
        to: statusInProgress,
        rank: 'a0' as any,
        modifiedOn: 0,
        modifiedBy: 'test-account' as any,
        validators: []
      }
    })

    it('should add validator config', async () => {
      const config = await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'custom-id-1',
        validator: validatorType,
        props: { field: 'assignee' }
      })

      expect(config.id).toBe('custom-id-1')
      expect(config.validator).toBe(validatorType)
      expect(config.props).toEqual({ field: 'assignee' })
      expect(transition.validators).toHaveLength(1)
      expect(transition.validators?.[0]).toEqual(config)
    })

    it('should throw error when adding duplicate validator config', async () => {
      await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-1',
        validator: validatorType,
        props: { field: 'assignee' }
      })

      await expect(
        addValidatorConfig(mockClient, workflowId, transitionId, {
          id: 'cfg-1',
          validator: validatorType,
          props: { field: 'assignee' }
        })
      ).rejects.toThrow(`Validator config already exists on transition ${transitionId}`)
    })

    it('should throw error when adding validator config if transition is not found', async () => {
      await expect(
        addValidatorConfig(mockClient, workflowId, 'non-existent' as any, {
          id: 'cfg-1',
          validator: validatorType,
          props: {}
        })
      ).rejects.toThrow('Transition non-existent not found')
    })

    it('should allow multiple validator configs of the same validator type', async () => {
      const config1 = await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-1',
        validator: validatorType,
        props: { field: 'assignee' }
      })
      const config2 = await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-2',
        validator: validatorType,
        props: { field: 'dueDate' }
      })

      expect(config1.id).not.toEqual(config2.id)
      expect(transition.validators).toHaveLength(2)
      expect(transition.validators?.[0].props).toEqual({ field: 'assignee' })
      expect(transition.validators?.[1].props).toEqual({ field: 'dueDate' })
    })

    it('should update specific validator config by id', async () => {
      const config1 = await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-1',
        validator: validatorType,
        props: { field: 'assignee' }
      })
      await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-2',
        validator: validatorType,
        props: { field: 'dueDate' }
      })

      await updateValidatorConfig(mockClient, workflowId, transitionId, config1.id, {
        props: { field: 'assignee', required: true }
      })

      expect(transition.validators?.[0].props).toEqual({ field: 'assignee', required: true })
      expect(transition.validators?.[1].props).toEqual({ field: 'dueDate' })
    })

    it('should throw error when updating validator config if transition is not found', async () => {
      await expect(updateValidatorConfig(mockClient, workflowId, 'non-existent' as any, 'cfg-1', {})).rejects.toThrow(
        'Transition non-existent not found'
      )
    })

    it('should remove specific validator config by id', async () => {
      const config1 = await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-1',
        validator: validatorType,
        props: { field: 'assignee' }
      })
      const config2 = await addValidatorConfig(mockClient, workflowId, transitionId, {
        id: 'cfg-2',
        validator: validatorType,
        props: { field: 'dueDate' }
      })

      await removeValidatorConfig(mockClient, workflowId, transitionId, config1.id)

      expect(transition.validators).toHaveLength(1)
      expect(transition.validators?.[0].id).toEqual(config2.id)
    })

    it('should throw error when removing validator config if transition is not found', async () => {
      await expect(removeValidatorConfig(mockClient, workflowId, 'non-existent' as any, 'cfg-1')).rejects.toThrow(
        'Transition non-existent not found'
      )
    })
  })

  describe('setWorkflow', () => {
    it('should create mixin when project does not have ProjectWorkflow mixin', async () => {
      const project: Project = {
        _id: 'proj-1' as any,
        _class: task.class.Project,
        space: core.space.Workspace,
        name: 'Project 1',
        modifiedOn: 0,
        modifiedBy: 'test' as any
      } as any

      const mockHierarchy = {
        as: jest.fn().mockReturnValue({ workflows: {} }),
        hasMixin: jest.fn().mockReturnValue(false)
      }

      const mockClient: TxOperations = {
        getHierarchy: jest.fn().mockReturnValue(mockHierarchy),
        createMixin: jest.fn().mockResolvedValue(undefined),
        updateMixin: jest.fn().mockResolvedValue(undefined)
      } as any

      await setWorkflow(mockClient, project, taskTypeId, workflowId)

      expect(mockClient.createMixin).toHaveBeenCalledWith(
        project._id,
        project._class,
        project.space,
        workflow.mixin.ProjectWorkflow,
        { workflows: { [taskTypeId]: workflowId } }
      )
    })

    it('should update mixin when project already has ProjectWorkflow mixin', async () => {
      const project: Project = {
        _id: 'proj-1' as any,
        _class: task.class.Project,
        space: core.space.Workspace,
        name: 'Project 1',
        modifiedOn: 0,
        modifiedBy: 'test' as any
      } as any

      const mockHierarchy = {
        as: jest.fn().mockReturnValue({ workflows: { existingType: 'wf-old' } }),
        hasMixin: jest.fn().mockReturnValue(true)
      }

      const mockClient: TxOperations = {
        getHierarchy: jest.fn().mockReturnValue(mockHierarchy),
        updateMixin: jest.fn().mockResolvedValue(undefined)
      } as any

      await setWorkflow(mockClient, project, taskTypeId, workflowId)

      expect(mockClient.updateMixin).toHaveBeenCalledWith(
        project._id,
        project._class,
        project.space,
        workflow.mixin.ProjectWorkflow,
        { workflows: { existingType: 'wf-old', [taskTypeId]: workflowId } }
      )
    })

    it('should remove workflow mapping when workflowId is null', async () => {
      const project: Project = {
        _id: 'proj-1' as any,
        _class: task.class.Project,
        space: core.space.Workspace,
        name: 'Project 1',
        modifiedOn: 0,
        modifiedBy: 'test' as any
      } as any

      const mockHierarchy = {
        as: jest.fn().mockReturnValue({ workflows: { [taskTypeId]: workflowId, otherType: 'wf-2' } }),
        hasMixin: jest.fn().mockReturnValue(true)
      }

      const mockClient: TxOperations = {
        getHierarchy: jest.fn().mockReturnValue(mockHierarchy),
        updateMixin: jest.fn().mockResolvedValue(undefined)
      } as any

      await setWorkflow(mockClient, project, taskTypeId, null)

      expect(mockClient.updateMixin).toHaveBeenCalledWith(
        project._id,
        project._class,
        project.space,
        workflow.mixin.ProjectWorkflow,
        { workflows: { otherType: 'wf-2' } }
      )
    })
  })

  describe('Conflict Utilities', () => {
    const transitionOpenToInProgress: WorkflowTransition = {
      _id: 't-1' as Ref<WorkflowTransition>,
      _class: workflow.class.WorkflowTransition,
      space: core.space.Workspace,
      attachedTo: workflowId,
      attachedToClass: workflow.class.Workflow,
      collection: 'transitions',
      name: 'Start',
      from: [statusOpen],
      to: statusInProgress,
      rank: 'a0' as any,
      modifiedOn: 0,
      modifiedBy: 'test' as any
    }

    it('findTransitionConflict should return null when target status differs', () => {
      const t1 = { from: [statusOpen], to: statusInProgress }
      const t2 = { from: [statusOpen], to: statusDone }
      expect(findTransitionConflict(t1, t2)).toBeNull()
    })

    it('findTransitionConflict should return "null" when both from arrays are null/empty to same target status', () => {
      const t1 = { from: null, to: statusInProgress }
      const t2 = { from: [], to: statusInProgress }
      expect(findTransitionConflict(t1, t2)).toBe('null')
    })

    it('findTransitionConflict should return intersecting status when target status is same and from arrays overlap', () => {
      const t1 = { from: [statusOpen, statusDone], to: statusInProgress }
      const t2 = { from: [statusOpen], to: statusInProgress }
      expect(findTransitionConflict(t1, t2)).toBe(statusOpen)
    })

    it('checkConflict should correctly return boolean conflict status', () => {
      const t1 = { from: [statusOpen], to: statusInProgress }
      const t2 = { from: [statusOpen], to: statusInProgress }
      const t3 = { from: [statusDone], to: statusInProgress }

      expect(checkConflict(t1, t2)).toBe(true)
      expect(checkConflict(t1, t3)).toBe(false)
    })

    it('getTransitionConflict should find conflicting transition', () => {
      const newTrans = { from: [statusOpen], to: statusInProgress }
      const conflict = getTransitionConflict(newTrans, [transitionOpenToInProgress])

      expect(conflict).not.toBeNull()
      expect(conflict?.transition._id).toBe('t-1')
      expect(conflict?.status).toBe(statusOpen)
    })

    it('getTransitionConflict should ignore self when _id matches', () => {
      const newTrans = { _id: 't-1' as Ref<WorkflowTransition>, from: [statusOpen], to: statusInProgress }
      const conflict = getTransitionConflict(newTrans, [transitionOpenToInProgress])

      expect(conflict).toBeNull()
    })

    it('hasTransitionConflict should return boolean conflict state', () => {
      const newTrans1 = { from: [statusOpen], to: statusInProgress }
      const newTrans2 = { from: [statusDone], to: statusInProgress }

      expect(hasTransitionConflict(newTrans1, [transitionOpenToInProgress])).toBe(true)
      expect(hasTransitionConflict(newTrans2, [transitionOpenToInProgress])).toBe(false)
    })

    it('hasSelfTransition should correctly identify self transitions', () => {
      expect(hasSelfTransition({ from: [statusOpen, statusInProgress], to: statusInProgress })).toBe(true)
      expect(hasSelfTransition({ from: [statusOpen], to: statusInProgress })).toBe(false)
      expect(hasSelfTransition({ from: null, to: statusInProgress })).toBe(false)
    })
  })
})
