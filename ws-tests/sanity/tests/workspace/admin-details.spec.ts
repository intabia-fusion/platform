import { ApiEndpoint, generateId, getSecondPage, LoginPage } from '@hcengineering/tests-sanity'
import { expect, test } from '@playwright/test'
import { AdminPage } from '../model/admin.page'

// Exercises the workspace details dialog admin ops that our refactor introduced:
// URL rename (OTP-gated) and member add via account search (OTP-gated). The stand sets
// ADMIN_OTP_DEV_CODE=000000 so a fixed code is accepted and no email is sent.
test.describe('Workspace admin details tests', () => {
  test('Rename workspace url and add a member from admin details', async ({ browser, request }) => {
    const api: ApiEndpoint = new ApiEndpoint(request)
    const wsId = generateId(5)
    const workspaceInfo = await api.createWorkspaceWithLogin(wsId, 'user1', '1234')

    using adminSecondPage = await getSecondPage(browser)
    const page2 = adminSecondPage.page
    const adminPage = new AdminPage(page2)

    await test.step('login as admin, open details', async () => {
      const loginPage2 = new LoginPage(page2)
      await loginPage2.goto()
      await loginPage2.login('admin', '1234')
      await page2.waitForURL((url) => {
        return url.pathname.startsWith('/login/selectWorkspace') || url.pathname.startsWith('/workbench/')
      })

      await adminPage.gotoAdmin()
      await adminPage.openWorkspacesTab()
      await adminPage.searchWorkspace(workspaceInfo.workspace)
      await adminPage.openWorkspaceDetails(workspaceInfo.workspace)
    })

    const newUrl = `renamed-${wsId}`.toLowerCase()

    await test.step('rename url (OTP-gated)', async () => {
      // The Url row is a flex-row containing the 'Url' label and an Edit button.
      const urlRow = page2.locator('div.flex-row-center').filter({ hasText: 'Url' }).first()
      await urlRow.getByRole('button', { name: 'Edit' }).click()
      const editBox = page2.locator('.edit-inline input')
      await editBox.fill(newUrl)
      await page2.getByRole('button', { name: 'Save' }).click()
      await adminPage.confirmOtp()
      // The dialog updates its local url state immediately after a successful call.
      await expect(page2.getByText(newUrl)).toBeVisible({ timeout: 15000 })
    })

    await test.step('add user2 as a member (OTP-gated)', async () => {
      const search = page2.locator('.email-input input')
      await search.click()
      await search.fill('user2')
      // Pick the first search result option.
      await page2.locator('.member-option').first().click()
      await page2.getByRole('button', { name: 'Add', exact: true }).click()
      await adminPage.confirmOtp()
      // Members table reloads; user2 email should appear.
      await expect(page2.getByText('user2', { exact: false })).toBeVisible({ timeout: 15000 })
    })

    await test.step('change user2 role (OTP-gated)', async () => {
      // user2 row in the Members table: open its role ButtonMenu and pick MAINTAINER.
      const memberRow = page2.locator('tr').filter({ hasText: 'user2' }).first()
      await memberRow.getByRole('button', { name: 'USER', exact: true }).click()
      await page2.locator('.hulyPopup-row').filter({ hasText: 'MAINTAINER' }).first().click()
      await adminPage.confirmOtp()
      // After reload the member row shows the new role.
      await expect(
        page2.locator('tr').filter({ hasText: 'user2' }).getByRole('button', { name: 'MAINTAINER', exact: true })
      ).toBeVisible({ timeout: 15000 })
    })
  })
})
