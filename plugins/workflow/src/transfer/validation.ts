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

import core, { type Client, type Class, type Doc, type Ref } from '@hcengineering/core'
import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'

import workflow from '../plugin'
import type { WorkflowRule } from '../schema'
import {
  type AttributeConfig,
  type ImportWarning,
  type ImportWarningKind,
  type ProjectWorkflowsConfig,
  type RuleConfig,
  type ScreenConfig,
  type ScreenFieldConfig,
  type ScreenTabConfig,
  type StatusConfig,
  type TransitionConfig,
  type WorkflowConfig,
  type WorkflowConfigEntry,
  WorkflowConfigVersion,
  type WorkflowEnumConfig,
  type WorkflowMixinConfig
} from './types'
import { extractRuleFieldReferences } from './utils'

export interface SanitizedWorkflowConfig {
  config: WorkflowConfig
  warnings: ImportWarning[]
}

const attributeNamePattern = /^[A-Za-z_][A-Za-z0-9_-]*$/
const intlStringPattern = /^[A-Za-z0-9_-]+:string:[A-Za-z0-9_]+$/

/**
 * Checks the shape of a workflow config and drops or fixes everything that cannot be imported as is:
 * malformed entries, rules and status categories unknown to the model, attribute names that cannot be
 * used as document keys and labels that are not intl strings.
 *
 * Throws only when the config as a whole is unusable. The input is not modified.
 */
export function sanitizeWorkflowConfig (client: Client, input: unknown): SanitizedWorkflowConfig {
  if (!isRecord(input)) {
    throw new Error('Workflow import: config is not an object')
  }
  if (input.version !== WorkflowConfigVersion) {
    throw new Error(`Workflow import: unsupported version ${String(input.version)}`)
  }
  if (!Array.isArray(input.workflows)) {
    throw new Error('Workflow import: config has no workflows')
  }

  const warnings: ImportWarning[] = []
  const report = (kind: ImportWarningKind, message: IntlString, params: Record<string, string> = {}): void => {
    warnings.push({ kind, message, params })
  }
  const raw = JSON.parse(JSON.stringify(input)) as Record<string, unknown>

  const workflows = sanitizeList(
    raw.workflows,
    (w) => sanitizeWorkflow(client, w, report),
    (w) => {
      report('workflow', workflow.string.ImportWarningInvalidWorkflow, { name: nameOf(w) })
    }
  )
  if (workflows.length === 0) {
    throw new Error('Workflow import: config has no valid workflows')
  }

  const fieldKeyByAttribute = collectFieldKeys(workflows, raw.screens)

  const config: WorkflowConfig = {
    version: WorkflowConfigVersion,
    exportDate: typeof raw.exportDate === 'string' ? raw.exportDate : '',
    workspace: (typeof raw.workspace === 'string' ? raw.workspace : '') as WorkflowConfig['workspace'],
    projectTypeId: (typeof raw.projectTypeId === 'string' ? raw.projectTypeId : '') as WorkflowConfig['projectTypeId'],
    workflows
  }

  if (raw.statuses !== undefined) {
    const seen = new Set<string>()
    config.statuses = sanitizeList(
      raw.statuses,
      (v) => {
        // A repeated id would make the second status silently take over the references of the first one
        if (isRecord(v) && seen.has(v.id)) return undefined
        const status = sanitizeStatus(client, v, report)
        if (status !== undefined) seen.add(status.id)
        return status
      },
      (v) => {
        report('status', workflow.string.ImportWarningInvalidStatus, { name: nameOf(v) })
      }
    )
  }
  if (raw.enums !== undefined) {
    config.enums = sanitizeList(raw.enums, sanitizeEnum, (v) => {
      report('enum', workflow.string.ImportWarningInvalidEnum, { name: nameOf(v) })
    })
  }
  const onInvalidAttribute = (v: unknown): void => {
    report('attribute', workflow.string.ImportWarningInvalidAttribute, { name: nameOf(v) })
  }
  if (raw.attributes !== undefined) {
    config.attributes = sanitizeList(
      raw.attributes,
      (v) => sanitizeAttribute(client, v, fieldKeyByAttribute),
      onInvalidAttribute
    )
  }
  if (raw.mixins !== undefined) {
    config.mixins = sanitizeList(
      raw.mixins,
      (v) => sanitizeMixin(client, v, fieldKeyByAttribute, onInvalidAttribute),
      onInvalidAttribute
    )
  }
  if (raw.screens !== undefined) {
    config.screens = sanitizeList(raw.screens, sanitizeScreen, (v) => {
      report('screen', workflow.string.ImportWarningInvalidScreen, { name: nameOf(v) })
    })
  }
  if (raw.projects !== undefined) {
    config.projects = sanitizeList(raw.projects, sanitizeProject, (v) => {
      report('project', workflow.string.ImportWarningInvalidProject, { name: nameOf(v) })
    })
  }

  return { config, warnings }
}

type Report = (kind: ImportWarningKind, message: IntlString, params?: Record<string, string>) => void

function isRecord (value: unknown): value is Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString (value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function nameOf (value: unknown): string {
  if (isRecord(value)) {
    if (isNonEmptyString(value.name)) return value.name
    if (isNonEmptyString(value.id)) return value.id
  }
  return '?'
}

/** Rule and condition ids are model refs like `workflow:validator:FieldRequired`; users only need the last part. */
function shortRuleName (rule: unknown): string {
  if (!isNonEmptyString(rule)) return '?'
  return rule.split(':').pop() ?? rule
}

function sanitizeList<T> (
  value: unknown,
  sanitize: (v: unknown) => T | undefined,
  onInvalid: (v: unknown) => void
): T[] {
  if (!Array.isArray(value)) return []
  const result: T[] = []
  for (const v of value) {
    const sanitized = sanitize(v)
    if (sanitized === undefined) {
      onInvalid(v)
    } else {
      result.push(sanitized)
    }
  }
  return result
}

function stringList (value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : []
}

function uniqueValues (value: unknown): string[] {
  return Array.from(new Set(stringList(value).map((v) => v.trim())))
}

function isModelDocOf (client: Client, _id: unknown, _class: Ref<Class<Doc>>): boolean {
  if (!isNonEmptyString(_id)) return false
  const doc = client.getModel().findObject(_id as Ref<Doc>)
  return doc !== undefined && client.getHierarchy().isDerived(doc._class, _class)
}

function isIntlString (label: unknown): label is IntlString {
  return typeof label === 'string' && (label.startsWith('embedded:') || intlStringPattern.test(label))
}

/**
 * A label is written to the model as is and translated on every render, so anything that is not an intl
 * string (a plain title from an external tool) is embedded.
 */
export function normalizeLabel (label: unknown, fallback: string): IntlString {
  if (isIntlString(label)) return label
  return getEmbeddedLabel(isNonEmptyString(label) ? label : fallback)
}

/**
 * The attribute name becomes a key of the document, so it has to be a plain identifier: dots and `$` break
 * queries and spaces break everything that addresses the field by path. The result is deterministic, so a
 * repeated import finds the attribute it created the first time.
 */
export function normalizeAttributeName (name: string, fieldKey?: string): string {
  if (attributeNamePattern.test(name)) return name
  if (fieldKey !== undefined && attributeNamePattern.test(fieldKey)) return fieldKey
  const replaced = name
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (/[A-Za-z]/.test(replaced)) {
    return /^[0-9]/.test(replaced) ? `_${replaced}` : replaced
  }
  return `custom_${hashString(name)}`
}

function hashString (value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

function collectFieldKeys (workflows: WorkflowConfigEntry[], screens: unknown): Map<string, string> {
  const result = new Map<string, string>()
  for (const wf of workflows) {
    for (const t of wf.transitions ?? []) {
      for (const r of [...(t.validators ?? []), ...(t.postFunctions ?? [])]) {
        for (const f of extractRuleFieldReferences(r.rule, r.props)) {
          if (f.attribute !== undefined && !result.has(f.attribute)) result.set(f.attribute, f.fieldKey)
        }
      }
    }
  }
  for (const sc of Array.isArray(screens) ? screens : []) {
    for (const tab of isRecord(sc) && Array.isArray(sc.tabs) ? sc.tabs : []) {
      for (const f of isRecord(tab) && Array.isArray(tab.fields) ? tab.fields : []) {
        if (isRecord(f) && isNonEmptyString(f.attribute) && isNonEmptyString(f.fieldKey) && !result.has(f.attribute)) {
          result.set(f.attribute, f.fieldKey)
        }
      }
    }
  }
  return result
}

function sanitizeWorkflow (client: Client, value: unknown, report: Report): WorkflowConfigEntry | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.name)) return undefined
  const transitions = sanitizeList(
    value.transitions,
    (t) => sanitizeTransition(client, t, report),
    (t) => {
      report('transition', workflow.string.ImportWarningInvalidTransition, { name: nameOf(t) })
    }
  )
  return {
    id: (isNonEmptyString(value.id) ? value.id : value.name) as WorkflowConfigEntry['id'],
    name: value.name,
    taskTypeName: typeof value.taskTypeName === 'string' ? value.taskTypeName : '',
    taskTypeId: (typeof value.taskTypeId === 'string' ? value.taskTypeId : '') as WorkflowConfigEntry['taskTypeId'],
    initialStatuses: value.initialStatuses !== undefined ? (stringList(value.initialStatuses) as any) : undefined,
    transitions
  }
}

function sanitizeTransition (client: Client, value: unknown, report: Report): TransitionConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.to)) return undefined
  if (value.from != null && !(Array.isArray(value.from) && value.from.every(isNonEmptyString))) {
    // Dropping bad entries could turn the list empty, and an empty list means "from any status"
    return undefined
  }
  const name = isNonEmptyString(value.name) ? value.name : value.id

  // Conditions exist in the source system only, there is no rule kind to import them into
  for (const c of Array.isArray(value.conditions) ? value.conditions : []) {
    report('condition', workflow.string.ImportWarningUnsupportedCondition, {
      rule: shortRuleName(isRecord(c) ? c.rule : undefined),
      transition: name
    })
  }

  const rules = <T extends WorkflowRule>(list: unknown, ruleClass: Ref<Class<T>>): Array<RuleConfig<T>> | undefined => {
    if (list === undefined) return undefined
    return sanitizeList(
      list,
      (r) => sanitizeRule(client, r, ruleClass),
      (r) => {
        report('rule', workflow.string.ImportWarningUnsupportedRule, {
          rule: shortRuleName(isRecord(r) ? r.rule : undefined),
          transition: name
        })
      }
    )
  }

  return {
    id: value.id as TransitionConfig['id'],
    name,
    from: value.from == null ? null : (stringList(value.from) as TransitionConfig['to'][]),
    to: value.to as TransitionConfig['to'],
    requests: rules(value.requests, workflow.class.WorkflowRequest),
    validators: rules(value.validators, workflow.class.WorkflowValidator),
    postFunctions: rules(value.postFunctions, workflow.class.WorkflowPostFunction)
  }
}

/**
 * A rule is kept only when the model has it and it belongs to the section it is listed in. `ruleClass` is
 * taken from the model, not from the config.
 */
function sanitizeRule<T extends WorkflowRule> (
  client: Client,
  value: unknown,
  ruleClass: Ref<Class<T>>
): RuleConfig<T> | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.rule)) return undefined
  const rule = client.getModel().findObject(value.rule as Ref<T>)
  if (rule === undefined || !client.getHierarchy().isDerived(rule._class, ruleClass)) return undefined
  return {
    id: isNonEmptyString(value.id) ? value.id : `rule-${hashString(JSON.stringify(value))}`,
    rule: rule._id as Ref<T>,
    ruleClass: rule._class as Ref<Class<T>>,
    props: isRecord(value.props) ? value.props : {}
  }
}

function sanitizeStatus (client: Client, value: unknown, report: Report): StatusConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return undefined
  const status: StatusConfig = {
    id: value.id as StatusConfig['id'],
    name: value.name.trim(),
    color: typeof value.color === 'number' && Number.isFinite(value.color) ? value.color : undefined
  }
  if (value.category !== undefined) {
    if (isModelDocOf(client, value.category, core.class.StatusCategory)) {
      status.category = value.category
    } else {
      report('status', workflow.string.ImportWarningUnknownStatusCategory, { name: status.name })
    }
  }
  return status
}

function sanitizeEnum (value: unknown): WorkflowEnumConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return undefined
  const enumValues = uniqueValues(value.enumValues)
  if (enumValues.length === 0) return undefined
  return { id: value.id as WorkflowEnumConfig['id'], name: value.name.trim(), enumValues }
}

function sanitizeAttribute (
  client: Client,
  value: unknown,
  fieldKeyByAttribute: Map<string, string>
): AttributeConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return undefined
  // Without a type there is nothing to create the attribute with, and it is not guessed
  if (!isRecord(value.type)) return undefined
  const attribute: AttributeConfig = {
    id: value.id as AttributeConfig['id'],
    name: normalizeAttributeName(value.name, fieldKeyByAttribute.get(value.id)),
    label: normalizeLabel(value.label, value.name),
    type: sanitizeType(client, value.type) as AttributeConfig['type'],
    isCustom: value.isCustom === true ? true : undefined,
    mixin: isNonEmptyString(value.mixin) ? (value.mixin as AttributeConfig['mixin']) : undefined,
    attributeOf: isNonEmptyString(value.attributeOf)
      ? (value.attributeOf as AttributeConfig['attributeOf'])
      : undefined,
    enumName: isNonEmptyString(value.enumName) ? value.enumName.trim() : undefined
  }
  if (value.enumValues !== undefined) {
    attribute.enumValues = uniqueValues(value.enumValues)
  }
  return attribute
}

/**
 * The type object goes to the model as is, and its label is translated wherever the attribute type is shown,
 * so a label that is not an intl string is replaced by the label of the type class. Whether the type itself
 * can be imported is decided later, against the target workspace.
 */
function sanitizeType (client: Client, type: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...type }
  if (!isIntlString(type.label)) {
    const hierarchy = client.getHierarchy()
    const typeClass = type._class as Ref<Class<Doc>>
    const classLabel =
      typeof typeClass === 'string' && hierarchy.hasClass(typeClass) ? hierarchy.getClass(typeClass).label : undefined
    if (classLabel !== undefined) {
      result.label = classLabel
    } else {
      delete result.label
    }
  }
  if (isRecord(type.of)) {
    result.of = sanitizeType(client, type.of)
  }
  return result
}

function sanitizeMixin (
  client: Client,
  value: unknown,
  fieldKeyByAttribute: Map<string, string>,
  onInvalidAttribute: (v: unknown) => void
): WorkflowMixinConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id)) return undefined
  const color = value.color
  const isColor =
    (typeof color === 'number' && Number.isFinite(color)) ||
    isNonEmptyString(color) ||
    (Array.isArray(color) && color.every((c) => typeof c === 'number' && Number.isFinite(c)))
  return {
    id: value.id as WorkflowMixinConfig['id'],
    label: normalizeLabel(value.label, value.id),
    icon: isNonEmptyString(value.icon) ? (value.icon as WorkflowMixinConfig['icon']) : undefined,
    color: isColor ? (color as WorkflowMixinConfig['color']) : undefined,
    attributes: sanitizeList(
      value.attributes,
      (v) => sanitizeAttribute(client, v, fieldKeyByAttribute),
      onInvalidAttribute
    )
  }
}

function sanitizeScreen (value: unknown): ScreenConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return undefined
  const tabs: ScreenTabConfig[] = []
  for (const tab of Array.isArray(value.tabs) ? value.tabs : []) {
    if (!isRecord(tab) || !isNonEmptyString(tab.name)) continue
    const fields: ScreenFieldConfig[] = []
    for (const f of Array.isArray(tab.fields) ? tab.fields : []) {
      if (!isRecord(f) || !isNonEmptyString(f.fieldKey)) continue
      fields.push({
        attribute: f.attribute as ScreenFieldConfig['attribute'],
        fieldKey: f.fieldKey,
        mixin: isNonEmptyString(f.mixin) ? (f.mixin as ScreenFieldConfig['mixin']) : undefined,
        required: f.required === true
      })
    }
    tabs.push({ name: tab.name, fields })
  }
  return {
    id: value.id as ScreenConfig['id'],
    name: value.name,
    description: typeof value.description === 'string' ? value.description : undefined,
    targetClass: value.targetClass,
    tabs
  }
}

function sanitizeProject (value: unknown): ProjectWorkflowsConfig | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.project) || !isRecord(value.workflows)) return undefined
  const workflows: Record<string, string> = {}
  for (const [taskType, wf] of Object.entries(value.workflows)) {
    if (isNonEmptyString(wf)) workflows[taskType] = wf
  }
  return {
    project: value.project as ProjectWorkflowsConfig['project'],
    identifier: typeof value.identifier === 'string' ? value.identifier : '',
    workflows
  }
}
