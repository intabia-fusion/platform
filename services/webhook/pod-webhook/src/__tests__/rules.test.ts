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
import contact from '@hcengineering/contact'
import setting from '@hcengineering/setting'
import { loadRules, RULES_RELOAD_MS, safeRegexTest } from '../rules'

function baseCheck (overrides: Record<string, unknown> = {}): any {
  return {
    keyId: 'key_1',
    name: 'ci',
    workspace: 'ws-1',
    socialId: 'social_1',
    personUuid: 'person_uuid_1',
    ops: ['chat:post'],
    spaces: [],
    incoming: true,
    createdBy: 'person_uuid_1',
    ...overrides
  }
}

function rule (overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'rule_1',
    keyId: 'key_1',
    name: 'r1',
    enabled: true,
    rank: '0|1',
    match: [],
    action: 'chat:post',
    target: { kind: 'Channel', id: 'ch-1', label: 'general' },
    fields: {},
    ...overrides
  }
}

// person._id doubles as the PersonSpace's `person` field, keyed by account uuid via personUuid.
function fakeRest (people: any[], spaces: any[], rules: any[]): any {
  return {
    findOne: jest.fn(async (_class: string, query: any) => {
      if (_class === contact.class.Person) return people.find((p) => p.personUuid === query.personUuid)
      if (_class === contact.class.PersonSpace) return spaces.find((s) => s.person === query.person)
      return undefined
    }),
    findAll: jest.fn(async (_class: string, query: any) => {
      if (_class !== setting.class.WebhookIncomingRule) return []
      return rules.filter((r) => r.keyId === query.keyId && r.space === query.space && r.enabled === query.enabled)
    })
  }
}

describe('loadRules', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('no Person for the key creator -> no rules, no rule query issued', async () => {
    const rest = fakeRest([], [], [rule()])
    const rules = await loadRules(rest, 'ws-a' as any, baseCheck())
    expect(rules).toEqual([])
    expect(rest.findAll).not.toHaveBeenCalled()
  })

  test('Person exists but has no PersonSpace -> no rules', async () => {
    const rest = fakeRest([{ _id: 'p1', personUuid: 'person_uuid_1' }], [], [rule()])
    const rules = await loadRules(rest, 'ws-b' as any, baseCheck())
    expect(rules).toEqual([])
  })

  test('a rule in another person space with the same keyId is ignored', async () => {
    const rest = fakeRest(
      [{ _id: 'p1', personUuid: 'person_uuid_1' }],
      [{ _id: 'space-mine', person: 'p1' }],
      [rule({ _id: 'r_other', space: 'space-someone-else' })]
    )
    const rules = await loadRules(rest, 'ws-c' as any, baseCheck())
    expect(rules).toEqual([])
  })

  test('a rule in the creator own PersonSpace is returned', async () => {
    const rest = fakeRest(
      [{ _id: 'p1', personUuid: 'person_uuid_1' }],
      [{ _id: 'space-mine', person: 'p1' }],
      [rule({ _id: 'r_mine', space: 'space-mine' })]
    )
    const rules = await loadRules(rest, 'ws-d' as any, baseCheck())
    expect(rules.map((r) => r._id)).toEqual(['r_mine'])
  })

  test('a disabled rule is ignored (the query itself asks for enabled: true)', async () => {
    const rest = fakeRest(
      [{ _id: 'p1', personUuid: 'person_uuid_1' }],
      [{ _id: 'space-mine', person: 'p1' }],
      [rule({ _id: 'r_disabled', space: 'space-mine', enabled: false })]
    )
    const rules = await loadRules(rest, 'ws-e' as any, baseCheck())
    expect(rules).toEqual([])
    expect(rest.findAll).toHaveBeenCalledWith(
      setting.class.WebhookIncomingRule,
      expect.objectContaining({
        enabled: true
      })
    )
  })

  test('rules are sorted by rank', async () => {
    const rest = fakeRest(
      [{ _id: 'p1', personUuid: 'person_uuid_1' }],
      [{ _id: 'space-mine', person: 'p1' }],
      [
        rule({ _id: 'r_c', space: 'space-mine', rank: '0|3' }),
        rule({ _id: 'r_a', space: 'space-mine', rank: '0|1' }),
        rule({ _id: 'r_b', space: 'space-mine', rank: '0|2' })
      ]
    )
    const rules = await loadRules(rest, 'ws-f' as any, baseCheck())
    expect(rules.map((r) => r._id)).toEqual(['r_a', 'r_b', 'r_c'])
  })

  test('a cached result is not reloaded within RULES_RELOAD_MS, but is reloaded after', async () => {
    jest.useFakeTimers()
    const people = [{ _id: 'p1', personUuid: 'person_uuid_1' }]
    const spaces = [{ _id: 'space-mine', person: 'p1' }]
    const rules = [rule({ _id: 'r_mine', space: 'space-mine' })]
    const rest = fakeRest(people, spaces, rules)
    const ws = 'ws-g' as any
    const check = baseCheck()

    expect((await loadRules(rest, ws, check)).map((r) => r._id)).toEqual(['r_mine'])
    const loads = rest.findAll.mock.calls.length

    rules.push(rule({ _id: 'r_new', space: 'space-mine' }))
    expect((await loadRules(rest, ws, check)).map((r) => r._id)).toEqual(['r_mine'])
    expect(rest.findAll.mock.calls.length).toBe(loads)

    jest.advanceTimersByTime(RULES_RELOAD_MS + 1)
    expect((await loadRules(rest, ws, check)).map((r) => r._id)).toEqual(['r_mine', 'r_new'])
  })

  test('different keyId under the same workspace is cached separately', async () => {
    const rest = fakeRest(
      [{ _id: 'p1', personUuid: 'person_uuid_1' }],
      [{ _id: 'space-mine', person: 'p1' }],
      [rule({ _id: 'r_mine', space: 'space-mine' }), rule({ _id: 'r_other_key', space: 'space-mine', keyId: 'key_2' })]
    )
    const ws = 'ws-h' as any
    expect((await loadRules(rest, ws, baseCheck())).map((r) => r._id)).toEqual(['r_mine'])
    expect((await loadRules(rest, ws, baseCheck({ keyId: 'key_2' }))).map((r) => r._id)).toEqual(['r_other_key'])
  })
})

describe('safeRegexTest', () => {
  test('matches a normal pattern', () => {
    expect(safeRegexTest('^crit', 'critical')).toBe(true)
    expect(safeRegexTest('^crit', 'warning')).toBe(false)
  })

  test('an invalid pattern is false, not a throw', () => {
    expect(safeRegexTest('(', 'anything')).toBe(false)
  })

  test('a pattern longer than 200 chars is refused', () => {
    expect(safeRegexTest('a'.repeat(201), 'a')).toBe(false)
  })

  test('a value longer than 2000 chars is refused', () => {
    expect(safeRegexTest('a', 'a'.repeat(2001))).toBe(false)
  })

  test('a catastrophic backtracking pattern returns false quickly instead of hanging', () => {
    const start = Date.now()
    expect(safeRegexTest('^(a+)+$', 'a'.repeat(40) + '!')).toBe(false)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
