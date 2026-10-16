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

import { expect, type Locator, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { ApiEndpoint } from '../API/Api'
import { DEV_OTP } from '../API/Billing'
import { LoginPage } from '../model/login-page'
import { PlatformAdmin, generateId, rageClick } from '../utils'

// FUSIO-1584: a rage click on an async admin button runs its action once (one confirm popup,
// not stacked), and the button works again after.
//
// Admin console logs in as a separate 'admin' identity (ADMIN_EMAILS on the local stand) and
// needs its own OTP-gated session - the default context (no storageState override) starts
// clean, so no `test.use({ storageState })` here.

// Admin-session OTP and every per-action OTP confirm accept the stand's fixed dev code
// (ADMIN_OTP_DEV_CODE, see tests/sanity/tests/API/Billing.ts DEV_OTP) - no need to read mail.
async function openAdminTab (page: Page, tabId: string): Promise<void> {
  const loginPage = new LoginPage(page)
  await loginPage.gotoAdmin()
  await loginPage.login(PlatformAdmin, '1234')
  await page.getByPlaceholder('Code').fill(DEV_OTP)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator(`[data-id="tab-${tabId}"]`).click()
}

// Every destructive admin button here opens the same OtpConfirmDialog before any RPC fires -
// a rage click either stacks N of these (bug) or opens exactly 1 (guard works). Closing it with
// Escape without ever typing a real code means the RPC never reaches the server either way.
function otpPopup (page: Page): Locator {
  return page.locator('div.popup').filter({ has: page.getByPlaceholder('Code') })
}

test.describe('Rage click: admin accounts', () => {
  test('Account "Block" opens one confirm popup, not stacked', async ({ page, request }) => {
    const email = `rage-block-${generateId(8)}@test.local`
    const api = new ApiEndpoint(request)
    await api.createAccount(email, '1234', 'Rage', 'Block')

    await openAdminTab(page, 'accounts')
    await page.locator('[data-testid="account-search-container"] input').fill(email)
    await page.keyboard.press('Enter')
    const row = page.locator('tr', { hasText: email })
    await expect(row).toHaveCount(1, { timeout: 10000 })
    await row.getByRole('button', { name: 'Details' }).click()

    const blockButton = page.getByRole('button', { name: 'Block', exact: true })
    const otp = otpPopup(page)

    await rageClick(blockButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await blockButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Account "Delete" opens one confirm popup, not stacked', async ({ page, request }) => {
    const email = `rage-delacc-${generateId(8)}@test.local`
    const api = new ApiEndpoint(request)
    await api.createAccount(email, '1234', 'Rage', 'DelAcc')

    await openAdminTab(page, 'accounts')
    await page.locator('[data-testid="account-search-container"] input').fill(email)
    await page.keyboard.press('Enter')
    const row = page.locator('tr', { hasText: email })
    await expect(row).toHaveCount(1, { timeout: 10000 })
    await row.getByRole('button', { name: 'Details' }).click()

    // Account owns no workspace -> canDeleteAccount resolves true -> straight to the OTP dialog.
    const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })
    const otp = otpPopup(page)

    await rageClick(deleteButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await deleteButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Accounts list row "Delete" opens one confirm popup, not stacked', async ({ page, request }) => {
    const email = `rage-delrow-${generateId(8)}@test.local`
    const api = new ApiEndpoint(request)
    await api.createAccount(email, '1234', 'Rage', 'DelRow')

    await openAdminTab(page, 'accounts')
    // "Delete" rows are hidden until "Enable deletion" is checked.
    await page.locator('span:has-text("Enable deletion") + .checkbox-container').click()
    await page.locator('[data-testid="account-search-container"] input').fill(email)
    await page.keyboard.press('Enter')
    const row = page.locator('tr', { hasText: email })
    await expect(row).toHaveCount(1, { timeout: 10000 })

    const deleteButton = row.getByRole('button', { name: 'Delete', exact: true })
    const otp = otpPopup(page)

    await rageClick(deleteButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await deleteButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })
})
