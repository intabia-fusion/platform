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

import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { DEV_OTP } from '../API/Billing'
import { LoginPage } from '../model/login-page'
import { createAccountWithWorkspace, generateTestData, PlatformAdmin, rageClick } from '../utils'

// FUSIO-1584: a rage click on an async admin workspace button runs its action once (one confirm
// popup, not stacked), and the button works again after. Every workspace here is created fresh
// by the test itself - never sanity-ws - and no test ever types a real OTP code into one of these
// confirm dialogs (only Escape), so none of them can actually archive/delete/migrate anything:
// the server refuses the RPC without a code, and we never give it one except in the one place
// (`scheduleListDeletion`) that deliberately schedules the test's own fresh workspace for deletion
// to reach the "Cancel deletion" state.

async function openAdminTab (page: Page, tabId: string): Promise<void> {
  const loginPage = new LoginPage(page)
  await loginPage.gotoAdmin()
  await loginPage.login(PlatformAdmin, '1234')
  await page.getByPlaceholder('Code').fill(DEV_OTP)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator(`[data-id="tab-${tabId}"]`).click()
}

function otpPopup (page: Page): Locator {
  return page.locator('div.popup').filter({ has: page.getByPlaceholder('Code') })
}

async function createWorkspace (request: APIRequestContext, prefix: string): Promise<string> {
  const data = generateTestData()
  data.workspaceName = `${prefix}-${data.workspaceName}`
  const { ws } = await createAccountWithWorkspace(request, data)
  return ws.workspace
}

// Tests only open a confirm popup and Escape it, so they share workspaces instead of creating one
// each: one plain, one scheduled for deletion. Platform runs a file's tests in one worker in order.
const shared: Record<string, Promise<string>> = {}
async function sharedWorkspace (request: APIRequestContext, prefix: string): Promise<string> {
  shared[prefix] ??= createWorkspace(request, prefix)
  return await shared[prefix]
}

// Search narrows the server-side list to this one row before grouping runs, so "the group" a
// day-range bucket button targets is this workspace alone, never shared/seeded ones.
async function searchWorkspace (page: Page, wsUuid: string): Promise<Locator> {
  await page.locator('[data-testid="workspace-search-container"] input').fill(wsUuid)
  await page.keyboard.press('Enter')
  const row = page.locator(`[id="${wsUuid}"]`)
  await expect(row).toBeVisible({ timeout: 10000 })
  return row
}

// Schedules (not "delete now") the workspace's deletion for real, with the stand's fixed OTP code,
// so the "Cancel deletion" buttons (list row and dialog) have something to cancel. The workspace
// stays active otherwise - scheduling it is reversible and is the whole point of the item next to
// it ("Cancel deletion"), and an abandoned scheduled-delete on a test's own throwaway workspace is
// harmless (it just completes later).
async function scheduleListDeletion (page: Page, wsUuid: string): Promise<Locator> {
  await page.locator('span:has-text("Enable deletion") + .checkbox-container').click()
  const row = await searchWorkspace(page, wsUuid)
  const cancelButton = row.getByRole('button', { name: 'Cancel deletion', exact: true })
  // Already scheduled by an earlier test on the shared workspace.
  if (await cancelButton.isVisible()) return row
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByPlaceholder('Code').fill(DEV_OTP)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(cancelButton).toBeVisible({ timeout: 10000 })
  return row
}

test.describe('Rage click: admin workspaces', () => {
  test('Workspace details "Cancel deletion" opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-wscancel')
    await openAdminTab(page, 'workspaces')
    const row = await scheduleListDeletion(page, wsUuid)

    // Open WorkspaceDetails fresh, after the list reload, so its `workspace` prop carries deleteOn.
    await row.locator('td').first().locator('button').last().click()
    // Scope to the dialog: the list row behind it has its own "Cancel deletion" button too.
    const cancelButton = page.locator('form.antiDialog').getByRole('button', { name: 'Cancel deletion', exact: true })
    await expect(cancelButton).toBeVisible({ timeout: 10000 })
    const otp = otpPopup(page)

    await rageClick(cancelButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await cancelButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Workspace details "Delete" opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-ws')
    await openAdminTab(page, 'workspaces')
    const row = await searchWorkspace(page, wsUuid)
    await row.locator('td').first().locator('button').last().click()

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

  test('Workspace details "View as" (impersonate) opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-ws')
    await openAdminTab(page, 'workspaces')
    const row = await searchWorkspace(page, wsUuid)
    await row.locator('td').first().locator('button').last().click()

    const viewAsButton = page.getByRole('button', { name: 'View as', exact: true }).first()
    const otp = otpPopup(page)

    await rageClick(viewAsButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await viewAsButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('"Reindex all" opens one confirm popup, not stacked', async ({ page }) => {
    await openAdminTab(page, 'workspaces')
    const reindexButton = page.getByRole('button', { name: 'Reindex all', exact: true })
    const otp = otpPopup(page)

    await rageClick(reindexButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await reindexButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('"Mass Archive" on a group of one opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-ws')
    await openAdminTab(page, 'workspaces')
    await searchWorkspace(page, wsUuid)

    const massArchiveButton = page.getByRole('button', { name: /^Mass Archive/ })
    await expect(massArchiveButton).toBeVisible({ timeout: 10000 })
    const otp = otpPopup(page)

    await rageClick(massArchiveButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await massArchiveButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Workspace row "Archive" opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-ws')
    await openAdminTab(page, 'workspaces')
    const row = await searchWorkspace(page, wsUuid)

    const archiveButton = row.getByRole('button', { name: 'Archive', exact: true })
    const otp = otpPopup(page)

    await rageClick(archiveButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await archiveButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Workspace row "Cancel deletion" opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-wscancel')
    await openAdminTab(page, 'workspaces')
    const row = await scheduleListDeletion(page, wsUuid)

    const cancelButton = row.getByRole('button', { name: 'Cancel deletion', exact: true })
    const otp = otpPopup(page)

    await rageClick(cancelButton)
    await expect(otp).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(otp).toHaveCount(0)
    await cancelButton.click()
    await expect(otp).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Workspace row "Delete" opens one confirm popup, not stacked', async ({ page, request }) => {
    const wsUuid = await sharedWorkspace(request, 'rage-ws')
    await openAdminTab(page, 'workspaces')
    await page.locator('span:has-text("Enable deletion") + .checkbox-container').click()
    const row = await searchWorkspace(page, wsUuid)

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
