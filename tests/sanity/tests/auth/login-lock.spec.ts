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

import { getClient as getAccountClient } from '@hcengineering/account-client'
import { expect, test } from '../fixtures'
import { openMailbox } from '../API/Mailbox'
import { LoginPage } from '../model/login-page'
import { OtpPage } from '../model/otp-page'
import { LocalUrl, PlatformURI } from '../utils'

// Five wrong codes lock the code sign in and mail a one-time link; the link is spent on the click.
test.describe('login code lock', () => {
  test('five wrong codes lock the code login and the mailed link signs in once', async ({ page }) => {
    const anon = getAccountClient(LocalUrl)
    const email = `lock-${Date.now()}@test.local`
    await anon.signUp(email, '1234', 'Lock', 'Test')

    const lockPart = '/login/loginLink#token='
    const mailbox = await openMailbox()
    try {
      const loginPage = new LoginPage(page)
      const otpPage = new OtpPage(page)
      await loginPage.goto()
      await loginPage.loginWithCode(email)
      await otpPage.checkIfCodeScreenIsShown(email)

      await otpPage.enterCode('000000')
      await expect(otpPage.invalidCodeMessage()).toBeVisible()
      for (let i = 0; i < 4; i++) {
        await expect(anon.validateOtp(email, '000000')).rejects.toThrow(/InvalidOtp/)
      }

      await expect(anon.loginOtp(email)).rejects.toThrow(/TooManyOtpAttempts/)

      const letter = await mailbox.waitFor(email, lockPart)
      // Give a duplicate a chance to arrive before counting.
      await page.waitForTimeout(2000)
      expect(mailbox.letters(email, lockPart)).toHaveLength(1)

      const token = /\/login\/loginLink#token=([0-9a-f]+)/.exec(letter.text)?.[1]
      expect(token).toBeDefined()
      // The letter carries the front url from the account config, which can differ from the stand.
      const link = `${PlatformURI}/login/loginLink#token=${token as string}`

      await page.goto(link)
      await expect(loginPage.buttonLogin()).toBeVisible()
      await expect.poll(() => new URL(page.url()).hash).toBe('')
      // Opening the link spends nothing.
      await expect(anon.loginOtp(email)).rejects.toThrow(/TooManyOtpAttempts/)

      await loginPage.buttonLogin().click()
      await expect(page).toHaveURL(/\/login\/selectWorkspace/)

      await page.goto(link)
      await loginPage.buttonLogin().click()
      await expect(page.getByText('This sign-in link has expired or has already been used')).toBeVisible()

      await expect(anon.loginOtp(email)).resolves.toMatchObject({ sent: true })
    } finally {
      await mailbox.close()
    }
  })
})
