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
  ArrOf,
  Doc,
  EnumOf,
  type Hierarchy,
  type PropertyType,
  type Ref,
  RefTo,
  type Status,
  type TxOperations,
  type Type
} from '@hcengineering/core'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import task, { type TaskType } from '@hcengineering/task'

import workflow from '../plugin'

import type {
  AttributeCompatibilityItem,
  AttributeConfig,
  AttributeUsageSource,
  StatusCompatibilityItem,
  StatusConfig,
  TransitionCompatibilityItem,
  WorkflowCompatibilityReport,
  WorkflowConfig
} from './types'
import { extractRuleFieldReferences } from './utils'

/**
 * Checks a workflow configuration for compatibility against a target TaskType (statuses & attributes).
 */
export async function checkWorkflowCompatibility (
  client: TxOperations,
  config: WorkflowConfig,
  targetTaskTypeId: Ref<TaskType>
): Promise<WorkflowCompatibilityReport> {
  const targetTaskType = await client.findOne(task.class.TaskType, { _id: targetTaskTypeId })
  if (targetTaskType == null) {
    throw new Error(`Target task type "${targetTaskTypeId}" not found`)
  }

  const statuses = await checkStatusesCompatibility(client, config, targetTaskType)
  const attributes = checkAttributesCompatibility(client, config, targetTaskType)
  const transitions = extractTransitionsReport(config)
  const hasScreens = hasScreensInConfig(config)

  return {
    statuses,
    attributes,
    transitions,
    hasScreens
  }
}

/**
 * Collects unique status IDs referenced in initialStatuses and transitions of all workflows.
 */
function collectSourceStatusIds (config: WorkflowConfig): Set<Ref<Status>> {
  const ids = new Set<Ref<Status>>()
  for (const wf of config.workflows) {
    for (const s of wf.initialStatuses ?? []) ids.add(s)
    for (const t of wf.transitions ?? []) {
      if (t.to !== undefined) ids.add(t.to)
      for (const f of t.from ?? []) ids.add(f)
    }
  }
  return ids
}

/**
 * Matches source status IDs against target task type statuses using a 3-tier strategy (ID -> Name -> Category).
 */
async function checkStatusesCompatibility (
  client: TxOperations,
  config: WorkflowConfig,
  targetTaskType: TaskType
): Promise<StatusCompatibilityItem[]> {
  const allWorkspaceStatuses = await client.findAll(core.class.Status, {})
  const workspaceStatusById = new Map<Ref<Status>, Status>()
  const workspaceStatusByName = new Map<string, Status>()
  for (const st of allWorkspaceStatuses) {
    workspaceStatusById.set(st._id, st)
    if (!workspaceStatusByName.has(st.name)) {
      workspaceStatusByName.set(st.name, st)
    }
  }

  const targetStatusIds = new Set(targetTaskType.statuses ?? [])
  const targetStatusDocs = allWorkspaceStatuses.filter((s) => targetStatusIds.has(s._id))

  const configStatusById = new Map<Ref<Status>, StatusConfig>()
  const configStatusByName = new Map<string, StatusConfig>()
  for (const sc of config.statuses ?? []) {
    configStatusById.set(sc.id, sc)
    configStatusByName.set(sc.name, sc)
  }

  const sourceStatusIds = collectSourceStatusIds(config)
  const usedTargetStatusIds = new Set<Ref<Status>>()
  const result: StatusCompatibilityItem[] = []

  for (const sourceStatusId of sourceStatusIds) {
    const stConfig = configStatusById.get(sourceStatusId) ?? configStatusByName.get(sourceStatusId as string)
    const stDoc = workspaceStatusById.get(sourceStatusId) ?? workspaceStatusByName.get(sourceStatusId as string)
    const sourceName = stConfig?.name ?? stDoc?.name ?? (sourceStatusId as string)
    const sourceCategory = stConfig?.category ?? stDoc?.category
    const sourceColor = stConfig?.color ?? stDoc?.color ?? 0

    // Priority 1: Match by ID
    let matchedDoc = targetStatusDocs.find((t) => !usedTargetStatusIds.has(t._id) && t._id === sourceStatusId)

    // Priority 2: Match by Name
    if (matchedDoc === undefined && sourceName !== '') {
      matchedDoc = targetStatusDocs.find(
        (t) => !usedTargetStatusIds.has(t._id) && t.name.toLowerCase() === sourceName.toLowerCase()
      )
    }

    // Priority 3: Match by Category (first available from same category)
    if (matchedDoc === undefined && sourceCategory !== undefined) {
      matchedDoc = targetStatusDocs.find((t) => !usedTargetStatusIds.has(t._id) && t.category === sourceCategory)
    }

    const isMatched = matchedDoc !== undefined
    if (matchedDoc !== undefined) {
      usedTargetStatusIds.add(matchedDoc._id)
    }

    result.push({
      sourceStatusId,
      sourceName,
      sourceColor,
      sourceCategory,
      isMatched,
      targetStatusId: matchedDoc?._id
    })
  }

  return result
}

interface FieldUsage {
  sourceAttributeId: Ref<AnyAttribute>
  label: IntlString
  ruleTypes: Set<AttributeUsageSource>
}

/**
 * Collects all field references from screens and rule properties across the workflow configuration.
 */
function collectAttributeUsages (config: WorkflowConfig): Map<string, FieldUsage> {
  const attributeMap = new Map<string, FieldUsage>()

  const addFieldRef = (
    fieldKey: string,
    attributeId: Ref<AnyAttribute> | undefined,
    ruleType: AttributeUsageSource,
    label?: IntlString
  ): void => {
    if (fieldKey.length === 0) return
    const attrId = attributeId ?? (fieldKey as Ref<AnyAttribute>)
    const lbl = label ?? getEmbeddedLabel(fieldKey)
    const existing = attributeMap.get(fieldKey)
    if (existing !== undefined) {
      existing.ruleTypes.add(ruleType)
      if (attributeId !== undefined) {
        existing.sourceAttributeId = attributeId
      }
      if (label !== undefined) existing.label = label
    } else {
      attributeMap.set(fieldKey, {
        sourceAttributeId: attrId,
        label: lbl,
        ruleTypes: new Set([ruleType])
      })
    }
  }

  for (const sc of config.screens ?? []) {
    for (const tab of sc.tabs ?? []) {
      for (const f of tab.fields ?? []) {
        addFieldRef(f.fieldKey, f.attribute, 'ScreenField')
      }
    }
  }

  for (const wf of config.workflows) {
    for (const t of wf.transitions ?? []) {
      for (const r of [...(t.validators ?? []), ...(t.postFunctions ?? [])]) {
        for (const f of extractRuleFieldReferences(r.rule, r.props)) {
          addFieldRef(f.fieldKey, f.attribute, r.rule)
        }
      }
    }
  }

  return attributeMap
}

/**
 * Checks whether two attribute types are strictly compatible.
 */
export function isAttributeTypeCompatible (
  hierarchy: Hierarchy,
  sourceType: Type<PropertyType> | undefined,
  targetType: Type<PropertyType> | undefined
): boolean {
  if (sourceType === undefined || targetType === undefined) {
    return true
  }
  if (sourceType._class !== targetType._class) {
    return false
  }
  // RefTo comparison
  if (sourceType._class === core.class.RefTo) {
    const srcTo = (sourceType as RefTo<Doc>).to
    const tgtTo = (targetType as RefTo<Doc>).to
    if (srcTo !== undefined && tgtTo !== undefined) {
      return srcTo === tgtTo || hierarchy.isDerived(srcTo, tgtTo)
    }
  }
  // EnumOf comparison
  if (sourceType._class === core.class.EnumOf) {
    const srcOf = (sourceType as EnumOf).of
    const tgtOf = (targetType as EnumOf).of
    if (srcOf !== undefined && tgtOf !== undefined) {
      return srcOf === tgtOf
    }
  }
  // ArrOf comparison
  if (sourceType._class === core.class.ArrOf) {
    const srcOf = (sourceType as ArrOf<Doc>).of
    const tgtOf = (targetType as ArrOf<Doc>).of
    return isAttributeTypeCompatible(hierarchy, srcOf, tgtOf)
  }
  return true
}

/**
 * Checks attribute compatibility between the workflow config and the target task type class.
 */
function checkAttributesCompatibility (
  client: TxOperations,
  config: WorkflowConfig,
  targetTaskType: TaskType
): AttributeCompatibilityItem[] {
  const hierarchy = client.getHierarchy()
  const targetClass = targetTaskType.targetClass
  const allTargetAttributes = hierarchy.getAllAttributes(targetClass, core.class.Doc)
  const attributesByKey = new Map<string, AnyAttribute>()
  const attributesById = new Map<Ref<AnyAttribute>, AnyAttribute>()
  for (const attr of allTargetAttributes.values()) {
    attributesByKey.set(attr.name, attr)
    attributesById.set(attr._id, attr)
  }

  const configAttributeById = new Map<Ref<AnyAttribute>, AttributeConfig>()
  const configAttributeByName = new Map<string, AttributeConfig>()
  for (const ac of config.attributes ?? []) {
    configAttributeById.set(ac.id, ac)
    configAttributeByName.set(ac.name, ac)
  }

  const attributeUsages = collectAttributeUsages(config)
  const result: AttributeCompatibilityItem[] = []

  for (const [fieldKey, info] of attributeUsages) {
    const matchedAttr =
      attributesByKey.get(fieldKey) ??
      (info.sourceAttributeId !== undefined ? attributesById.get(info.sourceAttributeId) : undefined)

    const attrConfig =
      (info.sourceAttributeId !== undefined ? configAttributeById.get(info.sourceAttributeId) : undefined) ??
      configAttributeByName.get(fieldKey)

    const sourceType = attrConfig?.type

    result.push({
      fieldKey,
      sourceAttributeId: info.sourceAttributeId,
      label: matchedAttr?.label ?? attrConfig?.label ?? info.label,
      sourceType,
      ruleTypes: Array.from(info.ruleTypes),
      isMatched: matchedAttr !== undefined,
      targetAttributeId: matchedAttr?._id
    })
  }

  return result
}

/**
 * Extracts flat transition compatibility items for all transitions in the workflow config.
 */
function extractTransitionsReport (config: WorkflowConfig): TransitionCompatibilityItem[] {
  const result: TransitionCompatibilityItem[] = []
  for (const wf of config.workflows) {
    for (const t of wf.transitions ?? []) {
      result.push({
        id: t.id,
        name: t.name,
        from: t.from,
        to: t.to
      })
    }
  }
  return result
}

/**
 * Checks whether the workflow config contains screens directly or references screen requests.
 */
function hasScreensInConfig (config: WorkflowConfig): boolean {
  if (config.screens !== undefined && config.screens.length > 0) {
    return true
  }

  return config.workflows.some((w) =>
    w.transitions?.some((t) => t.requests?.some((r) => r.rule === workflow.request.ScreenRequest))
  )
}
