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
  generateId,
  type AnyAttribute,
  type Class,
  type Doc,
  type Ref,
  type Status,
  type TxOperations
} from '@hcengineering/core'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import task, { type Project, type ProjectType, type TaskType } from '@hcengineering/task'

import workflow from '../plugin'
import type {
  Field,
  FieldListProps,
  UpdateFieldValueConfig,
  UpdateFieldValueProps,
  Workflow,
  WorkflowRule,
  WorkflowRuleConfig,
  WorkflowTransition
} from '../schema'
import { addScreenField, addScreenTab, addTransition, createWorkflow, setWorkflow } from '../utils'
import {
  NameResolver,
  ScreenToken,
  StatusToken,
  TaskTypeToken,
  buildResolver,
  identifierOf,
  remap,
  requireRef
} from './resolver'
import {
  type AttributeResolutionConfig,
  type ImportResult,
  type RuleConfig,
  type StatusConfig,
  type WorkflowConfig,
  type WorkflowImportResolution
} from './types'

type StatusResolver = (sourceId: Ref<Status>) => Ref<Status> | undefined

export function filterAndRemapRuleProps (
  ruleId: Ref<WorkflowRule>,
  props: Record<string, any>,
  attrResolutions: Record<string, AttributeResolutionConfig>,
  targetAttributeById?: Map<Ref<AnyAttribute>, AnyAttribute>
): { valid: boolean, props: Record<string, any> } {
  if (ruleId === workflow.validator.FieldRequired || ruleId === workflow.postFunction.ClearFieldValue) {
    const ruleProps = props as FieldListProps
    if (ruleProps.fields === undefined) {
      return { valid: true, props }
    }

    const filteredFields: Field[] = []
    for (const f of ruleProps.fields) {
      const res = attrResolutions[f.fieldKey]
      if (res?.action === 'skip') {
        continue
      }
      if (res?.action === 'map' && res.targetAttributeId !== undefined) {
        const targetKey = targetAttributeById?.get(res.targetAttributeId)?.name ?? f.fieldKey
        filteredFields.push({ ...f, attribute: res.targetAttributeId, fieldKey: targetKey })
      } else {
        filteredFields.push(f)
      }
    }

    if (filteredFields.length === 0) {
      return { valid: false, props }
    }

    return { valid: true, props: { ...props, fields: filteredFields } }
  }

  if (ruleId === workflow.postFunction.UpdateFieldValue) {
    const ruleProps = props as UpdateFieldValueProps
    if (ruleProps.fields === undefined) {
      return { valid: true, props }
    }

    const filteredFields: UpdateFieldValueConfig[] = []
    for (const f of ruleProps.fields) {
      const res = attrResolutions[f.fieldKey]
      if (res?.action === 'skip') {
        continue
      }

      let targetAttr = f.attribute
      let targetKey = f.fieldKey
      if (res?.action === 'map' && res.targetAttributeId !== undefined) {
        targetAttr = res.targetAttributeId
        targetKey = targetAttributeById?.get(res.targetAttributeId)?.name ?? f.fieldKey
      }

      let updatedVal = f.value
      if (f.value.type === 'this' || f.value.type === 'parent') {
        const sourceVal = f.value
        const sourceRes = attrResolutions[sourceVal.fieldKey]
        if (sourceRes?.action === 'skip') {
          continue
        }
        if (sourceRes?.action === 'map' && sourceRes.targetAttributeId !== undefined) {
          const srcTargetKey = targetAttributeById?.get(sourceRes.targetAttributeId)?.name ?? sourceVal.fieldKey
          updatedVal = { ...sourceVal, attribute: sourceRes.targetAttributeId, fieldKey: srcTargetKey }
        }
      }

      filteredFields.push({
        ...f,
        attribute: targetAttr,
        fieldKey: targetKey,
        value: updatedVal
      })
    }

    if (filteredFields.length === 0) {
      return { valid: false, props }
    }

    return { valid: true, props: { ...props, fields: filteredFields } }
  }

  return { valid: true, props }
}

export function importRules<TRule extends WorkflowRule> (
  rules: RuleConfig<TRule>[] | undefined,
  resolver: NameResolver,
  attrResolutions?: Record<string, AttributeResolutionConfig>,
  targetAttributeById?: Map<Ref<AnyAttribute>, AnyAttribute>
): WorkflowRuleConfig<TRule>[] | undefined {
  if (rules === undefined || rules.length === 0) return undefined
  const importedRules: WorkflowRuleConfig<TRule>[] = []
  for (const r of rules) {
    let currentProps = r.props ?? {}
    if (attrResolutions !== undefined) {
      const filtered = filterAndRemapRuleProps(r.rule, currentProps, attrResolutions, targetAttributeById)
      if (!filtered.valid) {
        continue
      }
      currentProps = filtered.props
    }
    const unresolved: string[] = []
    const remappedProps = remap(currentProps, resolver.fromToken, unresolved)
    if (unresolved.length > 0) {
      throw new Error(`Workflow import: could not resolve rule references: ${unresolved.join(', ')}`)
    }
    importedRules.push({
      id: r.id ?? 'rule-' + generateId(),
      rule: r.rule,
      ruleClass: r.ruleClass,
      props: remappedProps
    })
  }
  return importedRules.length > 0 ? importedRules : undefined
}

/**
 * Builds a strict status resolver matching source statuses against target task type statuses.
 */
function createStatusResolver (
  targetStatusDocs: Status[],
  configStatusById: Map<Ref<Status>, StatusConfig>,
  configStatusByName: Map<string, StatusConfig>,
  wfRes?: WorkflowImportResolution
): StatusResolver {
  return (sourceId: Ref<Status>): Ref<Status> | undefined => {
    // 1. Explicit mapping in resolution
    if (wfRes?.statusMap?.[sourceId] !== undefined) {
      return wfRes.statusMap[sourceId]
    }
    // 2. Direct ID match in target task type
    if (targetStatusDocs.some((t) => t._id === sourceId)) {
      return sourceId
    }
    // 3. Case-insensitive name match in target task type
    const stConfig = configStatusById.get(sourceId) ?? configStatusByName.get(sourceId)
    const srcName = stConfig?.name ?? sourceId
    if (srcName !== '') {
      const byName = targetStatusDocs.find((t) => t.name.toLowerCase() === srcName.toLowerCase())
      if (byName !== undefined) return byName._id
    }
    // 4. Category match in target task type
    const srcCategory = stConfig?.category
    if (srcCategory !== undefined) {
      const byCat = targetStatusDocs.find((t) => t.category === srcCategory)
      if (byCat !== undefined) return byCat._id
    }
    return undefined
  }
}

/**
 * Creates missing custom attributes on the target class if specified in attributeResolutions.
 */
async function createCustomAttributes (
  client: TxOperations,
  targetClass: Ref<Class<Doc>>,
  attrResolutions: Record<string, AttributeResolutionConfig>
): Promise<void> {
  for (const [fieldKey, attrRes] of Object.entries(attrResolutions)) {
    if (attrRes.action === 'create') {
      const createdAttrId = 'custom' + generateId()
      const attrLabel: IntlString = attrRes.label ?? getEmbeddedLabel(fieldKey)
      await client.createDoc(core.class.Attribute, core.space.Model, {
        attributeOf: targetClass,
        name: createdAttrId,
        label: attrLabel,
        type: attrRes.type ?? { _class: core.class.TypeString },
        isCustom: true
      })
      attrRes.targetAttributeId = createdAttrId as Ref<AnyAttribute>
      attrRes.action = 'map'
    }
  }
}

/**
 * Generates a unique screen name within the project type if name already exists.
 */
async function getUniqueScreenName (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  baseName: string
): Promise<string> {
  const existingScreens = await client.findAll(workflow.class.Screen, { projectType: projectTypeId })
  const existingNames = new Set(existingScreens.map((s) => s.name.toLowerCase()))

  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName
  }

  let counter = 1
  while (existingNames.has(`${baseName} (${counter})`.toLowerCase())) {
    counter++
  }
  return `${baseName} (${counter})`
}

/**
 * Imports screens and screen tabs/fields into the target project type.
 */
async function importScreens (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  config: WorkflowConfig,
  targetClass: Ref<Class<Doc>>,
  attrResolutions: Record<string, AttributeResolutionConfig>,
  targetAttributeById: Map<Ref<AnyAttribute>, AnyAttribute>,
  resolver: NameResolver,
  result: ImportResult
): Promise<void> {
  for (const sc of config.screens ?? []) {
    const uniqueName = await getUniqueScreenName(client, projectTypeId, sc.name)

    const screenId = await client.createDoc(workflow.class.Screen, core.space.Workspace, {
      name: uniqueName,
      description: sc.description,
      projectType: projectTypeId,
      targetClass: targetClass ?? sc.targetClass
    })

    for (const tab of sc.tabs ?? []) {
      const tabId = await addScreenTab(client, screenId, tab.name)
      for (const f of tab.fields ?? []) {
        const attrRes = attrResolutions[f.fieldKey]
        if (attrRes?.action === 'skip') {
          continue
        }
        const attributeRef =
          attrRes?.action === 'map' && attrRes.targetAttributeId !== undefined ? attrRes.targetAttributeId : f.attribute
        const fieldKey =
          attrRes?.action === 'map' && attrRes.targetAttributeId !== undefined
            ? (targetAttributeById.get(attrRes.targetAttributeId)?.name ?? f.fieldKey)
            : f.fieldKey
        await addScreenField(client, tabId, {
          attribute: attributeRef,
          fieldKey,
          mixin: f.mixin,
          required: f.required
        })
      }
    }

    result.screens[sc.id] = screenId
    resolver.add(ScreenToken, screenId, sc.name)
  }
}

/**
 * Restores project-to-workflow bindings according to the exported config.
 */
async function restoreProjectWorkflows (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  projectsConfig: WorkflowConfig['projects'],
  workflowByName: Map<string, Ref<Workflow>>,
  existingByName: Map<string, Workflow>,
  resolver: NameResolver
): Promise<void> {
  if (projectsConfig === undefined || projectsConfig.length === 0) {
    return
  }

  const projects = await client.findAll(task.class.Project, { type: projectTypeId })
  const projectByIdent = new Map<string, Project>(projects.map((p) => [identifierOf(p), p]))
  for (const pw of projectsConfig) {
    const p = (await client.findOne(task.class.Project, { _id: pw.project })) ?? projectByIdent.get(pw.identifier)
    if (p === undefined) continue
    for (const [ttName, wfName] of Object.entries(pw.workflows)) {
      const taskTypeId = resolver.getRef<TaskType>(TaskTypeToken, ttName)
      const workflowId = workflowByName.get(wfName) ?? existingByName.get(wfName)?._id
      if (taskTypeId === undefined || workflowId === undefined) continue
      const current = (await client.findOne(task.class.Project, { _id: p._id })) ?? p
      await setWorkflow(client, current, taskTypeId, workflowId)
    }
  }
}

/**
 * Creates workflows, transitions, rules and screens from a config.
 */
export async function importWorkflowConfig (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  config: WorkflowConfig,
  resolution?: WorkflowImportResolution
): Promise<ImportResult> {
  const existingWfs = await client.findAll(workflow.class.Workflow, { projectType: projectTypeId })
  const existingByName = new Map<string, Workflow>(existingWfs.map((w) => [w.name, w]))

  const resolver = await buildResolver(client, projectTypeId)

  // Apply custom task type mappings to resolver
  if (resolution?.taskTypeMap !== undefined) {
    for (const [ttName, ttRef] of Object.entries(resolution.taskTypeMap)) {
      resolver.setRef(TaskTypeToken, ttName, ttRef)
    }
  }
  if (resolution?.statusMap !== undefined) {
    for (const [stName, stRef] of Object.entries(resolution.statusMap)) {
      if (stRef !== undefined) {
        resolver.setRef(StatusToken, stName, stRef)
      }
    }
  }

  // Handle attribute creation on target task type if requested
  const attrResolutions = resolution?.attributeResolutions ?? {}
  let targetTaskType: TaskType | undefined
  if (resolution?.targetTaskTypeId !== undefined) {
    targetTaskType = await client.findOne(task.class.TaskType, { _id: resolution.targetTaskTypeId })
  }

  const hierarchy = client.getHierarchy()
  const targetClass = targetTaskType?.targetClass ?? task.class.Task
  const allTargetAttributes = hierarchy.getAllAttributes(targetClass, core.class.Doc)
  const targetAttributeById = new Map<Ref<AnyAttribute>, AnyAttribute>()
  for (const attr of allTargetAttributes.values()) {
    targetAttributeById.set(attr._id, attr)
  }

  if (targetTaskType !== undefined && Object.keys(attrResolutions).length > 0) {
    await createCustomAttributes(client, targetClass, attrResolutions)
  }

  const result: ImportResult = { screens: {}, workflows: {}, transitions: {} }

  // Import screens if not disabled
  if (resolution === undefined || resolution.copyScreens !== false) {
    await importScreens(
      client,
      projectTypeId,
      config,
      targetClass,
      attrResolutions,
      targetAttributeById,
      resolver,
      result
    )
  }

  // Pre-index config statuses once
  const configStatusById = new Map<Ref<Status>, StatusConfig>()
  const configStatusByName = new Map<string, StatusConfig>()
  for (const sc of config.statuses ?? []) {
    configStatusById.set(sc.id, sc)
    configStatusByName.set(sc.name, sc)
  }

  const workflowByName = new Map<string, Ref<Workflow>>()
  for (const wf of config.workflows) {
    const wfName = resolution?.name ?? wf.name
    const existing = existingByName.get(wfName)

    const rawTaskType = wf.taskTypeName
    const taskTypeId: Ref<TaskType> =
      resolution?.targetTaskTypeId ??
      (wf.taskTypeId !== undefined && resolution?.taskTypeMap?.[wf.taskTypeId] !== undefined
        ? resolution.taskTypeMap[wf.taskTypeId]
        : undefined) ??
      (wf.taskTypeId !== undefined && resolver.hasRef(wf.taskTypeId)
        ? wf.taskTypeId
        : requireRef<TaskType>(resolver, TaskTypeToken, rawTaskType))

    const workflowId = existing?._id ?? (await createWorkflow(client, projectTypeId, taskTypeId, wfName))
    result.workflows[wf.id] = workflowId
    workflowByName.set(wfName, workflowId)

    const currentTaskType = await client.findOne(task.class.TaskType, { _id: taskTypeId })
    let targetStatusDocs: Status[] = []
    if (currentTaskType?.statuses !== undefined && currentTaskType.statuses.length > 0) {
      targetStatusDocs = await client.findAll(core.class.Status, { _id: { $in: currentTaskType.statuses } })
    }

    const resolveStatus = createStatusResolver(targetStatusDocs, configStatusById, configStatusByName, resolution)

    if (wf.initialStatuses !== undefined) {
      const initialStatuses: Ref<Status>[] = []
      for (const s of wf.initialStatuses) {
        const resolved = resolveStatus(s)
        if (resolved !== undefined) {
          initialStatuses.push(resolved)
        }
      }
      if (initialStatuses.length > 0) {
        await client.updateDoc(workflow.class.Workflow, core.space.Workspace, workflowId, {
          initialStatuses: Array.from(new Set(initialStatuses))
        })
      }
    }

    const existingTransitions = await client.findAll(workflow.class.WorkflowTransition, { attachedTo: workflowId })
    const existingTransByName = new Map<string, WorkflowTransition>(existingTransitions.map((t) => [t.name, t]))

    for (const t of wf.transitions ?? []) {
      const tRes = resolution?.transitionResolutions?.[t.id]
      if (tRes?.action === 'skip') {
        continue
      }

      let to: Ref<Status> | undefined
      if (tRes?.action === 'redirect' && tRes.targetToStatusId !== undefined) {
        to = tRes.targetToStatusId
      } else {
        to = resolveStatus(t.to)
      }

      if (to === undefined) {
        continue
      }

      let from: Ref<Status>[] | null = null
      if (t.from != null) {
        const resolvedFrom: Ref<Status>[] = []
        for (const s of t.from) {
          const resolved = resolveStatus(s)
          if (resolved !== undefined) {
            resolvedFrom.push(resolved)
          }
        }
        if (resolvedFrom.length === 0) {
          continue
        }
        from = Array.from(new Set(resolvedFrom))
      }

      const existingTrans = existingTransByName.get(t.name)
      const transitionId = existingTrans?._id ?? (await addTransition(client, workflowId, t.name, from, to))
      result.transitions[t.id] = transitionId

      const importedRequests = importRules(t.requests, resolver, attrResolutions, targetAttributeById)
      const importedValidators = importRules(t.validators, resolver, attrResolutions, targetAttributeById)
      const importedPostFunctions = importRules(t.postFunctions, resolver, attrResolutions, targetAttributeById)

      if (importedRequests !== undefined || importedValidators !== undefined || importedPostFunctions !== undefined) {
        await client.updateCollection(
          workflow.class.WorkflowTransition,
          core.space.Workspace,
          transitionId,
          workflowId,
          workflow.class.Workflow,
          'transitions',
          {
            requests: importedRequests,
            validators: importedValidators,
            postFunctions: importedPostFunctions
          }
        )
      }
    }
  }

  // Restore project mappings if the config has any and projects exist in the workspace
  await restoreProjectWorkflows(client, projectTypeId, config.projects, workflowByName, existingByName, resolver)

  return result
}
