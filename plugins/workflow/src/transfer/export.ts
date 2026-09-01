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
  type Class,
  ClassifierKind,
  type Doc,
  type Enum,
  Hierarchy,
  type Mixin,
  type Ref,
  SortingOrder,
  type Status,
  type StatusCategory,
  type TxOperations
} from '@hcengineering/core'
import task, { type ProjectType } from '@hcengineering/task'

import workflow from '../plugin'
import type {
  Screen,
  ScreenRequestConfig,
  Workflow,
  WorkflowRequest,
  WorkflowRule,
  WorkflowRuleConfig
} from '../schema'
import { NameResolver, StatusToken, TaskTypeToken, buildResolver, identifierOf, remap } from './resolver'
import { extractRuleFieldReferences, getEnumRefFromType } from './utils'
import {
  type AttributeConfig,
  type ProjectWorkflowsConfig,
  type RuleConfig,
  type ScreenConfig,
  type ScreenTabConfig,
  type StatusConfig,
  type WorkflowConfig,
  type WorkflowConfigEntry,
  type WorkflowEnumConfig,
  type WorkflowExportOptions,
  type WorkflowMixinConfig,
  WorkflowConfigVersion
} from './types'

async function resolveEnumInfoForAttributes (
  client: TxOperations,
  attributes: AttributeConfig[]
): Promise<Map<Ref<Enum>, Enum>> {
  const enumIds = attributes.map((a) => getEnumRefFromType(a.type)).filter((id): id is Ref<Enum> => id !== undefined)
  if (enumIds.length === 0) return new Map()

  const enumDocs = await client.findAll(core.class.Enum, { _id: { $in: Array.from(new Set(enumIds)) } })
  const enumMap = new Map<Ref<Enum>, Enum>(enumDocs.map((e) => [e._id, e]))

  for (const attr of attributes) {
    const enumRef = getEnumRefFromType(attr.type)
    if (enumRef !== undefined) {
      const enumDoc = enumMap.get(enumRef)
      if (enumDoc !== undefined) {
        attr.enumName = enumDoc.name
        attr.enumValues = enumDoc.enumValues
      }
    }
  }

  return enumMap
}

function isScreenRequestConfig (h: Hierarchy, rule: WorkflowRuleConfig<WorkflowRequest>): rule is ScreenRequestConfig {
  return h.isDerived(rule.ruleClass, workflow.class.WorkflowRequest) && rule.rule === workflow.request.ScreenRequest
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
      const tabs = await client.findAll(
        workflow.class.ScreenTab,
        { attachedTo: sc._id },
        { sort: { rank: SortingOrder.Ascending } }
      )
      const tabConfigs: ScreenTabConfig[] = []
      for (const tab of tabs) {
        const fields = await client.findAll(
          workflow.class.ScreenField,
          { attachedTo: tab._id },
          { sort: { rank: SortingOrder.Ascending } }
        )
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
  const allCategories = await client.findAll(core.class.StatusCategory, {})
  const categoryOrderMap = new Map<Ref<StatusCategory>, number>()
  for (const cat of allCategories) {
    categoryOrderMap.set(cat._id, cat.order)
  }
  const statusDocById = new Map<Ref<Status>, Status>(allWorkspaceStatuses.map((s) => [s._id, s]))

  const taskTypeDoc =
    wf.taskType !== undefined ? await client.findOne(task.class.TaskType, { _id: wf.taskType }) : undefined
  const taskTypeStatusIndex = new Map<Ref<Status>, number>()
  if (taskTypeDoc?.statuses !== undefined) {
    taskTypeDoc.statuses.forEach((id, idx) => taskTypeStatusIndex.set(id, idx))
  }

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
  statusConfigs.sort((a, b) => {
    const idxA = taskTypeStatusIndex.get(a.id)
    const idxB = taskTypeStatusIndex.get(b.id)
    if (idxA !== undefined && idxB !== undefined) {
      return idxA - idxB
    }
    const catOrderA = a.category !== undefined ? (categoryOrderMap.get(a.category) ?? 99) : 99
    const catOrderB = b.category !== undefined ? (categoryOrderMap.get(b.category) ?? 99) : 99
    if (catOrderA !== catOrderB) return catOrderA - catOrderB
    if (idxA !== undefined) return -1
    if (idxB !== undefined) return 1
    return a.name.localeCompare(b.name)
  })

  const referencedAttributeIds = new Set<Ref<AnyAttribute>>()
  const referencedMixinIds = new Set<Ref<Mixin<Doc>>>()
  for (const sc of screens) {
    for (const tab of sc.tabs ?? []) {
      for (const f of tab.fields ?? []) {
        referencedAttributeIds.add(f.attribute)
        if (f.mixin !== undefined) {
          referencedMixinIds.add(f.mixin)
        }
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

  const targetClass = taskTypeDoc?.targetClass ?? task.class.Task
  const attributeConfigs = await collectAttributeConfigs(client, referencedAttributeIds, [targetClass])
  const mixinConfigs = await exportMixins(client, [targetClass], referencedMixinIds)

  const allReferencedEnums = new Map<Ref<Enum>, Enum>()
  for (const [k, v] of await resolveEnumInfoForAttributes(client, attributeConfigs)) {
    allReferencedEnums.set(k, v)
  }
  for (const m of mixinConfigs ?? []) {
    if (m.attributes !== undefined) {
      for (const [k, v] of await resolveEnumInfoForAttributes(client, m.attributes)) {
        allReferencedEnums.set(k, v)
      }
    }
  }

  const enumConfigs = Array.from(allReferencedEnums.values()).map((e) => ({
    id: e._id,
    name: e.name,
    enumValues: e.enumValues
  }))

  return {
    version: WorkflowConfigVersion,
    exportDate: new Date().toISOString(),
    workspace: options.workspace,
    projectTypeId: options.projectTypeId,
    screens: screens.length > 0 ? screens : undefined,
    statuses: statusConfigs.length > 0 ? statusConfigs : undefined,
    attributes: attributeConfigs.length > 0 ? attributeConfigs : undefined,
    mixins: mixinConfigs,
    enums: enumConfigs.length > 0 ? enumConfigs : undefined,
    workflows: [workflowEntry]
  }
}

/**
 * Extracts custom mixins and their attributes for target classes or referenced mixin IDs.
 */
async function exportMixins (
  client: TxOperations,
  targetClasses: Array<Ref<Class<Doc>>>,
  referencedMixinIds: Set<Ref<Mixin<Doc>>>
): Promise<WorkflowMixinConfig[] | undefined> {
  const hierarchy = client.getHierarchy()
  const mixinDocIds = new Set<Ref<Mixin<Doc>>>(referencedMixinIds)

  for (const targetClass of targetClasses) {
    if (targetClass == null) continue
    try {
      const descendants = hierarchy.getDescendants(targetClass)
      for (const m of descendants) {
        if (hierarchy.getClass(m).kind === ClassifierKind.MIXIN) {
          mixinDocIds.add(m as Ref<Mixin<Doc>>)
        }
      }
    } catch {}
  }

  if (mixinDocIds.size === 0) return undefined

  const mixinDocs = await client.findAll(core.class.Class, {
    _id: { $in: Array.from(mixinDocIds) },
    kind: ClassifierKind.MIXIN
  })

  if (mixinDocs.length === 0) return undefined

  const result: WorkflowMixinConfig[] = []
  for (const m of mixinDocs) {
    const mAttrs = Array.from(hierarchy.getAllAttributes(m._id).values()).filter((a) => a.attributeOf === m._id)
    const attrConfigs: AttributeConfig[] = mAttrs.map((a) => ({
      id: a._id,
      name: a.name,
      label: a.label,
      type: a.type,
      isCustom: true,
      mixin: m._id as Ref<Mixin<Doc>>,
      attributeOf: m._id
    }))

    result.push({
      id: m._id as Ref<Mixin<Doc>>,
      label: m.label,
      icon: m.icon,
      color: m.color,
      attributes: attrConfigs.length > 0 ? attrConfigs : undefined
    })
  }

  return result.length > 0 ? result : undefined
}

/**
 * Collects attribute configurations for all referenced attributes, including from target classes, mixins, and attribute docs.
 */
async function collectAttributeConfigs (
  client: TxOperations,
  referencedAttributeIds: Set<Ref<AnyAttribute>>,
  targetClasses: Array<Ref<Class<Doc>>>
): Promise<AttributeConfig[]> {
  if (referencedAttributeIds.size === 0) return []

  const hierarchy = client.getHierarchy()
  const attributeById = new Map<Ref<AnyAttribute>, AnyAttribute>()
  const attributeByName = new Map<string, AnyAttribute>()

  for (const targetClass of targetClasses) {
    if (targetClass == null) continue
    const allAttributes = hierarchy.getAllAttributes(targetClass)
    for (const attr of allAttributes.values()) {
      attributeById.set(attr._id, attr)
      attributeByName.set(attr.name, attr)
    }

    try {
      const descendants = hierarchy.getDescendants(targetClass)
      for (const m of descendants) {
        if (hierarchy.getClass(m).kind === ClassifierKind.MIXIN) {
          for (const attr of hierarchy.getAllAttributes(m).values()) {
            attributeById.set(attr._id, attr)
            attributeByName.set(attr.name, attr)
          }
        }
      }
    } catch {}
  }

  try {
    const attrDocs = await client.findAll(core.class.Attribute, {
      _id: { $in: Array.from(referencedAttributeIds) }
    })
    for (const attr of attrDocs) {
      attributeById.set(attr._id, attr)
      attributeByName.set(attr.name, attr)
    }

    const nameAttrDocs = await client.findAll(core.class.Attribute, {
      name: { $in: Array.from(referencedAttributeIds as unknown as string[]) }
    })
    for (const attr of nameAttrDocs) {
      attributeById.set(attr._id, attr)
      attributeByName.set(attr.name, attr)
    }
  } catch {}

  const result: AttributeConfig[] = []
  const addedIds = new Set<string>()

  for (const id of referencedAttributeIds) {
    const attr = attributeById.get(id) ?? attributeByName.get(id as string)
    if (attr !== undefined && !addedIds.has(attr._id)) {
      addedIds.add(attr._id)
      const isMixin = hierarchy.isDerived(attr.attributeOf, core.class.Mixin)
      result.push({
        id: attr._id,
        name: attr.name,
        label: attr.label,
        type: attr.type,
        isCustom: attr.isCustom ?? isMixin,
        mixin: isMixin ? (attr.attributeOf as Ref<Mixin<Doc>>) : undefined,
        attributeOf: attr.attributeOf
      })
    }
  }

  return result
}

/**
 * Reads every workflow, screen and project mapping of a project type into a portable JSON config.
 */
export async function exportWorkflowConfig (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  options: WorkflowExportOptions
): Promise<WorkflowConfig> {
  const resolver = await buildResolver(client, projectTypeId)
  const nameOf = (ref: Ref<Doc>, prefix: string): string =>
    resolver.toToken.get(ref)?.slice(prefix.length) ?? (ref as string)

  const referencedAttributeIds = new Set<Ref<AnyAttribute>>()
  const referencedMixinIds = new Set<Ref<Mixin<Doc>>>()
  const statusIds = new Set<Ref<Status>>()

  const screenDocs = await client.findAll(workflow.class.Screen, { projectType: projectTypeId })
  const screens: ScreenConfig[] = []
  for (const sc of screenDocs) {
    const tabs = await client.findAll(
      workflow.class.ScreenTab,
      { attachedTo: sc._id },
      { sort: { rank: SortingOrder.Ascending } }
    )
    const tabConfigs: ScreenTabConfig[] = []
    for (const tab of tabs) {
      const fields = await client.findAll(
        workflow.class.ScreenField,
        { attachedTo: tab._id },
        { sort: { rank: SortingOrder.Ascending } }
      )
      tabConfigs.push({
        name: tab.name,
        fields: fields.map((f) => {
          referencedAttributeIds.add(f.attribute)
          if (f.mixin !== undefined) {
            referencedMixinIds.add(f.mixin)
          }
          return {
            attribute: f.attribute,
            fieldKey: f.fieldKey,
            mixin: f.mixin,
            required: f.required
          }
        })
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

  const workflowDocs = await client.findAll(workflow.class.Workflow, { projectType: projectTypeId })
  const workflows: WorkflowConfigEntry[] = []
  for (const wf of workflowDocs) {
    const transitions = await client.findAll(
      workflow.class.WorkflowTransition,
      { attachedTo: wf._id },
      { sort: { rank: SortingOrder.Ascending } }
    )
    const taskTypeName = nameOf(wf.taskType, TaskTypeToken)
    for (const s of wf.initialStatuses ?? []) statusIds.add(s)
    for (const t of transitions) {
      if (t.to !== undefined) statusIds.add(t.to)
      for (const f of t.from ?? []) statusIds.add(f)
      for (const r of [...(t.validators ?? []), ...(t.postFunctions ?? [])]) {
        for (const f of extractRuleFieldReferences(r.rule, r.props)) {
          if (f.attribute !== undefined) {
            referencedAttributeIds.add(f.attribute)
          }
        }
      }
    }

    workflows.push({
      id: wf._id,
      name: wf.name,
      taskTypeName,
      taskTypeId: wf.taskType,
      initialStatuses: wf.initialStatuses?.map((s) => nameOf(s, StatusToken)) as unknown as Ref<Status>[],
      transitions: transitions.map((t) => ({
        id: t._id,
        name: t.name,
        from: t.from == null ? null : (t.from.map((s) => nameOf(s, StatusToken)) as unknown as Ref<Status>[]),
        to: nameOf(t.to, StatusToken) as unknown as Ref<Status>,
        requests: exportRules(t.requests, resolver),
        validators: exportRules(t.validators, resolver),
        postFunctions: exportRules(t.postFunctions, resolver)
      }))
    })
  }

  const taskTypeDocs = await client.findAll(task.class.TaskType, { projectType: projectTypeId })
  for (const tt of taskTypeDocs) {
    for (const s of tt.statuses ?? []) {
      statusIds.add(s)
    }
  }

  const statusDocs = await client.findAll(core.class.Status, { _id: { $in: Array.from(statusIds) } })
  const statusConfigs: StatusConfig[] = statusDocs.map((s) => ({
    id: s._id,
    name: s.name,
    color: s.color,
    category: s.category
  }))

  const targetClasses = Array.from(
    new Set(
      [...screenDocs.map((s) => s.targetClass), ...taskTypeDocs.map((t) => t.targetClass)].filter(
        (c): c is Ref<Class<Doc>> => c !== undefined
      )
    )
  )

  const attributeConfigs = await collectAttributeConfigs(client, referencedAttributeIds, targetClasses)
  const mixinConfigs = await exportMixins(client, targetClasses, referencedMixinIds)

  const allReferencedEnums = new Map<Ref<Enum>, Enum>()
  for (const [k, v] of await resolveEnumInfoForAttributes(client, attributeConfigs)) {
    allReferencedEnums.set(k, v)
  }
  for (const m of mixinConfigs ?? []) {
    if (m.attributes !== undefined) {
      for (const [k, v] of await resolveEnumInfoForAttributes(client, m.attributes)) {
        allReferencedEnums.set(k, v)
      }
    }
  }

  const enumConfigs = Array.from(allReferencedEnums.values()).map((e) => ({
    id: e._id,
    name: e.name,
    enumValues: e.enumValues
  }))

  const wfNames = new Map<string, string>(workflowDocs.map((w) => [w._id, w.name]))
  const ttNames = new Map<string, string>()
  for (const [ref, token] of resolver.toToken) {
    if (token.startsWith(TaskTypeToken)) ttNames.set(ref, token.slice(TaskTypeToken.length))
  }
  const projectDocs = await client.findAll(task.class.Project, { type: projectTypeId })
  const projects: ProjectWorkflowsConfig[] = []
  for (const p of projectDocs) {
    const mapping = client.getHierarchy().as(p, workflow.mixin.ProjectWorkflow).workflows
    if (mapping === undefined) continue
    const entries: Record<string, string> = {}
    for (const [ttRef, wfRef] of Object.entries(mapping)) {
      const ttName = ttNames.get(ttRef)
      const wfName = wfNames.get(wfRef as string)
      if (ttName !== undefined && wfName !== undefined) entries[ttName] = wfName
    }
    if (Object.keys(entries).length > 0) {
      projects.push({ project: p._id, identifier: identifierOf(p), workflows: entries })
    }
  }

  return {
    version: WorkflowConfigVersion,
    exportDate: new Date().toISOString(),
    workspace: options?.workspace ?? ('' as any),
    projectTypeId,
    screens: screens.length > 0 ? screens : undefined,
    statuses: statusConfigs.length > 0 ? statusConfigs : undefined,
    attributes: attributeConfigs.length > 0 ? attributeConfigs : undefined,
    mixins: mixinConfigs,
    enums: enumConfigs.length > 0 ? enumConfigs : undefined,
    workflows,
    projects: projects.length > 0 ? projects : undefined
  }
}
