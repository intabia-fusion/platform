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

const mockSignUp = jest.fn()
const mockFindSocialId = jest.fn()
const mockConfirm = jest.fn()

jest.mock('../config', () => ({ __esModule: true, default: { FirstName: 'Julia', LastName: 'AI' } }))
jest.mock('@hcengineering/server-token', () => ({ generateToken: jest.fn(() => 'service-token') }))
jest.mock('@hcengineering/server-client', () => ({
  getAccountClient: jest.fn(() => ({
    findFullSocialIdBySocialKey: mockFindSocialId,
    signUp: mockSignUp,
    confirm: mockConfirm
  })),
  withRetry: jest.fn()
}))

/* eslint-disable import/first */
import { aiBotAccountEmail, type MeasureContext } from '@hcengineering/core'
/* eslint-enable import/first */

const botSocialId = { personUuid: 'bot-account', verifiedOn: 1 }
const ctx = { error: jest.fn() } as unknown as MeasureContext

// getAccountUuid caches the account in module state, so every case loads a fresh module.
async function freshGetAccountUuid (): Promise<(ctx?: MeasureContext) => Promise<string | undefined>> {
  jest.resetModules()
  return (await import('../utils/account')).getAccountUuid
}

describe('ai-bot account bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('first start signs up with a random password', async () => {
    mockFindSocialId.mockResolvedValue(null)
    mockSignUp.mockResolvedValue({ account: 'bot-account' })

    const getAccountUuid = await freshGetAccountUuid()

    expect(await getAccountUuid(ctx)).toBe('bot-account')
    expect(mockSignUp).toHaveBeenCalledWith(aiBotAccountEmail, expect.any(String), 'Julia', 'AI')
    const password: string = mockSignUp.mock.calls[0][1]
    expect(password.length).toBeGreaterThanOrEqual(32)
    expect(password).not.toBe('password')
  })

  it('every sign up gets its own password', async () => {
    mockFindSocialId.mockResolvedValue(null)
    mockSignUp.mockResolvedValue({ account: 'bot-account' })

    const first = await freshGetAccountUuid()
    await first(ctx)
    const second = await freshGetAccountUuid()
    await second(ctx)

    expect(mockSignUp.mock.calls[0][1]).not.toBe(mockSignUp.mock.calls[1][1])
  })

  it('restart finds the confirmed bot and does not sign up again', async () => {
    mockFindSocialId.mockResolvedValue(botSocialId)

    const getAccountUuid = await freshGetAccountUuid()

    expect(await getAccountUuid(ctx)).toBe('bot-account')
    expect(mockSignUp).not.toHaveBeenCalled()
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('refuses a bot email that somebody else registered and left unconfirmed', async () => {
    mockFindSocialId.mockResolvedValue({ personUuid: 'someone-else', verifiedOn: undefined })

    const getAccountUuid = await freshGetAccountUuid()

    expect(await getAccountUuid(ctx)).toBeUndefined()
    expect(ctx.error).toHaveBeenCalledWith(expect.stringContaining('unconfirmed'), { person: 'someone-else' })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockSignUp).not.toHaveBeenCalled()
  })
})
