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

import { expect } from '@playwright/test'
import { test } from '../fixtures'
import { UserProfilePage } from '../model/profile/user-profile-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: settings', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('"Add secret" on a webhook endpoint adds exactly one secret, capped at two', async ({ page }) => {
    const userProfilePage = new UserProfilePage(page)
    await userProfilePage.clickSettings()
    await page.locator('#navGroup-setting').getByRole('button', { name: 'API + Webhooks' }).click()
    await page.locator('[data-id="btnAddWebhook"]').click()

    const name = `RageHook${generateId()}`
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('URL').fill(`http://example.com/${generateId()}`)
    await page.getByRole('button', { name: 'Add all' }).click()
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // A freshly created endpoint already carries one secret - rage-clicking "Add secret" must
    // produce exactly a second one, never a third (capped at 2, and addingSecret itself guards
    // the async update while it is in flight).
    const addSecret = page.locator('[data-id="btnAddWebhookSecret"]')
    await expect(addSecret).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.secretRow')).toHaveCount(1)

    await rageClick(addSecret)
    await expect(page.locator('.secretRow')).toHaveCount(2)
    await expect(addSecret).toBeDisabled()
  })

  test('"Send confirmation code" sends exactly one email, and recovers', async ({ page }) => {
    const userProfilePage = new UserProfilePage(page)
    await userProfilePage.clickSettings()
    await page.locator('.title', { hasText: 'Manage identities' }).locator('button').click()
    await page.locator('.popup, .antiPopup, .selectPopup').getByText('Email', { exact: true }).click()

    const email = `rage-${generateId()}@example.com`
    await page.getByPlaceholder('Email').fill(email)

    const addEmailRequests: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && (r.postData() ?? '').includes('"method":"addEmailSocialId"')) {
        addEmailRequests.push(r.url())
      }
    })

    const sendButton = page.getByRole('button', { name: /^Send confirmation/ })
    await rageClick(sendButton)
    // Give a bugged extra request a chance to land before counting.
    await expect(page.getByText('Code has been sent')).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(500)
    expect(addEmailRequests).toHaveLength(1)
  })
})
