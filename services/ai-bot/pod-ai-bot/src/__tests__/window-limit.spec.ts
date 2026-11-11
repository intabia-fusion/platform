//
// Copyright © 2026 Intabia Fusion
//

import { decideLevel, type WindowUsage } from '../workspace/windowLimit'
import { WorkspaceClient } from '../workspace/workspaceClient'
import * as billing from '../billing'
import aiBot from '@hcengineering/ai-bot'

jest.mock('../config', () => ({ __esModule: true, default: { AIProviders: [], DefaultLanguage: 'ru' } }))

const usage = (used: number, limit: number, isFree = true, balance = 0): WindowUsage => ({
  month: { used, limit },
  balance,
  plan: isFree ? 'free' : 'business',
  isFree,
  hasPackages: false
})

it.each([
  ['limit', usage(1, 1), false],
  ['unavailable', { ...usage(0, 0), unavailable: true }, true]
])('handles %s without invoking the model', async (_reason, window, notified) => {
  const getWindows = jest.spyOn(billing, 'getWorkspaceWindows').mockResolvedValue(window as WindowUsage)
  const client: any = Object.create(WorkspaceClient.prototype)
  client.getMemory = jest.fn().mockResolvedValue({})
  client.setTypingStatus = jest.fn().mockResolvedValue(undefined)
  client.notifyLimit = jest.fn().mockResolvedValue(undefined)
  client.ctx = {}
  client.wsIds = { uuid: 'workspace' }
  const llm = { chatCompletion: jest.fn() }
  const args = {
    llm,
    personUuid: 'person',
    contextMode: 'direct',
    objectId: 'chat',
    objectClass: 'class',
    messageClass: 'message',
    space: 'space',
    prompt: {},
    promptTokens: 0,
    level: 'low'
  }

  await client.generateAndReply({ collection: 'messages' }, args)

  expect(client.notifyLimit).toHaveBeenCalledTimes(notified ? 1 : 0)
  if (notified) expect(client.notifyLimit.mock.calls[0][3]).toBe(aiBot.string.AIServiceUnavailable)
  expect(llm.chatCompletion).not.toHaveBeenCalled()
  getWindows.mockRestore()
})

describe('decideLevel', () => {
  it('proceeds with requested level when the tier window has room', () => {
    const d = decideLevel('high', usage(10, 100))
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })

  it('tier window spent + no balance -> block on a free plan', () => {
    const d = decideLevel('high', usage(1000, 1000, true))
    expect(d).toEqual({ action: 'block', reason: 'limit' })
  })

  it('tier window spent + no balance -> block on a paid plan too (no level downgrade)', () => {
    const d = decideLevel('high', usage(1000, 1000, false))
    expect(d).toEqual({ action: 'block', reason: 'limit' })
  })

  it('tier window spent but purchased balance left -> proceed at the requested level', () => {
    const d = decideLevel('high', usage(1000, 1000, true, 5000))
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })

  it('tier window over-spent beyond the balance -> block', () => {
    const d = decideLevel('high', usage(1000, 1000, false, 0))
    expect(d).toEqual({ action: 'block', reason: 'limit' })
  })

  it('the overspend eats the pack: 1200 used against a 1000 grant leaves 300 of a 500 pack', () => {
    // `used` is the whole period spend, so the overspend must come off the pack rather than
    // being clamped away - otherwise the pack looks full and the block never lands.
    expect(decideLevel('high', usage(1200, 1000, false, 500))).toEqual({ action: 'proceed', level: 'high' })
    expect(decideLevel('high', usage(1500, 1000, false, 500))).toEqual({ action: 'block', reason: 'limit' })
  })

  it('billing unavailable -> block regardless of the reported window', () => {
    const d = decideLevel('high', { ...usage(0, 0, false), unavailable: true })
    expect(d).toEqual({ action: 'block', reason: 'unavailable' })
  })

  it('no limit (0) -> always proceed', () => {
    const d = decideLevel('high', usage(1e9, 0))
    expect(d).toEqual({ action: 'proceed', level: 'high' })
  })
})
