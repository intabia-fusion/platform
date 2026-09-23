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
import { evaluateWebhookRule, getWebhookPath, renderWebhookTemplate, type WebhookRuleLogic } from '../webhookRules'

describe('getWebhookPath', () => {
  test('empty path returns the body itself', () => {
    const body = { a: 1 }
    expect(getWebhookPath(body, '')).toBe(body)
  })

  test('dotted path into nested own properties', () => {
    expect(getWebhookPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  test('numeric segment indexes an array', () => {
    expect(getWebhookPath({ alerts: [{ status: 'firing' }, { status: 'resolved' }] }, 'alerts.1.status')).toBe(
      'resolved'
    )
  })

  test('missing path returns undefined', () => {
    expect(getWebhookPath({ a: 1 }, 'a.b.c')).toBeUndefined()
    expect(getWebhookPath(null, 'a')).toBeUndefined()
    expect(getWebhookPath('str', 'a')).toBeUndefined()
  })

  test('__proto__ segment never walks the prototype chain', () => {
    expect(getWebhookPath({}, '__proto__.x')).toBeUndefined()
    expect(getWebhookPath({}, '__proto__')).toBeUndefined()
  })

  test('constructor segment is refused, not resolved off the prototype', () => {
    expect(getWebhookPath({}, 'constructor.name')).toBeUndefined()
    expect(getWebhookPath({}, 'prototype')).toBeUndefined()
  })

  test('inherited (non-own) properties are not visible', () => {
    const proto = { inherited: 'nope' }
    const obj = Object.create(proto)
    obj.own = 'yes'
    expect(getWebhookPath(obj, 'inherited')).toBeUndefined()
    expect(getWebhookPath(obj, 'own')).toBe('yes')
  })
})

describe('renderWebhookTemplate', () => {
  test('substitutes a scope path, tolerating whitespace inside braces', () => {
    expect(renderWebhookTemplate('Alert: {{ alertname }}', { alertname: 'HighCPU' }, {})).toBe('Alert: HighCPU')
  })

  test('$. resolves against root instead of scope', () => {
    const scope = { alertname: 'HighCPU' }
    const root = { externalURL: 'https://am.example.com' }
    expect(renderWebhookTemplate('{{alertname}} on {{$.externalURL}}', scope, root)).toBe(
      'HighCPU on https://am.example.com'
    )
  })

  test('number/boolean render via String(), null/undefined render empty', () => {
    expect(renderWebhookTemplate('{{n}}/{{b}}/{{nil}}/{{missing}}', { n: 42, b: false, nil: null }, {})).toBe(
      '42/false//'
    )
  })

  test('object/array values are JSON.stringify-ed', () => {
    expect(renderWebhookTemplate('{{obj}}', { obj: { a: 1, b: [1, 2] } }, {})).toBe('{"a":1,"b":[1,2]}')
  })

  test('string values pass through unchanged', () => {
    expect(renderWebhookTemplate('{{s}}', { s: 'plain text' }, {})).toBe('plain text')
  })
})

describe('evaluateWebhookRule ops', () => {
  const rule = (
    op: WebhookRuleLogic['match'][number]['op'],
    value: string | string[] | undefined
  ): WebhookRuleLogic => ({
    match: [{ path: 'x', op, value }],
    fields: { out: '{{x}}' }
  })

  test('eq matches on String(actual), missing actual is false', () => {
    expect(evaluateWebhookRule(rule('eq', '5'), { x: 5 }).matched).toBe(true)
    expect(evaluateWebhookRule(rule('eq', '5'), { x: 6 }).matched).toBe(false)
    expect(evaluateWebhookRule(rule('eq', '5'), {}).matched).toBe(false)
  })

  test('neq is the inverse, missing actual is true', () => {
    expect(evaluateWebhookRule(rule('neq', '5'), { x: 6 }).matched).toBe(true)
    expect(evaluateWebhookRule(rule('neq', '5'), { x: 5 }).matched).toBe(false)
    expect(evaluateWebhookRule(rule('neq', '5'), {}).matched).toBe(true)
  })

  test('exists is false for undefined and null, true otherwise', () => {
    expect(evaluateWebhookRule(rule('exists', undefined), { x: 0 }).matched).toBe(true)
    expect(evaluateWebhookRule(rule('exists', undefined), { x: null }).matched).toBe(false)
    expect(evaluateWebhookRule(rule('exists', undefined), {}).matched).toBe(false)
  })

  test('in checks String(actual) against a value array', () => {
    expect(evaluateWebhookRule(rule('in', ['a', 'b']), { x: 'b' }).matched).toBe(true)
    expect(evaluateWebhookRule(rule('in', ['a', 'b']), { x: 'c' }).matched).toBe(false)
    expect(evaluateWebhookRule(rule('in', 'a'), { x: 'a' }).matched).toBe(false)
  })

  test('regex runs the injected tester against string/number/boolean actual only', () => {
    const upper: (pattern: string, value: string) => boolean = (p, v) => v === p.toUpperCase()
    expect(evaluateWebhookRule(rule('regex', 'critical'), { x: 'CRITICAL' }, upper).matched).toBe(true)
    expect(evaluateWebhookRule(rule('regex', 'critical'), { x: { nested: true } }, upper).matched).toBe(false)
  })

  test('default regex tester: invalid pattern is false, not a throw', () => {
    expect(evaluateWebhookRule(rule('regex', '('), { x: 'anything' }).matched).toBe(false)
  })

  test('default regex tester runs a valid pattern', () => {
    expect(evaluateWebhookRule(rule('regex', '^crit'), { x: 'critical' }).matched).toBe(true)
  })

  test('conditions are reported (actual + passed) even when the rule does not match', () => {
    const evaluation = evaluateWebhookRule(rule('eq', '5'), { x: 6 })
    expect(evaluation.conditions).toEqual([
      { condition: { path: 'x', op: 'eq', value: '5' }, actual: 6, passed: false }
    ])
    expect(evaluation.items).toEqual([])
  })

  test('empty match list always matches', () => {
    const evaluation = evaluateWebhookRule({ match: [], fields: { out: 'x' } }, {})
    expect(evaluation.matched).toBe(true)
    expect(evaluation.items).toEqual([{ out: 'x' }])
  })
})

describe('evaluateWebhookRule forEach', () => {
  test('without forEach, one item rendered with scope=root=body', () => {
    const rule: WebhookRuleLogic = {
      match: [{ path: 'status', op: 'eq', value: 'firing' }],
      fields: { text: '{{status}} at {{$.externalURL}}' }
    }
    const body = { status: 'firing', externalURL: 'https://am.example.com' }
    expect(evaluateWebhookRule(rule, body).items).toEqual([{ text: 'firing at https://am.example.com' }])
  })

  test('Alertmanager-shaped body: forEach over alerts[], fields read labels/annotations/fingerprint', () => {
    const rule: WebhookRuleLogic = {
      match: [{ path: 'status', op: 'eq', value: 'firing' }],
      forEach: 'alerts',
      fields: {
        title: '{{labels.alertname}}: {{annotations.summary}}',
        startedAt: '{{startsAt}}',
        fingerprint: '{{fingerprint}}',
        severity: '{{$.commonLabels.severity}}',
        url: '{{$.externalURL}}'
      }
    }
    const body = {
      status: 'firing',
      externalURL: 'https://am.example.com',
      commonLabels: { severity: 'critical' },
      alerts: [
        {
          labels: { alertname: 'HighCPU', instance: 'i-1' },
          annotations: { summary: 'CPU is high' },
          startsAt: '2026-09-21T10:00:00Z',
          fingerprint: 'abc123'
        },
        {
          labels: { alertname: 'HighMem', instance: 'i-2' },
          annotations: { summary: 'Memory is high' },
          startsAt: '2026-09-21T10:05:00Z',
          fingerprint: 'def456'
        }
      ]
    }
    const evaluation = evaluateWebhookRule(rule, body)
    expect(evaluation.matched).toBe(true)
    expect(evaluation.items).toEqual([
      {
        title: 'HighCPU: CPU is high',
        startedAt: '2026-09-21T10:00:00Z',
        fingerprint: 'abc123',
        severity: 'critical',
        url: 'https://am.example.com'
      },
      {
        title: 'HighMem: Memory is high',
        startedAt: '2026-09-21T10:05:00Z',
        fingerprint: 'def456',
        severity: 'critical',
        url: 'https://am.example.com'
      }
    ])
  })

  test('GitLab push-shaped body: forEach over commits[], project path from root', () => {
    const rule: WebhookRuleLogic = {
      match: [{ path: 'object_kind', op: 'eq', value: 'push' }],
      forEach: 'commits',
      fields: {
        message: '{{message}}',
        project: '{{$.project.path_with_namespace}}',
        author: '{{author.name}}'
      }
    }
    const body = {
      object_kind: 'push',
      project: { path_with_namespace: 'group/project' },
      commits: [
        { id: 'c1', message: 'fix bug', author: { name: 'Alice' } },
        { id: 'c2', message: 'add feature', author: { name: 'Bob' } }
      ]
    }
    const evaluation = evaluateWebhookRule(rule, body)
    expect(evaluation.items).toEqual([
      { message: 'fix bug', project: 'group/project', author: 'Alice' },
      { message: 'add feature', project: 'group/project', author: 'Bob' }
    ])
  })

  test('forEach path that is not an array: matched stays true, items is empty', () => {
    const rule: WebhookRuleLogic = {
      match: [{ path: 'object_kind', op: 'eq', value: 'push' }],
      forEach: 'commits',
      fields: { message: '{{message}}' }
    }
    const evaluation = evaluateWebhookRule(rule, { object_kind: 'push', commits: 'not-an-array' })
    expect(evaluation.matched).toBe(true)
    expect(evaluation.items).toEqual([])
  })

  test('where keeps only the forEach elements that pass, paths relative to the element', () => {
    const rule: WebhookRuleLogic = {
      match: [],
      forEach: 'alerts',
      where: [{ path: 'status', op: 'eq', value: 'firing' }],
      fields: { message: '{{labels.alertname}}' }
    }
    const body = {
      status: 'firing',
      alerts: [
        { status: 'firing', labels: { alertname: 'DiskFull' } },
        { status: 'resolved', labels: { alertname: 'HighCpu' } }
      ]
    }
    expect(evaluateWebhookRule(rule, body).items).toEqual([{ message: 'DiskFull' }])
  })
})
