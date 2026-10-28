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

import { expect, type Locator, type Page, type Request } from '@playwright/test'
import { test } from '../fixtures'
import { DEV_OTP } from '../API/Billing'
import { LoginPage } from '../model/login-page'
import { PlatformAdmin, rageClick } from '../utils'

// FUSIO-1584: a rage click on an async admin statistics button runs its action once, and the
// button works again after. No storageState override: the admin console logs in as its own
// 'admin' identity, and the default context (no override) starts with no auth token at all.

async function openAdminTab (page: Page, tabId: string): Promise<void> {
  const loginPage = new LoginPage(page)
  await loginPage.gotoAdmin()
  await loginPage.login(PlatformAdmin, '1234')
  await page.getByPlaceholder('Code').fill(DEV_OTP)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator(`[data-id="tab-${tabId}"]`).click()
}

// `profiling` starts false, so "Profile server" renders before /api/v1/profiling answers and is
// swapped for "Profile Stop" right after - read the button state only once that answer is in.
async function openProfiling (page: Page): Promise<void> {
  const loaded = page.waitForResponse((res) => res.url().includes('/api/v1/profiling'))
  await openAdminTab(page, 'statistics')
  await loaded
}

function otpPopup (page: Page): Locator {
  return page.locator('div.popup').filter({ has: page.getByPlaceholder('Code') })
}

// Counts outgoing requests matching a URL fragment while `action` runs, plus a settle window - for
// the two buttons below that fire a raw PUT with no confirm popup to count instead.
async function countRequests (page: Page, urlPart: string, action: () => Promise<void>): Promise<number> {
  let count = 0
  const onRequest = (req: Request): void => {
    if (req.method() === 'PUT' && req.url().includes(urlPart)) count++
  }
  page.on('request', onRequest)
  try {
    await action()
    await page.waitForTimeout(1000)
  } finally {
    page.off('request', onRequest)
  }
  return count
}

test.describe('Rage click: admin statistics', () => {
  // "Set maintenance warning" and "Clear warning" share the one `settingMaintenance` guard
  // (plugins/admin-resources/src/components/statistics/ServerManagerGeneral.svelte) - one test
  // for both buttons covers it.
  test('"Set maintenance warning"/"Clear warning" open one confirm popup, not stacked', async ({ page }) => {
    await openAdminTab(page, 'statistics')
    // "Services" is the default sub-tab; ServerManagerGeneral renders directly on it.
    const setButton = page.getByRole('button', { name: 'Set maintenance warning', exact: true })
    const clearButton = page.getByRole('button', { name: 'Clear warning', exact: true })
    const otp = otpPopup(page)

    await rageClick(setButton)
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)

    await rageClick(clearButton)
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)

    // Button still usable after both bursts.
    await setButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  // No confirm popup here at all - a raw PUT fires straight from the click, guarded only by a
  // boolean. The rage-click proof is the request count, not a popup. `profiling` is real state on
  // the chosen transactor, not reset per test, so each test first drives it to the state it needs.
  test('"Profile server" fires one profile-start request, not three', async ({ page }) => {
    await openProfiling(page)
    const startButton = page.getByRole('button', { name: 'Profile server', exact: true })
    const stopButton = page.getByRole('button', { name: 'Profile Stop', exact: true })
    await expect(startButton.or(stopButton)).toBeVisible({ timeout: 10000 })
    if (await stopButton.isVisible()) {
      // Left running by an earlier run - reset to "not profiling" first.
      await stopButton.click()
      await expect(startButton).toBeVisible({ timeout: 10000 })
    }
    await expect(startButton).toBeEnabled({ timeout: 10000 })

    const count = await countRequests(page, 'operation=profile-start', async () => {
      await rageClick(startButton)
    })
    expect(count).toBe(1)

    // Button usable again - profiling flips the UI to "Profile Stop".
    await expect(stopButton).toBeVisible({ timeout: 10000 })
  })

  test('"Profile Stop" fires one profile-stop request, not three', async ({ page }) => {
    await openProfiling(page)
    const startButton = page.getByRole('button', { name: 'Profile server', exact: true })
    const stopButton = page.getByRole('button', { name: 'Profile Stop', exact: true })
    await expect(startButton.or(stopButton)).toBeVisible({ timeout: 10000 })
    if (await startButton.isVisible()) {
      // Not running yet (e.g. this file's other test hasn't - or already did reset it) - start it.
      await expect(startButton).toBeEnabled({ timeout: 10000 })
      await startButton.click()
      await expect(stopButton).toBeVisible({ timeout: 10000 })
    }

    const count = await countRequests(page, 'operation=profile-stop', async () => {
      await rageClick(stopButton)
    })
    expect(count).toBe(1)

    // Button usable again, and profiling left off for whatever runs next.
    await expect(startButton).toBeVisible({ timeout: 10000 })
  })
})
