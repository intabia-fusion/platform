/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { loadServerConfig, type ServerConfig } from '@hcengineering/api-client'
import { type PersonUuid, systemAccountUuid } from '@hcengineering/core'
import { type AccountClient, getClient as getAccountClient } from '@hcengineering/account-client'
import { generateToken } from '@hcengineering/server-token'
import { waitForMail } from './admin.fixtures'

// Email-first registration creates the person and account only after OTP confirmation.
describe('signup-otp', () => {
  const secret = 'secret'

  let config: ServerConfig
  let anon: AccountClient
  let service: AccountClient
  let runId: string

  beforeAll(async () => {
    config = await loadServerConfig('http://localhost:8183')
    anon = getAccountClient(config.ACCOUNTS_URL)
    // findPersonBySocialKey needs a service token; getPersonInfo takes admin or service - one
    // token covers both.
    service = getAccountClient(
      config.ACCOUNTS_URL,
      generateToken(systemAccountUuid, undefined, { service: 'tool', admin: 'true' }, secret)
    )
    runId = `${Date.now()}`
  }, 30000)

  // Fresh addresses keep OTP retry limits and existing accounts from affecting the next run.
  function email (name: string): string {
    return `signup-otp-${runId}-${name}@test.local`
  }

  async function codeOf (value: string): Promise<string> {
    const mail = await waitForMail(value)
    const code = mail?.Subject.match(/\b\d{6}\b/)?.[0]
    expect(code).toBeDefined()
    return code as string
  }

  async function personOf (value: string): Promise<PersonUuid | undefined> {
    return await service.findPersonBySocialKey(`email:${value}`)
  }

  async function accountOf (value: string): Promise<PersonUuid | undefined> {
    return await service.findPersonBySocialKey(`email:${value}`, true)
  }

  it('creates neither a person nor an account until the sign up is confirmed', async () => {
    const value = email('pending')

    const otp = await anon.requestEmailOtp(value)
    expect(otp.sent).toBe(true)

    expect(await personOf(value)).toBeUndefined()
    expect(await accountOf(value)).toBeUndefined()
  })

  it('completes the sign up through OTP confirmation', async () => {
    const value = email('link')

    await anon.requestEmailOtp(value)
    expect(await personOf(value)).toBeUndefined()
    expect(await accountOf(value)).toBeUndefined()

    const info = await anon.confirmEmailOtp(value, await codeOf(value), undefined, {
      personalData: true,
      rules: true
    })

    expect(await personOf(value)).toBe(info.account)
    expect(info.token).toBeDefined()
    expect(await accountOf(value)).toBe(info.account)
  })

  it('burns the OTP after the first use', async () => {
    const value = email('single-use')

    await anon.requestEmailOtp(value)
    const code = await codeOf(value)

    await anon.confirmEmailOtp(value, code, undefined, { personalData: true, rules: true })
    await expect(anon.confirmEmailOtp(value, code)).rejects.toThrow()
  })

  it('rejects an incorrect OTP without creating an account', async () => {
    const value = email('wrong-code')

    await anon.requestEmailOtp(value)
    const code = await codeOf(value)

    await expect(anon.confirmEmailOtp(value, code === '000000' ? '000001' : '000000')).rejects.toThrow()
    expect(await personOf(value)).toBeUndefined()
    expect(await accountOf(value)).toBeUndefined()
  })

  it('resends the code for an unfinished sign up from the login form', async () => {
    const value = email('login-pending')

    await anon.requestEmailOtp(value)
    // Used to throw AccountNotFound: the person had no account yet, so login was a dead end.
    await expect(anon.loginOtp(value)).resolves.toMatchObject({ sent: true })
  })

  it('answers the login form for an unknown email like a known one, without creating a person', async () => {
    const unknown = email('never-seen')

    await expect(anon.loginOtp(unknown)).resolves.toMatchObject({ sent: true })
    expect(await personOf(unknown)).toBeUndefined()
  })

  it('does not reveal through the sign up form whether an email is known', async () => {
    const existing = email('already-signed-up')
    await anon.requestEmailOtp(existing)
    await anon.confirmEmailOtp(existing, await codeOf(existing), undefined, {
      personalData: true,
      rules: true
    })

    // An account exists now; sign up must respond like any other attempt, not
    // AccountAlreadyExists.
    await expect(anon.requestEmailOtp(existing)).resolves.toMatchObject({ sent: true })
  })
})
