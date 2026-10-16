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

import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { generateToken } from '@hcengineering/server-token'
import { createRestClient } from '@hcengineering/api-client'
import { systemAccountUuid, type AccountUuid, type Class, type Doc, type Ref } from '@hcengineering/core'
import path from 'path'
import { ApiEndpoint } from '../API/Api'
import { DEV_OTP, setWorkspacePlanByUuid } from '../API/Billing'
import { LoginPage } from '../model/login-page'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import {
  PlatformAdmin,
  PlatformSetting,
  PlatformURI,
  PlatformUser,
  createAccount,
  createAccountAndWorkspace,
  generateId,
  generateTestData,
  generateUser,
  getInviteLink,
  getSecondPageByInvite,
  rageClick
} from '../utils'

const channelClass = 'chunter:class:Channel' as Ref<Class<Doc>>

// FUSIO-1584: a rage click on an async billing button runs its action once, and the button works
// again after.

const BILLING_URL = process.env.BILLING_URL ?? 'http://localhost:8083/_billing'

// Same machine-admin token the billing pod issues to itself - tests/sanity/tests/billing/billing.spec.ts
// uses the identical pattern to seed/read pool data directly, bypassing the UI.
function getAdminHeaders (): Record<string, string> {
  const token = generateToken(systemAccountUuid, undefined, { service: 'billing', admin: 'true' }, 'secret')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function openAdminTab (page: Page, tabId: string): Promise<void> {
  const loginPage = new LoginPage(page)
  await loginPage.gotoAdmin()
  await loginPage.login(PlatformAdmin, '1234')
  await page.getByPlaceholder('Code').fill(DEV_OTP)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator(`[data-id="tab-${tabId}"]`).click()
}

async function readPurchasedTokens (
  request: APIRequestContext,
  providerId: string,
  model: string
): Promise<number | undefined> {
  const res = await request.get(`${BILLING_URL}/api/v1/admin/pools`, { headers: getAdminHeaders() })
  const pools: Array<{ providerId: string, model: string, purchasedTokens: number }> = await res.json()
  return pools.find((p) => p.providerId === providerId && p.model === model)?.purchasedTokens
}

test.describe('Rage click: admin billing', () => {
  // No storageState override: the admin console logs in as its own 'admin' identity.
  test('ModelsTab "Add tokens" credits the pool exactly once, not three times', async ({ page, request }) => {
    // 'mock'/'mock-model' is the stand's mock AI provider (AiModelRegistry) - safe to top up.
    const providerId = 'mock'
    const model = 'mock-model'
    const baseline = 1000
    // Deterministic baseline, independent of whatever earlier runs left behind.
    await request.post(`${BILLING_URL}/api/v1/admin/pools`, {
      headers: getAdminHeaders(),
      data: { providerId, model, kind: 'purchased', purchasedTokens: baseline, period: 'none' }
    })

    await openAdminTab(page, 'billing')
    const row = page.locator('.model-card', { hasText: `${providerId} / ${model}` })
    await expect(row).toBeVisible({ timeout: 10000 })
    const amountInput = row.locator('input[type="number"]')
    await amountInput.fill('50')
    const addButton = row.getByRole('button', { name: 'Add tokens', exact: true })

    await rageClick(addButton)

    await expect(async () => {
      expect(await readPurchasedTokens(request, providerId, model)).toBe(baseline + 50)
    }).toPass({ timeout: 10000 })

    // Input clears and the button is usable again only once the single request has resolved.
    await expect(amountInput).toHaveValue('0')
    await expect(addButton).toBeEnabled()
  })

  test.describe('Subscriptions plan card', () => {
    test.use({ storageState: PlatformSetting })

    test('"Subscribe" opens one checkout dialog, not stacked', async ({ page, request }) => {
      const data = generateTestData()
      const api = new ApiEndpoint(request)
      // PlatformUser, matching the `storageState: PlatformSetting` above - a workspace for a
      // separate, freshly signed-up account would not be covered by that session.
      const wsInfo = await api.createWorkspaceWithLogin(data.workspaceName, PlatformUser, '1234')
      await setWorkspacePlanByUuid(wsInfo.workspace, 'business', {
        status: 'trialing',
        trialEnd: Date.now() + 14 * 24 * 3600 * 1000,
        users: 10
      })

      await (
        await page.goto(`${PlatformURI}/workbench/${wsInfo.workspaceUrl}/setting/setting/billing/subscriptions`)
      )?.finished()
      await expect(page.locator('[data-id="planCard-business"]')).toBeVisible({ timeout: 20000 })

      const subscribeButton = page.locator('[data-id="planSubscribe-business"]')
      const dialog = page.locator('[data-id="planCheckoutDialog"]')

      await rageClick(subscribeButton)
      await expect(dialog).toHaveCount(1)

      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await subscribeButton.click()
      await expect(dialog).toHaveCount(1)
      await page.keyboard.press('Escape')
    })

    test('LargestSpaces "Join" credits membership exactly once, not three times', async ({
      page,
      request,
      browser
    }) => {
      test.setTimeout(120000)
      const data = generateTestData()
      // `page` (storageState: PlatformSetting) is the workspace owner, and the only member of
      // the private channel below is the second user - so Join on the owner's page is reachable.
      const { ws } = await createAccountAndWorkspace(page, request, data)
      const ownerUuid = ws.account

      const linkText = await getInviteLink(page)
      const secondUser = generateUser()
      await createAccount(request, secondUser)
      using second = await getSecondPageByInvite(browser, linkText, secondUser)
      const secondPage = second.page
      await (await secondPage.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/chunter`))?.finished()

      // A private channel the owner is never added to, with one real uploaded attachment -
      // LargestSpaces only lists spaces that own a real Attachment doc.
      const channelName = `rage-join-${generateId(8)}`
      const chunter = new ChunterPage(secondPage)
      const channelPage = new ChannelPage(secondPage)
      await chunter.createChannel(channelName, true)
      await secondPage.locator('input[type="file"]').first().setInputFiles(path.join(__dirname, '../files/cat2.jpeg'))
      await expect(channelPage.buttonSendMessage()).toBeEnabled({ timeout: 15000 })
      await secondPage.keyboard.press('Enter')
      await expect(secondPage.getByTestId('attachment-image-preview').first()).toBeVisible({ timeout: 15000 })

      if (ws.token === undefined) throw new Error('No workspace token')
      const restClient = createRestClient(ws.endpoint, ws.workspace, ws.token)

      await (await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/setting/setting/billing/files`))?.finished()
      const spaceRow = page.locator('.expandable-header', { hasText: channelName })
      // Top-10-by-size, real attachment data landing on the stats pod - give it room to show up.
      await expect(spaceRow).toBeVisible({ timeout: 30000 })
      const joinButton = spaceRow.getByRole('button', { name: 'Join', exact: true })

      await rageClick(joinButton)

      await expect(async () => {
        const channel = await restClient.findOne(channelClass, { name: channelName })
        const members: AccountUuid[] = (channel as any)?.members ?? []
        expect(members.filter((m) => m === ownerUuid).length).toBe(1)
      }).toPass({ timeout: 15000 })

      // Joined - the space is now expandable and the Join button is gone for good.
      await expect(joinButton).toHaveCount(0)
    })
  })
})
