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
// operations.ts pulls apiKeyOperations from this module too - keep the real exports, only stub getClient.
jest.mock('@hcengineering/account-client', () => ({
  ...jest.requireActual('@hcengineering/account-client'),
  getClient: jest.fn()
}))

// Target lookup and rule loading both talk to the transactor - tested against their answers only.
jest.mock('../targets', () => ({
  ...jest.requireActual('../targets'),
  lookupTarget: jest.fn()
}))

jest.mock('../rules', () => ({
  ...jest.requireActual('../rules'),
  loadRules: jest.fn()
}))

/* eslint-disable import/first */
import { getClient as getAccountClient, type ApiKeyCheck } from '@hcengineering/account-client'
import type { WebhookIncomingRule } from '@hcengineering/setting'
import { loadRules } from '../rules'
import { lookupTarget } from '../targets'
import { startWebhookSender, type WebhookSender } from './webhookSender'
/* eslint-enable import/first */

const KEY = 'fus_ws1_test'

const baseCheck: ApiKeyCheck = {
  keyId: 'key_1',
  name: 'key one',
  workspace: '11111111-1111-4111-8111-111111111111' as any,
  socialId: 'social_1' as any,
  personUuid: 'person_1' as any,
  ops: ['chat:post', 'issue:create'],
  spaces: [],
  incoming: true,
  createdBy: 'account_1' as any
}

function rule (overrides: Partial<WebhookIncomingRule> = {}): WebhookIncomingRule {
  return {
    _id: 'rule_1' as any,
    keyId: 'key_1',
    name: 'r1',
    enabled: true,
    rank: '0|1' as any,
    match: [],
    action: 'chat:post',
    target: { kind: 'Channel', id: 'ch-1', label: 'general' },
    fields: { message: '{{text}}' },
    space: 'space-mine' as any,
    modifiedOn: 0,
    modifiedBy: 'social_1' as any,
    _class: 'setting:class:WebhookIncomingRule' as any,
    ...overrides
  } as unknown as WebhookIncomingRule
}

describe('POST /api/v1/webhook/in', () => {
  let sender: WebhookSender

  beforeEach(() => {
    ;(getAccountClient as jest.Mock).mockReturnValue({
      selectWorkspace: jest.fn().mockResolvedValue({ endpoint: 'ws://transactor.local', workspaceUrl: 'ws-slug' })
    })
    ;(lookupTarget as jest.Mock).mockReset().mockResolvedValue({ found: true, space: 'ch-1' })
    ;(loadRules as jest.Mock).mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    sender.close()
  })

  test('a matched rule queues one job with the built payload', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(loadRules as jest.Mock).mockResolvedValue([rule()])
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobs).toHaveLength(1)
    expect(body.skipped).toEqual([])
    expect(sender.producer.send).toHaveBeenCalledTimes(1)
    const [, , messages] = sender.producer.send.mock.calls[0]
    expect(messages).toHaveLength(1)
    expect(messages[0].payload).toEqual({ message: 'hello', action: 'chat:post', space: 'ch-1' })
    expect(messages[0].action).toBe('chat:post')
    expect(messages[0].rule).toBe('rule_1')
  })

  test('the key-in-path route also works', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(loadRules as jest.Mock).mockResolvedValue([rule()])
    const res = await sender.pathIn(KEY, { text: 'hello' })
    expect(res.status).toBe(202)
    expect((await res.json()).jobs).toHaveLength(1)
  })

  test('nothing matched -> 202 with an empty jobs list, nothing queued', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(loadRules as jest.Mock).mockResolvedValue([rule({ match: [{ path: 'never', op: 'exists' }] })])
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ jobs: [] })
    expect(sender.producer.send).not.toHaveBeenCalled()
  })

  test('no rules at all -> 202 with an empty jobs list', async () => {
    sender = await startWebhookSender(baseCheck)
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ jobs: [] })
  })

  test('more than 50 rendered items -> 413, nothing queued', async () => {
    sender = await startWebhookSender(baseCheck)
    const many = Array.from({ length: 51 }, (_, i) => ({ text: `item-${i}` }))
    ;(loadRules as jest.Mock).mockResolvedValue([rule({ forEach: 'items', fields: { message: '{{text}}' } })])
    const res = await sender.in(KEY, { items: many })
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(sender.producer.send).not.toHaveBeenCalled()
  })

  test('a rule whose action is not in the key ops is reported skipped, not failed', async () => {
    sender = await startWebhookSender({ ...baseCheck, ops: ['issue:create'] })
    ;(loadRules as jest.Mock).mockResolvedValue([rule()])
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobs).toEqual([])
    expect(body.skipped).toEqual([{ rule: 'rule_1', reason: 'forbidden' }])
    expect(sender.producer.send).not.toHaveBeenCalled()
  })

  test('a rule whose target is not found is skipped not_found', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(lookupTarget as jest.Mock).mockResolvedValue({ found: false, message: "Channel 'ch-1' not found" })
    ;(loadRules as jest.Mock).mockResolvedValue([rule()])
    const res = await sender.in(KEY, { text: 'hello' })
    const body = await res.json()
    expect(body.jobs).toEqual([])
    expect(body.skipped).toEqual([{ rule: 'rule_1', reason: 'not_found' }])
  })

  test('a target outside the key spaces is skipped forbidden', async () => {
    sender = await startWebhookSender({ ...baseCheck, spaces: ['other-space' as any] })
    ;(loadRules as jest.Mock).mockResolvedValue([rule()])
    const res = await sender.in(KEY, { text: 'hello' })
    const body = await res.json()
    expect(body.jobs).toEqual([])
    expect(body.skipped).toEqual([{ rule: 'rule_1', reason: 'forbidden' }])
  })

  test('a field named action/space in rule.fields cannot override the real action/target', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(loadRules as jest.Mock).mockResolvedValue([
      rule({ fields: { action: 'evil-action', space: 'evil-space', message: '{{text}}' } })
    ])
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(202)
    const [, , messages] = sender.producer.send.mock.calls[0]
    expect(messages[0].payload).toEqual({ message: 'hello', action: 'chat:post', space: 'ch-1' })
  })

  test('a failed rule load -> 503 service_unavailable, nothing queued', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(loadRules as jest.Mock).mockRejectedValue(new Error('transactor down'))
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(503)
    expect(sender.producer.send).not.toHaveBeenCalled()
  })

  test('a failed enqueue leaves no job behind and reports 500', async () => {
    sender = await startWebhookSender(baseCheck)
    ;(loadRules as jest.Mock).mockResolvedValue([rule()])
    sender.producer.send.mockRejectedValueOnce(new Error('queue down'))
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(500)
  })

  test('invalid key on /in -> 401, same as the raw ingest routes', async () => {
    sender = await startWebhookSender(null)
    const res = await sender.in(KEY, { text: 'hello' })
    expect(res.status).toBe(401)
  })
})
