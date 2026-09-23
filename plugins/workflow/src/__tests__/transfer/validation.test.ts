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
import { getEmbeddedLabel } from '@hcengineering/platform'
import task from '@hcengineering/task'

import workflow from '../../plugin'
import type { WorkflowTransition } from '../../schema'
import {
  checkWorkflowCompatibility,
  findOrCreateStatus,
  getAttributeTypeProblem,
  importWorkflowConfig,
  normalizeAttributeName,
  normalizeLabel,
  sanitizeWorkflowConfig,
  type WorkflowConfig
} from '../../transfer'
import { createMockTx, projectTypeId, statusOpenId, targetTaskTypeId, taskTypeId, ws1 } from './fixtures'

/** Shape of a config produced by the Jira migration tool. */
function jiraConfig (): any {
  return {
    version: 1,
    exportDate: '2026-09-17T06:21:36.858019Z',
    workspace: '',
    projectTypeId: '',
    statuses: [
      { id: 'status-backlog', name: 'Backlog', color: 9, category: 'task:statusCategory:UnStarted' },
      { id: 'status-broken', name: 'Broken', color: 'red', category: 'jira:statusCategory:Nope' },
      { id: 'status-nameless', color: 1 }
    ],
    attributes: [
      {
        id: 'attr-customfield-11001',
        name: 'Intangible asset',
        type: { _class: 'core:class:TypeString' },
        isCustom: true
      },
      { id: 'attr-no-name', type: { _class: 'core:class:TypeString' } }
    ],
    enums: [
      { id: 'enum-resolution', name: 'Resolution', enumValues: ['Done', 'Done', ' ', 'Declined', 42] },
      { id: 'enum-empty', name: 'Empty', enumValues: [] }
    ],
    workflows: [
      {
        id: 'workflow-bugs',
        name: 'IST Development WF (Bugs)',
        taskTypeName: 'Issue',
        taskTypeId: '',
        initialStatuses: ['status-backlog'],
        transitions: [
          {
            id: 'transition-inprogress',
            name: 'InProgress',
            from: ['status-backlog'],
            to: 'status-backlog',
            validators: [
              {
                id: 'v-1',
                rule: 'workflow:validator:FieldRequired',
                ruleClass: 'anything:from:the:file',
                props: { fields: [{ attribute: 'attr-customfield-11001', fieldKey: 'customfield_11001' }] }
              },
              { id: 'v-2', rule: 'jira:validator:Unknown', ruleClass: 'workflow:class:WorkflowValidator', props: {} },
              // A post-function listed as a validator belongs to another section
              { id: 'v-3', rule: 'workflow:postFunction:ClearFieldValue', props: {} }
            ],
            conditions: [{ id: 'c-1', rule: 'workflow:condition:SubtasksInStatus', props: { statusIds: ['6'] } }]
          },
          { id: 'transition-bad-from', name: 'Bad from', from: [42], to: 'status-backlog' },
          { id: 'transition-no-to', name: 'No target' }
        ]
      },
      { id: 'workflow-nameless' }
    ]
  }
}

describe('Workflow config sanitizing', () => {
  it('drops malformed entries, unknown rules and conditions and reports them', () => {
    const client = createMockTx()
    const { config, warnings } = sanitizeWorkflowConfig(client, jiraConfig())

    expect(config.workflows.map((w) => w.name)).toEqual(['IST Development WF (Bugs)'])
    const transitions = config.workflows[0].transitions ?? []
    expect(transitions.map((t) => t.id)).toEqual(['transition-inprogress'])

    const validators = transitions[0].validators ?? []
    expect(validators.map((v) => v.rule)).toEqual([workflow.validator.FieldRequired])
    expect(validators[0].ruleClass).toBe(workflow.class.WorkflowValidator)
    expect((transitions[0] as any).conditions).toBeUndefined()

    expect(warnings.map((i) => [i.kind, i.message, i.params])).toEqual(
      expect.arrayContaining([
        ['workflow', workflow.string.ImportWarningInvalidWorkflow, { name: 'workflow-nameless' }],
        ['transition', workflow.string.ImportWarningInvalidTransition, { name: 'Bad from' }],
        ['transition', workflow.string.ImportWarningInvalidTransition, { name: 'No target' }],
        ['rule', workflow.string.ImportWarningUnsupportedRule, { rule: 'Unknown', transition: 'InProgress' }],
        ['rule', workflow.string.ImportWarningUnsupportedRule, { rule: 'ClearFieldValue', transition: 'InProgress' }],
        [
          'condition',
          workflow.string.ImportWarningUnsupportedCondition,
          { rule: 'SubtasksInStatus', transition: 'InProgress' }
        ],
        ['status', workflow.string.ImportWarningUnknownStatusCategory, { name: 'Broken' }],
        ['status', workflow.string.ImportWarningInvalidStatus, { name: 'status-nameless' }],
        ['attribute', workflow.string.ImportWarningInvalidAttribute, { name: 'attr-no-name' }],
        ['enum', workflow.string.ImportWarningInvalidEnum, { name: 'Empty' }]
      ])
    )
  })

  it('cleans statuses, enums and attribute names and labels', () => {
    const client = createMockTx()
    const { config } = sanitizeWorkflowConfig(client, jiraConfig())

    expect(config.statuses).toEqual([
      { id: 'status-backlog', name: 'Backlog', color: 9, category: 'task:statusCategory:UnStarted' },
      { id: 'status-broken', name: 'Broken', color: undefined }
    ])
    expect(config.enums).toEqual([{ id: 'enum-resolution', name: 'Resolution', enumValues: ['Done', 'Declined'] }])
    expect(config.attributes?.[0]).toMatchObject({
      id: 'attr-customfield-11001',
      name: 'customfield_11001',
      label: getEmbeddedLabel('Intangible asset')
    })
  })

  it('does not modify the input', () => {
    const client = createMockTx()
    const input = jiraConfig()
    const snapshot = JSON.stringify(input)
    sanitizeWorkflowConfig(client, input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('rejects a config that is not usable as a whole', () => {
    const client = createMockTx()
    expect(() => sanitizeWorkflowConfig(client, null)).toThrow()
    expect(() => sanitizeWorkflowConfig(client, { ...jiraConfig(), version: 2 })).toThrow()
    expect(() => sanitizeWorkflowConfig(client, { ...jiraConfig(), workflows: [{}] })).toThrow()
  })

  it('accepts a config without workflows, e.g. screens only', () => {
    const client = createMockTx()
    const { config } = sanitizeWorkflowConfig(client, { ...jiraConfig(), workflows: [] })
    expect(config.workflows).toEqual([])
    expect(config.statuses?.length).toBeGreaterThan(0)
  })

  it('normalizes attribute names deterministically', () => {
    expect(normalizeAttributeName('priority')).toBe('priority')
    expect(normalizeAttributeName('select-color')).toBe('select-color')
    expect(normalizeAttributeName('Intangible asset', 'customfield_11001')).toBe('customfield_11001')
    expect(normalizeAttributeName('Intangible asset')).toBe('Intangible_asset')
    expect(normalizeAttributeName('a.b$c')).toBe('a_b_c')
    expect(normalizeAttributeName('2nd field')).toBe('_2nd_field')
    const cyrillic = normalizeAttributeName('Срок')
    expect(cyrillic).toMatch(/^custom_[a-z0-9]+$/)
    expect(normalizeAttributeName('Срок')).toBe(cyrillic)
  })

  it('embeds labels that are not intl strings', () => {
    expect(normalizeLabel('tracker:string:Title', 'x')).toBe('tracker:string:Title')
    expect(normalizeLabel(getEmbeddedLabel('Due'), 'x')).toBe(getEmbeddedLabel('Due'))
    expect(normalizeLabel('Due date', 'x')).toBe(getEmbeddedLabel('Due date'))
    expect(normalizeLabel(undefined, 'fallback')).toBe(getEmbeddedLabel('fallback'))
  })
})

describe('Importable attribute types', () => {
  const hierarchy = createMockTx().getHierarchy()

  it('accepts the types a user can create in class settings', () => {
    expect(getAttributeTypeProblem(hierarchy, { _class: core.class.TypeString } as any)).toBeUndefined()
    expect(
      getAttributeTypeProblem(hierarchy, {
        _class: core.class.ArrOf,
        of: { _class: core.class.EnumOf, of: 'e' }
      } as any)
    ).toBeUndefined()
  })

  it('rejects types that exist in the model but cannot be an attribute type', () => {
    expect(getAttributeTypeProblem(hierarchy, { _class: core.class.TypeIdentifier } as any)).toBe(
      workflow.string.UnresolvableTypeUnsupported
    )
    expect(getAttributeTypeProblem(hierarchy, { _class: core.class.Space } as any)).toBe(
      workflow.string.UnresolvableTypeUnsupported
    )
    expect(
      getAttributeTypeProblem(hierarchy, { _class: core.class.ArrOf, of: { _class: core.class.TypeString } } as any)
    ).toBe(workflow.string.UnresolvableTypeUnsupported)
  })

  it('rejects types referencing missing classes', () => {
    expect(getAttributeTypeProblem(hierarchy, { _class: 'non:existent:Class' } as any)).toBe(
      workflow.string.UnresolvableTypeMissingClass
    )
    expect(getAttributeTypeProblem(hierarchy, { _class: core.class.RefTo, to: 'non:existent:Class' } as any)).toBe(
      workflow.string.UnresolvableTypeMissingClass
    )
    expect(getAttributeTypeProblem(hierarchy, 'core:class:TypeString' as any)).toBe(
      workflow.string.UnresolvableTypeMissingClass
    )
  })
})

describe('Status creation on import', () => {
  const ofAttribute = 'attr-status' as any

  it('does not reuse a status that only shares the config id', async () => {
    const client = createMockTx({
      docs: [{ _id: 'status-done', _class: core.class.Status, name: 'Closed', ofAttribute, category: 'x' }] as any
    })
    const ref = await findOrCreateStatus(
      client,
      { id: 'status-done' as Ref<Status>, name: 'Done', color: 1, category: task.statusCategory.Won },
      ofAttribute
    )
    expect(ref).not.toBe('status-done')
    expect(client.createDoc).toHaveBeenCalledWith(
      core.class.Status,
      core.space.Model,
      expect.objectContaining({ name: 'Done', category: task.statusCategory.Won, ofAttribute })
    )
  })

  it('reuses the same status by id and by name, attribute and category', async () => {
    const client = createMockTx({
      docs: [
        { _id: 'status-own', _class: core.class.Status, name: 'Review', ofAttribute },
        { _id: 'status-b', _class: core.class.Status, name: 'Test', ofAttribute, category: task.statusCategory.Active },
        { _id: 'status-a', _class: core.class.Status, name: 'test', ofAttribute, category: task.statusCategory.Active }
      ] as any
    })
    expect(
      await findOrCreateStatus(client, { id: 'status-own' as Ref<Status>, name: 'review', color: 1 }, ofAttribute)
    ).toBe('status-own')
    // No category in the config falls back to Active; the smallest id wins among equal names
    expect(await findOrCreateStatus(client, { id: 'jira-5' as Ref<Status>, name: 'TEST', color: 1 }, ofAttribute)).toBe(
      'status-a'
    )
    expect(client.createDoc).not.toHaveBeenCalled()
  })
})

describe('Attribute references in imported rules', () => {
  it('resolves foreign attribute ids by field key and drops fields the file does not describe', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: 'wf-refs' as any,
          name: 'Wf with foreign refs',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-refs' as Ref<WorkflowTransition>,
              name: 'Refs',
              from: [statusOpenId],
              to: statusOpenId,
              postFunctions: [
                {
                  id: 'clear-1',
                  rule: workflow.postFunction.ClearFieldValue,
                  ruleClass: workflow.class.WorkflowPostFunction,
                  props: {
                    fields: [
                      { attribute: 'attr-assignee' as any, fieldKey: 'assignee' },
                      { attribute: 'attr-ghost' as any, fieldKey: 'ghost' }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    await importWorkflowConfig(client, projectTypeId, config, { targetTaskTypeId })

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
            props: { fields: [{ attribute: 'attr-assignee-id', fieldKey: 'assignee' }] }
          })
        ]
      })
    )
  })
})

describe('Attribute references in imported rules without a target task type', () => {
  it('drops fields whose attribute does not exist in the workspace', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: 'wf-ghost' as any,
          name: 'Wf with a ghost field',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-ghost' as Ref<WorkflowTransition>,
              name: 'Ghost',
              from: null,
              to: statusOpenId,
              postFunctions: [
                {
                  id: 'clear-ghost',
                  rule: workflow.postFunction.ClearFieldValue,
                  ruleClass: workflow.class.WorkflowPostFunction,
                  props: { fields: [{ attribute: 'attr-ghost' as any, fieldKey: 'ghost' }] }
                }
              ]
            }
          ]
        }
      ]
    }

    // No target task type: nothing is created, so the rule references an attribute nobody has
    await importWorkflowConfig(client, projectTypeId, config, { taskTypeMap: { [taskTypeId]: taskTypeId } as any })

    expect(client.updateCollection).not.toHaveBeenCalled()
  })
})

describe('Attributes the file does not describe', () => {
  it('reports them as not importable and never creates them', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: 'wf-undescribed' as any,
          name: 'Wf with an undescribed field',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-undescribed' as Ref<WorkflowTransition>,
              name: 'Undescribed',
              from: null,
              to: statusOpenId,
              validators: [
                {
                  id: 'req-undescribed',
                  rule: workflow.validator.FieldRequired,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: { fields: [{ attribute: 'attr-undescribed' as any, fieldKey: 'undescribed' }] }
                }
              ]
            }
          ]
        }
      ]
    }

    const report = await checkWorkflowCompatibility(client, config, targetTaskTypeId)
    expect(report.attributes.find((a) => a.fieldKey === 'undescribed')).toMatchObject({
      unresolvable: true,
      unresolvableReason: workflow.string.UnresolvableNotDescribed
    })

    // The wizard defaults every unmatched field to "create"
    await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      attributeResolutions: { undescribed: { action: 'create' } }
    })
    const createdAttributes = (client.createDoc as jest.Mock).mock.calls.filter(([cls]) => cls === core.class.Attribute)
    expect(createdAttributes).toHaveLength(0)
    expect(client.updateCollection).not.toHaveBeenCalled()
  })
})

describe('Findings of the second pass', () => {
  it('drops attributes without a type, repeated status ids and junk mixin fields, and fixes type labels', () => {
    const client = createMockTx()
    const input = jiraConfig()
    input.statuses.push({ id: 'status-backlog', name: 'Other', category: 'task:statusCategory:ToDo' })
    input.attributes.push(
      { id: 'attr-no-type', name: 'noType' },
      { id: 'attr-bad-type-label', name: 'badLabel', type: { _class: 'core:class:TypeString', label: 'Text' } }
    )
    input.mixins = [{ id: 'mixin-1', label: 'Jira fields', color: 'x', icon: 42, junk: { $where: 'x' } }]

    const { config, warnings } = sanitizeWorkflowConfig(client, input)

    expect(config.statuses?.filter((st) => st.id === 'status-backlog')).toEqual([
      expect.objectContaining({ name: 'Backlog' })
    ])
    expect(config.attributes?.map((a) => a.id)).toEqual(['attr-customfield-11001', 'attr-bad-type-label'])
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'attribute', params: { name: 'noType' } }),
        expect.objectContaining({ kind: 'status', params: { name: 'Other' } })
      ])
    )
    // A plain string label on the type would be translated on every render; the mock class has no label
    expect(config.attributes?.[1].type).toEqual({ _class: 'core:class:TypeString' })
    expect(config.mixins).toEqual([
      { id: 'mixin-1', label: getEmbeddedLabel('Jira fields'), icon: undefined, color: 'x', attributes: [] }
    ])
  })

  it('does not create an undescribed field even when it is mapped without a target', async () => {
    const client = createMockTx()
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: 'wf-map-no-target' as any,
          name: 'Wf with an empty mapping',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-map-no-target' as Ref<WorkflowTransition>,
              name: 'Map',
              from: null,
              to: statusOpenId,
              validators: [
                {
                  id: 'req-map-no-target',
                  rule: workflow.validator.FieldRequired,
                  ruleClass: workflow.class.WorkflowValidator,
                  props: { fields: [{ attribute: 'attr-x' as any, fieldKey: 'x' }] }
                }
              ]
            }
          ]
        }
      ]
    }

    await importWorkflowConfig(client, projectTypeId, config, {
      targetTaskTypeId,
      attributeResolutions: { x: { action: 'map' } }
    })
    const createdAttributes = (client.createDoc as jest.Mock).mock.calls.filter(([cls]) => cls === core.class.Attribute)
    expect(createdAttributes).toHaveLength(0)
  })

  it('does not accept a model doc that is not an attribute of the target class as a rule field', async () => {
    const client = createMockTx({
      docs: [
        { _id: 'attr-foreign', _class: core.class.Attribute, name: 'foreign', attributeOf: 'recruit:class:Vacancy' },
        { _id: 'not-an-attr', _class: core.class.Class }
      ] as any
    })
    const config: WorkflowConfig = {
      version: 1,
      exportDate: '',
      workspace: ws1,
      projectTypeId,
      workflows: [
        {
          id: 'wf-foreign' as any,
          name: 'Wf with foreign attributes',
          taskTypeName: 'Bug',
          taskTypeId,
          transitions: [
            {
              id: 'trans-foreign' as Ref<WorkflowTransition>,
              name: 'Foreign',
              from: null,
              to: statusOpenId,
              postFunctions: [
                {
                  id: 'clear-foreign',
                  rule: workflow.postFunction.ClearFieldValue,
                  ruleClass: workflow.class.WorkflowPostFunction,
                  props: {
                    fields: [
                      { attribute: 'attr-foreign' as any, fieldKey: 'foreign' },
                      { attribute: 'not-an-attr' as any, fieldKey: 'notAnAttr' }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }

    await importWorkflowConfig(client, projectTypeId, config, { taskTypeMap: { [taskTypeId]: taskTypeId } as any })
    expect(client.updateCollection).not.toHaveBeenCalled()
  })
})
