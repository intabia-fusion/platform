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
  type AnyAttribute,
  Hierarchy,
  type Ref,
  SortingOrder,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import task from '@hcengineering/task'

import workflow from '../plugin'
import type {
  Screen,
  ScreenRequestConfig,
  Workflow,
  WorkflowRequest,
  WorkflowRule,
  WorkflowRuleConfig
} from '../schema'
import {
  NameResolver,
  TaskTypeToken,
  buildResolver,
  remap
} from './resolver'
import { extractRuleFieldReferences } from './utils'
import {
  type AttributeConfig,
  type RuleConfig,
  type ScreenConfig,
  type ScreenTabConfig,
  type StatusConfig,
  type WorkflowConfig,
  type WorkflowConfigEntry,
  type WorkflowExportOptions,
  WorkflowConfigVersion
} from './types'

function isScreenRequestConfig (
  h: Hierarchy,
  rule: WorkflowRuleConfig<WorkflowRequest>
): rule is ScreenRequestConfig {
  return (
    h.isDerived(rule.ruleClass, workflow.class.WorkflowRequest) && rule.rule === workflow.request.ScreenRequest
  )
}

function exportRules<TRule extends WorkflowRule> (
  rules: WorkflowRuleConfig<TRule>[] | undefined,
  resolver: NameResolver
): RuleConfig<TRule>[] | undefined {
  if (rules === undefined || rules.length === 0) return undefined
  // No unresolved list here: export turns refs into tokens, it never has to resolve one.
  return rules.map((r) => ({
    id: r.id,
    rule: r.rule,
    ruleClass: r.ruleClass,
    props: remap(r.props ?? {}, resolver.toToken)
  }))
}

/**
 * Exports a single workflow, its transitions, rules, and referenced screens into a portable config.
 */
export async function exportWorkflow (
  client: TxOperations,
  workflowId: Ref<Workflow>,
  options: WorkflowExportOptions
): Promise<WorkflowConfig> {
  const wf = await client.findOne(workflow.class.Workflow, { _id: workflowId })
  if (wf == null) {
    throw new Error(`Workflow ${workflowId} not found`)
  }

  const resolver = await buildResolver(client, wf.projectType)

  const transitions = await client.findAll(
    workflow.class.WorkflowTransition,
    { attachedTo: workflowId },
    { sort: { rank: SortingOrder.Ascending } }
  )

  const h = client.getHierarchy()

  // Find all screens referenced by this workflow
  const referencedScreenRefs = new Set<Ref<Screen>>()
  for (const t of transitions) {
    for (const r of t.requests ?? []) {
      if (isScreenRequestConfig(h, r)) {
        referencedScreenRefs.add(r.props.screen)
      }
    }
  }

  const screens: ScreenConfig[] = []
  if (referencedScreenRefs.size > 0) {
    const screenDocs = await client.findAll(workflow.class.Screen, { _id: { $in: Array.from(referencedScreenRefs) } })
    for (const sc of screenDocs) {
      const tabs = await client.findAll(workflow.class.ScreenTab, { attachedTo: sc._id }, { sort: { rank: SortingOrder.Ascending } })
      const tabConfigs: ScreenTabConfig[] = []
      for (const tab of tabs) {
        const fields = await client.findAll(workflow.class.ScreenField, { attachedTo: tab._id }, { sort: { rank: SortingOrder.Ascending } })
        tabConfigs.push({
          name: tab.name,
          fields: fields.map((f) => ({
            attribute: f.attribute,
            fieldKey: f.fieldKey,
            mixin: f.mixin,
            required: f.required
          }))
        })
      }
      screens.push({
        id: sc._id,
        name: sc.name,
        description: sc.description,
        targetClass: sc.targetClass,
        tabs: tabConfigs
      })
    }
  }

  const workflowEntry: WorkflowConfigEntry = {
    id: wf._id,
    name: wf.name,
    taskTypeName: resolver.getName(wf.taskType, TaskTypeToken),
    taskTypeId: wf.taskType,
    initialStatuses: wf.initialStatuses,
    transitions: transitions.map((t) => ({
      id: t._id,
      name: t.name,
      from: t.from,
      to: t.to,
      requests: exportRules(t.requests, resolver),
      validators: exportRules(t.validators, resolver),
      postFunctions: exportRules(t.postFunctions, resolver)
    }))
  }

  const allWorkspaceStatuses = await client.findAll(core.class.Status, {})
  const statusDocById = new Map<Ref<Status>, Status>(allWorkspaceStatuses.map((s) => [s._id, s]))

  const referencedStatusIds = new Set<Ref<Status>>()
  for (const s of wf.initialStatuses ?? []) referencedStatusIds.add(s)
  for (const t of transitions) {
    if (t.to !== undefined) referencedStatusIds.add(t.to)
    for (const f of t.from ?? []) referencedStatusIds.add(f)
  }

  const statusConfigs: StatusConfig[] = []
  for (const id of referencedStatusIds) {
    const doc = statusDocById.get(id)
    if (doc !== undefined) {
      statusConfigs.push({
        id: doc._id,
        name: doc.name,
        color: doc.color,
        category: doc.category
      })
    }
  }

  const referencedAttributeIds = new Set<Ref<AnyAttribute>>()
  for (const sc of screens) {
    for (const tab of sc.tabs ?? []) {
      for (const f of tab.fields ?? []) {
        referencedAttributeIds.add(f.attribute)
      }
    }
  }

  for (const t of transitions) {
    for (const r of [...(t.validators ?? []), ...(t.postFunctions ?? [])]) {
      for (const f of extractRuleFieldReferences(r.rule, r.props)) {
        if (f.attribute !== undefined) {
          referencedAttributeIds.add(f.attribute)
        }
      }
    }
  }

  const attributeConfigs: AttributeConfig[] = []
  if (referencedAttributeIds.size > 0) {
    const hierarchy = client.getHierarchy()
    const taskTypeDoc = await client.findOne(task.class.TaskType, { _id: wf.taskType })
    const targetClass = taskTypeDoc?.targetClass ?? task.class.Task
    const allAttributes = hierarchy.getAllAttributes(targetClass, core.class.Doc)
    const attributeById = new Map<Ref<AnyAttribute>, AnyAttribute>()
    for (const attr of allAttributes.values()) {
      attributeById.set(attr._id, attr)
    }

    for (const id of referencedAttributeIds) {
      const attr = attributeById.get(id)
      if (attr !== undefined) {
        attributeConfigs.push({
          id: attr._id,
          name: attr.name,
          label: attr.label,
          type: attr.type,
          isCustom: attr.isCustom
        })
      }
    }
  }

  return {
    version: WorkflowConfigVersion,
    exportDate: new Date().toISOString(),
    workspace: options.workspace,
    projectTypeId: options.projectTypeId,
    screens: screens.length > 0 ? screens : undefined,
    statuses: statusConfigs.length > 0 ? statusConfigs : undefined,
    attributes: attributeConfigs.length > 0 ? attributeConfigs : undefined,
    workflows: [workflowEntry]
  }
}
