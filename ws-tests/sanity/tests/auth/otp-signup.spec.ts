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

import { expect, test } from '@playwright/test'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { type PersonUuid, SocialIdType } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'
import {
  closeAccountDb,
  getOtpCode,
  getServiceAccountClient,
  LocalUrl,
  LoginPage,
  OtpPage,
  RegistrationPage
} from '@hcengineering/tests-sanity'

// The mail queue has no consumer here, so the code is read from account_db (API/AccountDb).
test.describe('otp signup', () => {
  const firstName = 'Test'
  const lastName = 'Person'

  let loginPage: LoginPage
  let otpPage: OtpPage
  let registrationPage: RegistrationPage
  let runId: string

  const anon = getAccountClient(LocalUrl)

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    otpPage = new OtpPage(page)
    registrationPage = new RegistrationPage(page)
    runId = `${Date.now()}`
  })

  test.afterAll(async () => {
    await closeAccountDb()
  })

  // Fresh addresses prevent accounts and OTP rate limits from affecting later runs.
  function email (name: string): string {
    return `otp-${runId}-${name}@test.local`
  }

  async function personOf (value: string): Promise<PersonUuid | undefined> {
    const service = await getServiceAccountClient('tool')
    return await service.findPersonBySocialKey(`email:${value}`)
  }

  async function accountOf (value: string): Promise<PersonUuid | undefined> {
    const service = await getServiceAccountClient('tool')
    return await service.findPersonBySocialKey(`email:${value}`, true)
  }

  test('sign up with a real code creates the account', async ({ page }) => {
    const value = email('code')

    await loginPage.goto()
    await loginPage.loginWithCode(value)
    await otpPage.checkIfCodeScreenIsShown(value)

    // Neither person nor account exists before the code is entered.
    expect(await personOf(value)).toBeUndefined()
    expect(await accountOf(value)).toBeUndefined()

    const validationRequest = page.waitForRequest((request) => {
      if (request.method() !== 'POST' || !request.url().includes('/_account')) return false
      return request.postDataJSON()?.method === 'confirmEmailOtp'
    })
    await otpPage.enterCode(await getOtpCode(value))
    expect((await validationRequest).postDataJSON().params).not.toHaveProperty('password')
    expect((await validationRequest).postDataJSON().params.consent).toEqual({ personalData: true, rules: true })

    await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
    expect(await accountOf(value)).toBeDefined()
  })

  test('a wrong code is rejected and the account is not created', async ({ page }) => {
    const value = email('wrong-code')

    await loginPage.goto()
    await loginPage.loginWithCode(value)
    const code = await getOtpCode(value)
    await otpPage.enterCode(code === '000000' ? '000001' : '000000')

    await expect(otpPage.invalidCodeMessage()).toBeVisible()
    expect(await accountOf(value)).toBeUndefined()
  })

  test('an unfinished sign up can be completed from the login form', async ({ page }) => {
    const value = email('unfinished')

    // Leave an unconfirmed request, exactly like closing the tab before entering the code.
    await anon.requestEmailOtp(value)
    expect(await accountOf(value)).toBeUndefined()

    await loginPage.goto()
    await loginPage.loginWithCode(value)
    await otpPage.checkIfCodeScreenIsShown(value)

    await otpPage.enterCode(await getOtpCode(value))
    await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
    expect(await accountOf(value)).toBeDefined()
  })

  test('an unknown address gets the code screen and a wrong code, never a hint', async ({ page }) => {
    const value = email('unknown')

    await loginPage.goto()
    await loginPage.loginWithCode(value)

    // Nothing is created and nothing is revealed - the screen looks like any other sign in.
    await otpPage.checkIfCodeScreenIsShown(value)
    expect(await personOf(value)).toBeUndefined()

    const code = await getOtpCode(value)
    await otpPage.enterCode(code === '000000' ? '000001' : '000000')
    await expect(otpPage.invalidCodeMessage()).toBeVisible()
  })

  test('the activation link completes a legacy unconfirmed sign up', async ({ page }) => {
    const value = email('link')

    const service = await getServiceAccountClient('tool')
    const { uuid: person } = await service.ensurePerson(SocialIdType.EMAIL, value, firstName, lastName)
    const token = generateToken(person, undefined, { confirmEmail: value }, 'secret', {
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    })

    await registrationPage.openConfirmLink(token)
    await registrationPage.acceptRegistrationConsent()

    await page.waitForURL((url) => url.pathname.startsWith('/login/registered'))
    await registrationPage.checkRegistrationComplete(`${firstName} ${lastName}`)
    expect(await accountOf(value)).toBe(person)

    // The link is single use: the email is verified now, so a second visit only offers a way on.
    await registrationPage.openConfirmLink(token)
    await registrationPage.checkAlreadyRegistered()
  })
})
