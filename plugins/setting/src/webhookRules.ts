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

import type { ApiKeyOperation } from '@hcengineering/account-client'
import type { Doc, Rank } from '@hcengineering/core'

export type WebhookRuleOp = 'eq' | 'neq' | 'exists' | 'regex' | 'in'

export interface WebhookRuleCondition {
  // Dotted path into the request body: `commonLabels.severity`, `alerts.0.status`.
  path: string
  op: WebhookRuleOp
  value?: string | string[]
}

export type WebhookRuleTargetKind = 'Project' | 'Channel' | 'Teamspace' | 'Issue' | 'Document'

export interface WebhookRuleTarget {
  kind: WebhookRuleTargetKind
  // What the operation takes in its target field: project/issue identifier, otherwise the `_id`.
  id: string
  label: string
}

// Lives in the PersonSpace of the key's creator: pod-webhook reads rules with a system token, so the
// space is the only proof that whoever wrote the rule owns the key it names.
export interface WebhookIncomingRule extends Doc {
  keyId: string
  name: string
  enabled: boolean
  rank: Rank
  // All must hold, evaluated against the whole body.
  match: WebhookRuleCondition[]
  // Path to an array: the rule runs once per element, `fields` paths are relative to the element.
  forEach?: string
  // Per-element filter for `forEach`, paths relative to the element: one Alertmanager group mixes
  // firing and resolved alerts, and they need different rules.
  where?: WebhookRuleCondition[]
  action: ApiKeyOperation
  target: WebhookRuleTarget
  // Operation field -> template: "{{labels.alertname}} on {{$.externalURL}}". `$.` is the body root.
  fields: Record<string, string>
  // `<template id>:<rule name>` of the built-in template it came from; the editor reloads its sample.
  template?: string
}

export const WEBHOOK_RULE_MAX_JOBS = 50

// pod-webhook injects one that runs the user-written pattern under a timeout.
export type WebhookRegexTest = (pattern: string, value: string) => boolean

export interface WebhookConditionResult {
  condition: WebhookRuleCondition
  actual: unknown
  passed: boolean
}

export interface WebhookRuleEvaluation {
  matched: boolean
  conditions: WebhookConditionResult[]
  // Rendered `fields`: one entry per `forEach` element, a single one without it, none if not matched.
  items: Array<Record<string, string>>
}

export type WebhookRuleLogic = Pick<WebhookIncomingRule, 'match' | 'forEach' | 'where' | 'fields'>

// A rule author can name these in a path, but resolving them would walk off the actual data and
// onto Object.prototype / the constructor - never own data a third-party body could carry.
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/** Own properties only, `undefined` for anything missing - never walks the prototype chain. */
export function getWebhookPath (body: unknown, path: string): unknown {
  if (path === '') return body
  let current: unknown = body
  for (const segment of path.split('.')) {
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) return undefined
    if (typeof current !== 'object' || current === null) return undefined
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function renderWebhookValue (value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** Substitutes `{{path}}` (from `scope`) and `{{$.path}}` (from `root`); no conditions, loops or calls. */
export function renderWebhookTemplate (template: string, scope: unknown, root: unknown): string {
  return template.replace(/\{\{\s*(.*?)\s*\}\}/g, (_match, rawPath: string) => {
    const isRoot = rawPath.startsWith('$.')
    const value = getWebhookPath(isRoot ? root : scope, isRoot ? rawPath.slice(2) : rawPath)
    return renderWebhookValue(value)
  })
}

function renderWebhookFields (fields: Record<string, string>, scope: unknown, root: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, template] of Object.entries(fields)) {
    result[key] = renderWebhookTemplate(template, scope, root)
  }
  return result
}

const defaultRegexTest: WebhookRegexTest = (pattern, value) => {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return false
  }
}

function evaluateWebhookOp (condition: WebhookRuleCondition, actual: unknown, regexTest: WebhookRegexTest): boolean {
  switch (condition.op) {
    case 'eq':
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- contract: compare String(actual) as-is
      return actual !== undefined && String(actual) === condition.value
    case 'neq':
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- contract: compare String(actual) as-is
      return actual === undefined || String(actual) !== condition.value
    case 'exists':
      return actual !== undefined && actual !== null
    case 'in':
      if (actual === undefined || actual === null || !Array.isArray(condition.value)) return false
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- contract: compare String(actual) as-is
      return condition.value.includes(String(actual))
    case 'regex':
      if (typeof condition.value !== 'string') return false
      if (typeof actual !== 'string' && typeof actual !== 'number' && typeof actual !== 'boolean') return false
      return regexTest(condition.value, String(actual))
  }
}

export function evaluateWebhookRule (
  rule: WebhookRuleLogic,
  body: unknown,
  regexTest: WebhookRegexTest = defaultRegexTest
): WebhookRuleEvaluation {
  const conditions: WebhookConditionResult[] = rule.match.map((condition) => {
    const actual = getWebhookPath(body, condition.path)
    return { condition, actual, passed: evaluateWebhookOp(condition, actual, regexTest) }
  })
  const matched = conditions.every((c) => c.passed)
  if (!matched) return { matched, conditions, items: [] }

  if (rule.forEach === undefined) {
    return { matched, conditions, items: [renderWebhookFields(rule.fields, body, body)] }
  }
  const elements = getWebhookPath(body, rule.forEach)
  if (!Array.isArray(elements)) return { matched, conditions, items: [] }
  const where = rule.where ?? []
  const items = elements
    .filter((el) => where.every((c) => evaluateWebhookOp(c, getWebhookPath(el, c.path), regexTest)))
    .map((el) => renderWebhookFields(rule.fields, el, body))
  return { matched, conditions, items }
}
