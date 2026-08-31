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

import core, { type Ref, type Status } from '@hcengineering/core'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import task from '@hcengineering/task'

import workflow from '../../plugin'
import type { Screen, WorkflowTransition } from '../../schema'
import { importWorkflowConfig, type WorkflowConfig } from '../../transfer'
import {
  createMockTx,
  projectTypeId,
  statusDoneId,
  statusOpenId,
  targetTaskTypeDoc,
  targetTaskTypeId,
  taskTypeId,
  workflowId,
  ws1
} from './fixtures'

describe('Workflow Import', () => {
  it('creates missing custom attributes when action is "create"', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf with custom field',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-1' as Ref<WorkflowTransition>,
              name: 'Step',
              from: [statusOpenId],
              to: statusDoneId,
              validators: [
                {
                  id: 'rule-val-1',
                  rule: workflow.validator.FieldRequired,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: {
                    fields: [{ fieldKey: 'missingField', attribute: 'attr-old' as any }]
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    const result = await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      attributeResolutions: {
        missingField: {
          action: 'create',
          label: getEmbeddedLabel('Missing Field')
        }
      }
    })

    expect(result.workflows[workflowId]).toBeDefined()
    expect(client.createDoc).toHaveBeenCalledWith(
      core.class.Attribute,
      core.space.Model,
      expect.objectContaining({
        isCustom: true
      })
    )
  })

  it('skips rules when attribute resolution action is "skip"', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf with skipped rule',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-2' as Ref<WorkflowTransition>,
              name: 'Step',
              from: [statusOpenId],
              to: statusDoneId,
              validators: [
                {
                  id: 'rule-val-2',
                  rule: workflow.validator.FieldRequired,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: {
                    fields: [{ fieldKey: 'fieldToSkip', attribute: 'attr-skip' as any }]
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    const result = await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      attributeResolutions: {
        fieldToSkip: {
          action: 'skip'
        }
      }
    })

    expect(result.workflows[workflowId]).toBeDefined()
    // Transition created without the skipped validator
    expect(client.updateCollection).not.toHaveBeenCalled()
  })

  it('handles unmapped source statuses by skipping affected transitions', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf with unmapped status',
          taskTypeName: 'Bug',
          taskTypeId,
          initialStatuses: [statusOpenId, 'status-qa' as Ref<Status>],
          transitions: [
            {
              id: 'trans-3' as Ref<WorkflowTransition>,
              name: 'Open -> Done',
              from: [statusOpenId],
              to: statusDoneId
            },
            {
              id: 'trans-4' as Ref<WorkflowTransition>,
              name: 'Send to QA',
              from: [statusOpenId],
              to: 'status-qa' as Ref<Status>
            },
            {
              id: 'trans-5' as Ref<WorkflowTransition>,
              name: 'QA -> Done',
              from: ['status-qa' as Ref<Status>],
              to: statusDoneId
            }
          ]
        }
      ]
    }

    const result = await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      statusMap: {
        [statusOpenId]: statusOpenId,
        [statusDoneId]: statusDoneId
        // 'status-qa' is unmapped / left undefined
      }
    })

    expect(result.workflows[workflowId]).toBeDefined()
    // Only 'Open -> Done' should be created because 'QA' is not mapped
    expect(result.transitions['trans-3' as Ref<WorkflowTransition>]).toBeDefined()
    expect(result.transitions['trans-4' as Ref<WorkflowTransition>]).toBeUndefined()
    expect(result.transitions['trans-5' as Ref<WorkflowTransition>]).toBeUndefined()
  })

  it('supports redirecting transitions from unmapped statuses', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf with redirect',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-6' as Ref<WorkflowTransition>,
              name: 'Send to QA',
              from: [statusOpenId],
              to: 'status-qa' as Ref<Status>
            }
          ]
        }
      ]
    }

    const result = await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      statusMap: {
        [statusOpenId]: statusOpenId
      },
      transitionResolutions: {
        ['trans-6' as Ref<WorkflowTransition>]: {
          action: 'redirect',
          targetToStatusId: statusDoneId
        }
      }
    })

    expect(result.workflows[workflowId]).toBeDefined()
    expect(result.transitions['trans-6' as Ref<WorkflowTransition>]).toBeDefined()
  })

  it('creates custom attribute preserving already formatted IntlString label', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf Intl Label',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-7' as Ref<WorkflowTransition>,
              name: 'Step',
              from: [statusOpenId],
              to: statusDoneId,
              validators: [
                {
                  id: 'rule-val-3',
                  rule: workflow.validator.FieldRequired,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: {
                    fields: [{ fieldKey: 'intlField', attribute: 'attr-intl' as any }]
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      attributeResolutions: {
        intlField: {
          action: 'create',
          label: 'plugin:string:AlreadyFormatted' as IntlString
        }
      }
    })

    expect(client.createDoc).toHaveBeenCalledWith(
      core.class.Attribute,
      core.space.Model,
      expect.objectContaining({
        label: 'plugin:string:AlreadyFormatted',
        isCustom: true
      })
    )
  })

  it('adapts screen targetClass to targetTaskType targetClass during import', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      screens: [
        {
          id: 'screen-1' as Ref<Screen>,
          name: 'Resolution Screen',
          targetClass: 'old:class:Doc' as any,
          tabs: [
            {
              name: 'Main',
              fields: [{ attribute: 'attr-1' as any, fieldKey: 'f1', required: true }]
            }
          ]
        }
      ],
      workflows: [
        {
          id: workflowId,
          name: 'Wf with Screen',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-8' as Ref<WorkflowTransition>,
              name: 'Resolve',
              from: [statusOpenId],
              to: statusDoneId
            }
          ]
        }
      ]
    }

    await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      copyScreens: true
    })

    expect(client.createDoc).toHaveBeenCalledWith(
      workflow.class.Screen,
      core.space.Workspace,
      expect.objectContaining({
        name: 'Resolution Screen',
        targetClass: targetTaskTypeDoc.targetClass ?? task.class.Task
      })
    )
  })

  it('generates unique screen name if screen with same name already exists', async () => {
    const existingScreen: Screen = {
      _id: 'existing-screen-1' as Ref<Screen>,
      _class: workflow.class.Screen,
      name: 'Resolution Screen',
      projectType: projectTypeId,
      targetClass: task.class.Task,
      space: core.space.Workspace,
      modifiedOn: 0,
      modifiedBy: '' as any
    }

    const client = createMockTx({ docs: [existingScreen] })
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      screens: [
        {
          id: 'screen-2' as Ref<Screen>,
          name: 'Resolution Screen',
          targetClass: task.class.Task,
          tabs: [{ name: 'Main', fields: [] }]
        }
      ],
      workflows: [
        {
          id: workflowId,
          name: 'Wf with duplicate screen name',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: []
        }
      ]
    }

    await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      copyScreens: true
    })

    expect(client.createDoc).toHaveBeenCalledWith(
      workflow.class.Screen,
      core.space.Workspace,
      expect.objectContaining({
        name: 'Resolution Screen (1)'
      })
    )
  })

  it('remaps target and source attribute references in UpdateFieldValue post-function', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf with UpdateFieldValue',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-update' as Ref<WorkflowTransition>,
              name: 'Apply',
              from: [statusOpenId],
              to: statusOpenId,
              postFunctions: [
                {
                  id: 'post-fn-1',
                  rule: workflow.postFunction.UpdateFieldValue,
                  ruleClass: workflow.class.WorkflowPostFunction,
                  props: {
                    fields: [
                      {
                        attribute: 'attr-source-target' as any,
                        fieldKey: 'targetField',
                        value: {
                          type: 'this',
                          attribute: 'attr-source-src' as any,
                          fieldKey: 'sourceField'
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    const targetAttr1 = 'attr-mapped-target' as any
    const targetAttr2 = 'attr-mapped-source' as any

    const result = await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      attributeResolutions: {
        targetField: { action: 'map', targetAttributeId: targetAttr1 },
        sourceField: { action: 'map', targetAttributeId: targetAttr2 }
      }
    })

    expect(result.workflows[workflowId]).toBeDefined()
    expect(client.updateCollection).toHaveBeenCalledWith(
      workflow.class.WorkflowTransition,
      core.space.Workspace,
      expect.anything(),
      expect.anything(),
      workflow.class.Workflow,
      'transitions',
      expect.objectContaining({
        postFunctions: [
          expect.objectContaining({
            props: {
              fields: [
                expect.objectContaining({
                  attribute: targetAttr1,
                  value: expect.objectContaining({
                    attribute: targetAttr2
                  })
                })
              ]
            }
          })
        ]
      })
    )
  })

  it('restores project workflow bindings from config.projects', async () => {
    const projectDoc = {
      _id: 'proj-1' as any,
      _class: task.class.Project,
      name: 'Mobile App',
      identifier: 'MOB',
      type: projectTypeId,
      space: core.space.Workspace,
      modifiedOn: 0,
      modifiedBy: '' as any
    }

    const client = createMockTx({ docs: [projectDoc] })
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Bug Workflow',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: []
        }
      ],
      projects: [
        {
          project: 'proj-1' as any,
          identifier: 'MOB',
          workflows: {
            Bug: 'Bug Workflow'
          }
        }
      ]
    }

    const result = await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId
    })

    expect(result.workflows[workflowId]).toBeDefined()
  })

  it('throws error on unresolved rule references in importRules', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '2026-08-31T00:00:00.000Z',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: workflowId,
          name: 'Wf with Unresolved Token',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-unresolved' as Ref<WorkflowTransition>,
              name: 'Step',
              from: [statusOpenId],
              to: statusOpenId,
              validators: [
                {
                  id: 'rule-unresolved',
                  rule: workflow.validator.FieldRequired,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: {
                    missingStatus: '$status:NonExistentStatus'
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    await expect(importWorkflowConfig(client, projectTypeId, config, { targetTaskTypeId })).rejects.toThrow(
      'Workflow import: could not resolve rule references: $status:NonExistentStatus'
    )
  })
})
