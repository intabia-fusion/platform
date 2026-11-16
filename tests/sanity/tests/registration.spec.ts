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

import { expect, test } from './fixtures'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import { AccountRole, type PersonUuid, SocialIdType, systemAccountUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'

import { getServiceAccountClient } from './API/AccountClient'
import { closeAccountDb, getOtpCode } from './API/AccountDb'
import { openMailbox } from './API/Mailbox'
import { LocalUrl, PlatformURI, PlatformUser } from './utils'
import { LoginPage } from './model/login-page'
import { RegistrationPage } from './model/registration-page'
import { SelectWorkspacePage } from './model/select-workspace-page'
import { OtpPage } from './model/otp-page'

// Before email-first registration, the following was the signup flow:
// Sign up writes a person and an email social id before the OTP code is entered; the account itself
// appears only on validateOtp or on following the activation link from the email.
//
// The code is random and goes to a mail queue with no consumer on the stand, so the link is rebuilt
// here with the stand secret - same trick as tests/API/AccountClient.ts uses for service tokens.
test.describe('registration test', () => {
  const secret = 'secret'
  const week = 7 * 24 * 60 * 60
  const firstName = 'Test'
  const lastName = 'Person'

  let loginPage: LoginPage
  let registrationPage: RegistrationPage
  let selectWorkspacePage: SelectWorkspacePage
  let runId: string

  const anon = getAccountClient(LocalUrl)

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'en')
    })
    loginPage = new LoginPage(page)
    registrationPage = new RegistrationPage(page)
    selectWorkspacePage = new SelectWorkspacePage(page)
    runId = `${Date.now()}`
  })

  test.afterAll(async () => {
    await closeAccountDb()
  })

  // Fresh addresses per run: a person left without an account would already have one next run.
  function email (name: string): string {
    return `signup-${runId}-${name}@test.local`
  }

  function confirmToken (person: PersonUuid, value: string, expSec: number): string {
    return generateToken(person, undefined, { confirmEmail: value }, secret, {
      exp: Math.floor(Date.now() / 1000) + expSec
    })
  }

  test('signup route opens password login when OTP is disabled', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('login-method', 'otp')
    })
    await page.route('**/config.json', async (route) => {
      const response = await route.fetch()
      const config = await response.json()
      await route.fulfill({ response, json: { ...config, USE_OTP: 'false' } })
    })
    await page.goto(`${PlatformURI}/login/signup`)
    await expect(page).toHaveURL(/\/login\/login(?:\?.*)?$/)
    await expect(page.locator('input[name="current-password"]')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Login with code' })).toHaveCount(0)
    await expect(page.locator('input[name="first-name"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveCount(0)
  })

  async function startSignUp (value: string): Promise<PersonUuid> {
    const service = await getServiceAccountClient('tool')
    const { uuid: person } = await service.ensurePerson(SocialIdType.EMAIL, value, firstName, lastName)
    // The account only appears once the sign up is confirmed.
    expect(await service.findPersonBySocialKey(`email:${value}`, true)).toBeUndefined()

    return person as PersonUuid
  }

  async function accountOf (value: string): Promise<PersonUuid | undefined> {
    const service = await getServiceAccountClient('tool')
    return await service.findPersonBySocialKey(`email:${value}`, true)
  }

  test('activation link completes the sign up and lands on the registered page', async ({ page }) => {
    const value = email('link')
    const person = await startSignUp(value)

    await registrationPage.openConfirmLink(confirmToken(person, value, week))
    await registrationPage.acceptRegistrationConsent()

    await page.waitForURL((url) => url.pathname.startsWith('/login/registered'))
    await registrationPage.checkRegistrationComplete(`${firstName} ${lastName}`)
    expect(await accountOf(value)).toBe(person)
  })

  test('registered page leads to workspace creation', async ({ page }) => {
    const value = email('create-ws')
    const person = await startSignUp(value)

    await registrationPage.openConfirmLink(confirmToken(person, value, week))
    await registrationPage.acceptRegistrationConsent()
    await page.waitForURL((url) => url.pathname.startsWith('/login/registered'))
    await registrationPage.clickCreateWorkspace()

    await page.waitForURL((url) => url.pathname.startsWith('/login/createWorkspace'))
  })

  test('a second visit reports that the account already exists', async ({ page }) => {
    const value = email('second-visit')
    const person = await startSignUp(value)
    const token = confirmToken(person, value, week)

    await registrationPage.openConfirmLink(token)
    await registrationPage.acceptRegistrationConsent()
    await page.waitForURL((url) => url.pathname.startsWith('/login/registered'))

    // The email is verified now, so confirmEmail refuses it - that is what makes the link single use.
    await registrationPage.openConfirmLink(token)
    await registrationPage.checkAlreadyRegistered()

    await registrationPage.clickContinue()
    await page.waitForURL((url) => url.pathname.startsWith('/login/selectWorkspace'))
  })

  test('an expired activation link is rejected and creates no account', async () => {
    const value = email('expired')
    const person = await startSignUp(value)

    await registrationPage.openConfirmLink(confirmToken(person, value, -60))

    await registrationPage.checkExpiredLink()
    expect(await accountOf(value)).toBeUndefined()
  })

  test('a short activation link works and stops working once used', async ({ page, request }) => {
    const value = email('short-link')
    const person = await startSignUp(value)

    // The email carries a short id rather than a raw JWT; mail clients mangle long tokens.
    const serviceToken = generateToken(systemAccountUuid, undefined, { service: 'tool' }, secret)
    const created = await request.post(`${LocalUrl}api/v1/createShortLink`, {
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      data: { payload: confirmToken(person, value, week), workspaceId: '' }
    })
    expect(created.status()).toBe(200)
    const shortId = (await created.json()).shortId

    await registrationPage.openConfirmLink(shortId)
    await registrationPage.acceptRegistrationConsent()
    await page.waitForURL((url) => url.pathname.startsWith('/login/registered'))
    expect(await accountOf(value)).toBe(person)

    // confirm drops the row, so resolving it now 404s and the page reports an invalid link.
    await registrationPage.openConfirmLink(shortId)
    await registrationPage.checkInvalidLink()
  })

  test('email-first confirmation creates the account only once and restores onboarding', async () => {
    const value = email('email-first')
    const mailbox = await openMailbox()
    try {
      const service = await getServiceAccountClient('tool')
      await expect(anon.requestEmailOtp(value)).resolves.toMatchObject({ sent: true })
      expect(await service.findPersonBySocialKey(`email:${value}`)).toBeUndefined()
      const code = /\b\d{6}\b/.exec((await mailbox.waitFor(value)).text)?.[0]
      expect(code).toBeDefined()
      const wrong = code === '000000' ? '000001' : '000000'
      await expect(anon.confirmEmailOtp(value, wrong)).rejects.toThrow(/InvalidOtp/)
      expect(await service.findPersonBySocialKey(`email:${value}`)).toBeUndefined()
      await expect(anon.validateOtp(value, code as string)).rejects.toThrow(/InvalidOtp/)
      expect(await service.findPersonBySocialKey(`email:${value}`)).toBeUndefined()
      const info = await anon.confirmEmailOtp(value, code as string, undefined, {
        personalData: true,
        rules: true
      })
      expect(info.onboarding).toMatchObject({ intent: { kind: 'workspace' }, stage: 'workspace' })
      expect(await accountOf(value)).toBe(info.account)
      await expect(anon.confirmEmailOtp(value, code as string)).rejects.toThrow(/InvalidOtp/)
      const user = getAccountClient(LocalUrl, info.token)
      await expect(user.createWorkspace('Registration test', '', undefined, true)).resolves.toMatchObject({
        account: info.account
      })
      await expect(user.setOnboardingName(firstName, lastName)).resolves.toMatchObject({ stage: 'complete' })
      await expect(user.getLoginInfoByToken()).resolves.toMatchObject({
        account: info.account,
        onboarding: { intent: { kind: 'workspace' }, stage: 'complete', workspaceName: 'Registration test' }
      })
    } finally {
      await mailbox.close()
    }
  })

  test('email-first registration restores its steps and creates the chosen workspace', async ({ page }) => {
    const value = email('ui')
    const mailbox = await openMailbox()
    try {
      const service = await getServiceAccountClient('tool')
      await loginPage.enableOtp()
      await page.goto(`${PlatformURI}/login/login`)
      await page.evaluate(() => {
        localStorage.removeItem('login-consent-personal-data')
        localStorage.removeItem('login-consent-rules')
      })
      await page.reload()
      await page.locator('input[name="email"]').waitFor({ state: 'visible' })
      const password = page.locator('input[name="current-password"]')
      if (await password.isVisible()) await page.getByRole('link', { name: 'Login with code' }).click()
      const emailInput = page.locator('input[name="email"]')
      const personal = page.locator('[data-testid="checkbox-personal-data"]')
      const rules = page.locator('[data-testid="checkbox-rules"]')
      const getCode = page.getByRole('button', { name: 'Get code' })
      const requests: Array<{ method: string, consent: unknown }> = []
      page.on('request', (request) => {
        if (request.method() !== 'POST' || !request.url().includes('/_account')) return
        const payload = request.postDataJSON()
        if (payload?.method === 'requestEmailOtp' || payload?.method === 'confirmEmailOtp') {
          requests.push({ method: payload.method, consent: payload.params?.consent })
        }
      })
      await emailInput.fill(value)
      await expect(personal).not.toBeChecked()
      await expect(rules).not.toBeChecked()
      await expect(getCode).toBeDisabled()
      await emailInput.press('Enter')
      await personal.focus()
      await page.keyboard.press('Space')
      await expect(personal).toBeChecked()
      await expect(getCode).toBeDisabled()
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('input[name="email"]')
        const rulesCheckbox = document.querySelector<HTMLInputElement>('[data-testid="checkbox-rules"]')
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        rulesCheckbox?.click()
      })
      await page.waitForTimeout(200)
      await expect(rules).toBeChecked()
      expect(requests).toHaveLength(0)
      await expect(personal.locator('..')).not.toHaveClass(/compact/)
      await page.reload()
      await expect(personal).toBeChecked()
      await expect(rules).toBeChecked()
      await expect(personal.locator('..')).toHaveClass(/compact/)
      await emailInput.fill(value)
      await page.evaluate(() => {
        window.open = (url) => {
          sessionStorage.setItem('opened-consent-link', String(url))
          return null
        }
      })
      const agreement = personal.locator('..').locator('a').first()
      const agreementUrl = await agreement.evaluate((anchor) => (anchor as HTMLAnchorElement).href)
      await agreement.press('Enter')
      expect(await page.evaluate(() => sessionStorage.getItem('opened-consent-link'))).toBe(agreementUrl)
      await page.waitForTimeout(200)
      expect(requests).toHaveLength(0)
      await rules.focus()
      await page.keyboard.press('Space')
      await expect(rules).not.toBeChecked()
      await page.reload()
      await expect(personal).toBeChecked()
      await expect(rules).not.toBeChecked()
      await expect(personal.locator('..')).not.toHaveClass(/compact/)
      await rules.check()
      await emailInput.fill(value)
      await getCode.click()
      const otp = new OtpPage(page)
      await otp.checkIfCodeScreenIsShown(value)
      expect(requests).toEqual([{ method: 'requestEmailOtp', consent: { personalData: true, rules: true } }])
      expect(await service.findPersonBySocialKey(`email:${value}`)).toBeUndefined()
      const code = /\b\d{6}\b/.exec((await mailbox.waitFor(value)).text)?.[0]
      expect(code).toBeDefined()
      await otp.enterCode(code as string)
      await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
      await expect(personal).toHaveCount(0)
      expect(requests).toEqual([
        { method: 'requestEmailOtp', consent: { personalData: true, rules: true } },
        { method: 'confirmEmailOtp', consent: { personalData: true, rules: true } }
      ])
      const workspace = page.locator('input[name="workspace"]')
      await expect(workspace).toHaveValue(`${value.split('@')[0]} Personal Space`)
      expect(await page.evaluate(() => localStorage.getItem('login:metadata:AuthEmail'))).toBeNull()
      await page.reload()
      await expect(workspace).toHaveValue(`${value.split('@')[0]} Personal Space`)
      await workspace.fill(`Registration ${runId}`)
      const creation = page.waitForResponse((response) => {
        const request = response.request()
        return (
          request.method() === 'POST' &&
          request.url().includes('/_account') &&
          request.postDataJSON()?.method === 'createWorkspace'
        )
      })
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.locator('input[name="given-name"]')).toBeVisible()
      const created = (await (await creation).json()).result
      expect(created.workspace).toBeDefined()
      const user = getAccountClient(LocalUrl, created.token)
      await expect(user.getLoginInfoByToken()).resolves.toMatchObject({
        onboarding: { stage: 'name', workspace: created.workspace }
      })
      await page.reload()
      await expect(page.locator('input[name="given-name"]')).toBeVisible()
      await page.locator('input[name="given-name"]').fill(firstName)
      await page.locator('input[name="family-name"]').fill(lastName)
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.waitForURL((url) => url.pathname.startsWith('/workbench/'))
      expect((await user.getUserWorkspaces()).filter((item) => item.name === `Registration ${runId}`)).toHaveLength(1)
      const account = await accountOf(value)
      expect(account).toBeDefined()
    } finally {
      await mailbox.close()
    }
  })

  test('consent changes in separate tabs do not overwrite each other', async ({ page }) => {
    await loginPage.enableOtp()
    await loginPage.goto()
    await page.evaluate(() => {
      localStorage.removeItem('login-consent-personal-data')
      localStorage.removeItem('login-consent-rules')
    })
    await page.reload()
    await expect(page.locator('[data-testid="checkbox-personal-data"]')).not.toBeChecked()
    const second = await page.context().newPage()
    try {
      const secondLogin = new LoginPage(second)
      await secondLogin.enableOtp()
      await secondLogin.goto()
      await expect(second.locator('[data-testid="checkbox-rules"]')).not.toBeChecked()
      await page.locator('[data-testid="checkbox-personal-data"]').check()
      await second.locator('[data-testid="checkbox-rules"]').check()
      await page.reload()
      await expect(page.locator('[data-testid="checkbox-personal-data"]')).toBeChecked()
      await expect(page.locator('[data-testid="checkbox-rules"]')).toBeChecked()
    } finally {
      await second.close()
    }
  })

  test('existing email login accepts consent before the code', async ({ page }) => {
    const value = email('returning')
    const signupMailbox = await openMailbox()
    try {
      await anon.requestEmailOtp(value)
      const code = /\b\d{6}\b/.exec((await signupMailbox.waitFor(value)).text)?.[0]
      expect(code).toBeDefined()
      await anon.confirmEmailOtp(value, code as string, undefined, { personalData: true, rules: true })
    } finally {
      await signupMailbox.close()
    }
    const loginMailbox = await openMailbox()
    try {
      await loginPage.enableOtp()
      await loginPage.goto()
      await page.evaluate(() => {
        localStorage.removeItem('login-consent-personal-data')
        localStorage.removeItem('login-consent-rules')
      })
      await page.reload()
      await expect(page.locator('[data-testid="checkbox-personal-data"]')).not.toBeChecked()
      await expect(page.locator('[data-testid="checkbox-rules"]')).not.toBeChecked()
      await loginPage.loginWithCode(value)
      const code = /\b\d{6}\b/.exec((await loginMailbox.waitFor(value)).text)?.[0]
      expect(code).toBeDefined()
      await new OtpPage(page).enterCode(code as string)
      await page.waitForURL((url) => url.pathname.startsWith('/login/onboarding'))
      await expect(page.locator('[data-testid="checkbox-personal-data"]')).toHaveCount(0)
    } finally {
      await loginMailbox.close()
    }
  })

  test('provider callback resumes the existing email registration', async ({ page }) => {
    const value = email('provider-callback')
    const mailbox = await openMailbox()
    try {
      await anon.requestEmailOtp(value)
      const code = /\b\d{6}\b/.exec((await mailbox.waitFor(value)).text)?.[0]
      expect(code).toBeDefined()
      const info = await anon.confirmEmailOtp(value, code as string, undefined, {
        personalData: true,
        rules: true
      })

      await page.goto(`${PlatformURI}/login/auth?${encodeURIComponent(`token=${info.token}`)}`)
      await expect(page).toHaveURL(/\/login\/onboarding/)
      await expect(page.locator('input[name="workspace"]')).toBeVisible()
    } finally {
      await mailbox.close()
    }
  })

  test('new provider identity requires consent after the callback', async ({ page }) => {
    let accepted = false
    await page.route('**/auth/consent?*', async (route) => {
      const query = new URL(route.request().url()).searchParams
      accepted =
        query.get('nonce') === 'provider-nonce' &&
        query.get('agreedPersonalData') === 'true' &&
        query.get('agreedRules') === 'true'
      await route.fulfill({ status: 200, body: 'consent received' })
    })
    await page.goto(`${PlatformURI}/login/auth?providerConsent=provider-nonce`)
    const personal = page.locator('[data-testid="checkbox-personal-data"]')
    const rules = page.locator('[data-testid="checkbox-rules"]')
    await expect(personal).toBeVisible()
    const proceed = page.getByRole('button', { name: 'Proceed', exact: true })
    await expect(proceed).toBeDisabled()
    await personal.check()
    await expect(proceed).toBeDisabled()
    await rules.check()
    await proceed.click()
    await expect.poll(() => accepted).toBe(true)
  })

  test('provider and password login remain available without registration consent', async ({ page }) => {
    await loginPage.enableOtp()
    await page.route('**/providers', async (route) => {
      await route.fulfill({ json: [{ name: 'google', displayName: 'Google' }] })
    })
    await loginPage.goto()
    await loginPage.inputEmail().waitFor({ state: 'visible' })
    const password = page.locator('input[name="current-password"]')
    if (await password.isVisible()) await page.getByRole('link', { name: 'Login with code' }).click()

    const provider = page.getByRole('link', { name: 'Continue with Google' })
    await expect(page.locator('[data-testid="checkbox-personal-data"]')).toBeVisible()
    await expect(page.locator('[data-testid="checkbox-rules"]')).toBeVisible()
    await expect(provider).toBeEnabled()
    await expect(provider).toHaveAttribute('href', /\/auth\/google/)

    await page.getByRole('link', { name: 'Login with password' }).click()
    await expect(page.locator('[data-testid="checkbox-personal-data"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="checkbox-rules"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Login with code' })).toBeVisible()
    await loginPage.inputEmail().fill('existing@example.com')
    await loginPage.inputPassword().fill('password')
    await expect(loginPage.buttonLogin()).toBeEnabled()
    await expect(provider).toBeEnabled()
  })

  test('guest login remains available without registration consent', async ({ page }) => {
    let guestRequests = 0
    await page.route(/\/_account\/?$/, async (route) => {
      const method = route.request().method() === 'POST' ? route.request().postDataJSON()?.method : undefined
      if (method === 'isAllowReadOnlyGuests') {
        await route.fulfill({ json: { result: { allowed: true } } })
      } else if (method === 'loginAsGuest') {
        guestRequests++
        await route.fulfill({ json: { result: null } })
      } else {
        await route.continue()
      }
    })
    await loginPage.goto()
    const guest = page.getByText('Continue as a guest').locator('..')
    await expect(guest).toHaveAttribute('aria-disabled', 'false')
    await guest.click()
    await expect.poll(() => guestRequests).toBe(1)
  })

  for (const via of ['provider', 'direct'] as const) {
    test(`${via} auto-join continues unfinished onboarding`, async ({ page, sharedWorkspace }) => {
      const value = email(`auto-${via}`)
      const mailbox = await openMailbox()
      try {
        const shared = await sharedWorkspace(1)
        const scheduleToken = generateToken(shared.ws.account, shared.ws.workspace, { service: 'schedule' }, secret)
        const schedule = getAccountClient(LocalUrl, scheduleToken)
        const link = await schedule.createInviteLink(value, AccountRole.Guest, true, firstName, lastName)
        const inviteId = new URL(link).searchParams.get('inviteId')
        expect(inviteId).toBeTruthy()

        await anon.requestEmailOtp(value)
        const code = /\b\d{6}\b/.exec((await mailbox.waitFor(value)).text)?.[0]
        expect(code).toBeDefined()
        const info = await anon.confirmEmailOtp(value, code as string, undefined, {
          personalData: true,
          rules: true
        })
        if (via === 'provider') {
          const query = `token=${info.token}&inviteId=${inviteId}&autoJoin=true`
          await page.goto(`${PlatformURI}/login/auth?${encodeURIComponent(query)}`)
        } else {
          await page
            .context()
            .addCookies([{ name: 'account-metadata-Token', value: info.token as string, url: PlatformURI }])
          await page.goto(`${PlatformURI}/login/join?inviteId=${inviteId}&autoJoin&firstName=${firstName}`)
        }

        await expect(page).toHaveURL(/\/login\/join/)
        await expect.poll(() => new URL(page.url()).searchParams.has('autoJoin')).toBe(false)
        expect(new URL(page.url()).searchParams.has('token')).toBe(false)
        await page.getByRole('button', { name: /Join as/ }).click()
        await page.locator('input[name="given-name"]').fill(firstName)
        await page.locator('input[name="family-name"]').fill(lastName)
        await page.getByRole('button', { name: 'Join workspace' }).click()
        await page.waitForURL((url) => url.pathname.startsWith(`/workbench/${shared.ws.workspaceUrl}`))
        const account = getAccountClient(LocalUrl, info.token)
        await expect(account.getLoginInfoByToken()).resolves.toMatchObject({
          onboarding: { intent: { kind: 'invite', inviteId }, stage: 'complete' }
        })
      } finally {
        await mailbox.close()
      }
    })
  }

  test('an invalid invitation does not offer registration or login', async ({ page }) => {
    await page.goto(`${PlatformURI}/login/join?inviteId=0`)
    await expect(page.getByText('This link is no longer valid')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create new account' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Already have an account' })).toHaveCount(0)
  })

  for (const profile of ['new', 'partial', 'complete'] as const) {
    test(`invitation asks only for missing names: ${profile}`, async ({ page, sharedWorkspace }) => {
      const value = email(`invite-${profile}`)
      const shared = await sharedWorkspace(1)
      const owner = getAccountClient(LocalUrl, shared.ws.token)
      const inviteId = await owner.createInvite(60 * 60 * 1000, 1, AccountRole.User)
      const invite = await owner.getInviteInfo(inviteId)
      const service = await getServiceAccountClient('tool')
      if (profile !== 'new') {
        await service.signUp(value, '1234', 'Existing', profile === 'complete' ? 'Name' : '')
      }

      await loginPage.enableOtp()
      await page.goto(`${PlatformURI}/login/join?inviteId=${inviteId}`)
      await page.evaluate(() => {
        localStorage.removeItem('login-consent-personal-data')
        localStorage.removeItem('login-consent-rules')
      })
      await page.reload()
      await expect(page.locator('input[name="email"]')).toBeVisible()
      const context = page.locator('.invitation-context')
      await expect(context).toHaveCount(1)
      await expect(context).toContainText(shared.data.workspaceName)
      expect(invite.inviterName).toBeDefined()
      await expect(context).toContainText(shared.data.firstName)
      await expect(context).toContainText(shared.data.lastName)
      const requests: Array<{ method: string, consent: unknown }> = []
      page.on('request', (request) => {
        if (request.method() !== 'POST' || !request.url().includes('/_account')) return
        const payload = request.postDataJSON()
        if (payload?.method === 'requestEmailOtp' || payload?.method === 'confirmEmailOtp') {
          requests.push({ method: payload.method, consent: payload.params?.consent })
        }
      })
      await page.locator('input[name="email"]').fill(value)
      await expect(page.getByRole('button', { name: 'Get code', exact: true })).toBeDisabled()
      await page.locator('input[name="email"]').press('Enter')
      await page.waitForTimeout(200)
      expect(requests).toHaveLength(0)
      await loginPage.acceptEmailConsent()
      await page.getByRole('button', { name: 'Get code', exact: true }).click()
      const otp = new OtpPage(page)
      await otp.checkIfCodeScreenIsShown(value)
      await expect(context).toHaveCount(1)
      await expect(context).toContainText(shared.data.workspaceName)
      await expect(context).toContainText(shared.data.firstName)
      await expect(context).toContainText(shared.data.lastName)
      await otp.enterCode(await getOtpCode(value))
      await expect(page.locator('[data-testid="checkbox-personal-data"]')).toHaveCount(0)
      expect(requests).toEqual([
        { method: 'requestEmailOtp', consent: { personalData: true, rules: true } },
        { method: 'confirmEmailOtp', consent: { personalData: true, rules: true } }
      ])

      await expect(context).toHaveCount(1)
      await expect(context).toContainText(shared.data.workspaceName)
      await expect(context).toContainText(shared.data.firstName)
      await expect(context).toContainText(shared.data.lastName)
      await expect(page.locator('input[name="workspace"]')).toHaveCount(0)
      const first = page.locator('input[name="given-name"]')
      const last = page.locator('input[name="family-name"]')
      await expect(first).toHaveCount(profile === 'new' ? 1 : 0)
      await expect(last).toHaveCount(profile === 'complete' ? 0 : 1)
      const account = await accountOf(value)
      expect(account).toBeDefined()
      expect((await owner.getWorkspaceMembers()).some((member) => member.person === account)).toBe(false)
      const methods: string[] = []
      let completedInviteId: string | undefined
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/_account')) {
          const payload = request.postDataJSON()
          methods.push(payload?.method)
          if (payload?.method === 'completeOnboardingInvite') completedInviteId = payload.params?.inviteId
        }
      })
      if (profile === 'new') await first.fill('First')
      if (profile !== 'complete') await last.fill('Last')
      await page.getByRole('button', { name: 'Join workspace', exact: true }).click()
      await page.waitForURL((url) => url.pathname.startsWith(`/workbench/${shared.ws.workspaceUrl}`))
      expect(methods).toContain(profile === 'new' ? 'completeOnboardingInvite' : 'joinByInvite')
      if (profile === 'new') expect(completedInviteId).toBe(inviteId)
      const expectedFirst = profile === 'new' ? 'First' : 'Existing'
      const expectedLast = profile === 'complete' ? 'Name' : 'Last'
      expect((await service.getPersonInfo(account as PersonUuid)).name).toBe(`${expectedFirst} ${expectedLast}`)
      expect((await owner.getWorkspaceMembers()).some((member) => member.person === account)).toBe(true)
    })
  }

  test('an active session confirms an invitation without requesting email or names', async ({
    page,
    sharedWorkspace
  }) => {
    const value = email('invite-session')
    const shared = await sharedWorkspace(1)
    const owner = getAccountClient(LocalUrl, shared.ws.token)
    const inviteId = await owner.createInvite(60 * 60 * 1000, 1, AccountRole.User)
    const service = await getServiceAccountClient('tool')
    const account = await service.signUp(value, '1234', 'Existing', 'Name')
    await page
      .context()
      .addCookies([{ name: 'account-metadata-Token', value: account.token as string, url: PlatformURI }])
    await loginPage.enableOtp()
    await page.goto(`${PlatformURI}/login/join?inviteId=${inviteId}`)
    const join = page.getByRole('button', { name: 'Join workspace', exact: true })
    await expect(join).toBeVisible()
    await expect(page.locator('input[name="email"], input[name="given-name"], input[name="family-name"]')).toHaveCount(
      0
    )
    expect((await owner.getWorkspaceMembers()).some((member) => member.person === account.account)).toBe(false)
    await join.click()
    await page.waitForURL((url) => url.pathname.startsWith(`/workbench/${shared.ws.workspaceUrl}`))
  })

  test('a new invitation completes the current account onboarding', async ({ page, sharedWorkspace }) => {
    const value = email('replacement-invite')
    const mailbox = await openMailbox()
    try {
      const shared = await sharedWorkspace(1)
      const owner = getAccountClient(LocalUrl, shared.ws.token)
      const original = await owner.createInvite(60 * 60 * 1000, 1, AccountRole.User)
      const replacement = await owner.createInvite(60 * 60 * 1000, 1, AccountRole.User)
      await anon.requestEmailOtp(value)
      const code = /\b\d{6}\b/.exec((await mailbox.waitFor(value)).text)?.[0]
      expect(code).toBeDefined()
      const info = await anon.confirmEmailOtp(
        value,
        code as string,
        { kind: 'invite', inviteId: original },
        { personalData: true, rules: true }
      )
      const account = getAccountClient(LocalUrl, info.token)
      await page
        .context()
        .addCookies([{ name: 'account-metadata-Token', value: info.token as string, url: PlatformURI }])
      await page.goto(`${PlatformURI}/login/join?inviteId=${replacement}`)
      await page.getByRole('button', { name: /Join as/ }).click()
      await page.locator('input[name="given-name"]').fill(firstName)
      await page.locator('input[name="family-name"]').fill(lastName)
      await page.getByRole('button', { name: 'Join workspace' }).click()
      await page.waitForURL((url) => url.pathname.startsWith(`/workbench/${shared.ws.workspaceUrl}`))
      await expect(account.getLoginInfoByToken()).resolves.toMatchObject({
        onboarding: { intent: { kind: 'invite', inviteId: replacement }, stage: 'complete' }
      })
    } finally {
      await mailbox.close()
    }
  })

  test('sign in and sign up never reveal whether an address is known', async () => {
    const unknown = email('never-seen')

    await expect(anon.loginOtp(unknown)).resolves.toMatchObject({ sent: true })
    const service = await getServiceAccountClient('tool')
    expect(await service.findPersonBySocialKey(`email:${unknown}`)).toBeUndefined()

    // A wrong code and an unknown address must fail the same way, or the pair of calls is an oracle.
    await expect(anon.validateOtp(unknown, '000000')).rejects.toThrow(/InvalidOtp/)
    const known = email('known')
    await startSignUp(known)
    await expect(anon.validateOtp(known, '000000')).rejects.toThrow(/InvalidOtp/)
  })

  test('the login form offers a way back when a session is already open', async ({ page }) => {
    await loginPage.enableOtp()
    await loginPage.goto()
    await loginPage.checkIfSignedInIsHidden()

    await loginPage.login(PlatformUser, '1234')
    await page.waitForURL((url) => url.pathname.startsWith('/login/selectWorkspace'))

    // Coming back to the login form with a live cookie used to be a dead end.
    await (await page.goto(`${PlatformURI}/login/login`))?.finished()
    await loginPage.checkIfSignedInIsShown()

    if (await loginPage.inputPassword().isVisible()) {
      await loginPage.loginWithCodeLink().click()
      await loginPage.checkIfSignedInIsShown()
    }

    await loginPage.clickSelectWorkspace()
    await page.waitForURL((url) => url.pathname.startsWith('/login/selectWorkspace'))
    await selectWorkspacePage.checkIfWorkspaceExists('sanity-ws')
  })
})
