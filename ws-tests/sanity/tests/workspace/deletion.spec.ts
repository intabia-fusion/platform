import { ApiEndpoint, generateId, LoginPage, SelectWorkspacePage, UserProfilePage } from '@hcengineering/tests-sanity'
import { expect, test, type Page } from '@playwright/test'
import { AdminPage } from '../model/admin.page'

/**
 * Deletion is deferred: both routes - the admin panel and the person themselves - only stamp a
 * deadline. The checks are about the mark being set, taken off, and about the person still being
 * able to sign in while it stands. The admin has one way past the deferral: "Delete now".
 */
test.describe('Workspace and account deletion', () => {
  test('admin schedules a workspace and the account behind it', async ({ page, request }) => {
    // Waits for the workspace service to purge the database.
    test.setTimeout(240000)
    const api: ApiEndpoint = new ApiEndpoint(request)
    const wsId = generateId(5)
    const email = `admin-purge-${wsId}@example.com`

    const created = await api.createAccount(email, '1234', 'Admin', 'Purge')
    const accountUuid: string = created.result.account
    const workspaceInfo = await api.createWorkspaceWithLogin(wsId, email, '1234')

    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('admin', '1234')

    const adminPage = new AdminPage(page)
    await adminPage.gotoAdmin()

    const row = page.locator(`[id="${workspaceInfo.workspace}"]`)

    await test.step('schedule the workspace', async () => {
      await adminPage.openWorkspacesTab()
      // The Delete button lives behind the same "Enable deletion" checkbox as on the Accounts tab.
      await adminPage.toggleFilter('Enable deletion')
      await adminPage.searchWorkspace(workspaceInfo.workspace)
      await row.getByRole('button', { name: 'Delete', exact: true }).click()
      await adminPage.confirmOtp()
      // The deadline replaces the Delete button with the way back.
      await expect(row.getByRole('button', { name: 'Cancel deletion' })).toBeVisible({ timeout: 30000 })
    })

    await test.step('and can call it off', async () => {
      await row.getByRole('button', { name: 'Cancel deletion' }).click()
      await adminPage.confirmOtp()
      await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeVisible({ timeout: 30000 })
    })

    await test.step('delete now skips the deferral', async () => {
      await adminPage.toggleFilter('Show deleted workspaces')
      await row.getByRole('button', { name: 'Delete', exact: true }).click()
      await adminPage.toggleDeleteNow()
      await adminPage.confirmOtp()
      // The purge pipeline has to finish, not stall in pending-deletion.
      await adminPage.waitWorkspaceMode(workspaceInfo.workspace, 'deleted', 150000)
    })

    // Only now: an account that is still the sole owner of a live workspace cannot be marked at all.
    await test.step('mark the account', async () => {
      await adminPage.openAccountsTab()
      await adminPage.toggleFilter('Enable deletion')
      await adminPage.searchAccount(email)
      await adminPage.deleteAccount(accountUuid)
    })

    await test.step('the email still signs in while the mark stands', async () => {
      await expect(api.loginAndGetToken(email, '1234')).resolves.toBeTruthy()
    })

    await test.step('delete now takes the identity right away', async () => {
      await adminPage.deleteAccount(accountUuid, true)
      await expect(page.locator(`[id="${accountUuid}"]`)).toHaveCount(0, { timeout: 30000 })
      await expect(api.loginAndGetToken(email, '1234')).rejects.toThrow()
    })
  })

  test('owner schedules their workspace and then themselves', async ({ page, request }) => {
    const api: ApiEndpoint = new ApiEndpoint(request)
    const wsId = generateId(5)
    const email = `self-purge-${wsId}@example.com`

    await api.createAccount(email, '1234', 'Self', 'Purge')
    await api.createWorkspaceWithLogin(wsId, email, '1234')

    const loginPage = new LoginPage(page)
    const selectWorkspacePage = new SelectWorkspacePage(page)
    const userProfilePage = new UserProfilePage(page)

    await loginPage.goto()
    await loginPage.login(email, '1234')
    await selectWorkspacePage.selectWorkspace(wsId)

    await test.step('the link says what stands in the way while the person still owns a workspace', async () => {
      await userProfilePage.openProfileMenu()
      await userProfilePage.clickSelectWorkspace()
      await page.locator('[data-id="delete-account"]').click()
      await expect(page.getByText('You are the only owner of')).toBeVisible()
      await page.keyboard.press('Escape')
      await selectWorkspacePage.selectWorkspace(wsId)
    })

    await test.step('schedule the workspace from its settings', async () => {
      await userProfilePage.openProfileMenu()
      await userProfilePage.clickSettings()
      await page.getByRole('button', { name: 'General' }).click()
      await page.getByRole('button', { name: 'Delete workspace' }).click()
      await page.getByRole('button', { name: 'Ok', exact: true }).click()
      // Self-service deletion is OTP-gated the same way the admin panel is.
      await adminOtp(page)
      await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 60000 })
    })

    await test.step('schedule the account from the workspace list', async () => {
      const link = page.locator('[data-id="delete-account"]')
      await expect(link).toBeVisible({ timeout: 30000 })
      await link.click()

      const code = page.locator('input[placeholder="Enter code"]')
      await code.waitFor({ state: 'visible' })
      await code.fill('000000')
      await page.locator('.antiCard').getByRole('button', { name: 'Delete account', exact: true }).click()

      await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 60000 })
    })

    await test.step('the email still signs in and is asked about the deletion', async () => {
      await expect(api.loginAndGetToken(email, '1234')).resolves.toBeTruthy()
      await loginPage.login(email, '1234')
      await expect(page.getByText('Account scheduled for deletion')).toBeVisible({ timeout: 30000 })
    })
  })
})

/** The settings dialog reuses the admin OTP form: a fixed dev code on the stand. */
async function adminOtp (page: Page, code = '000000'): Promise<void> {
  const codeInput = page.locator('input[placeholder="Code"]')
  await codeInput.waitFor({ state: 'visible' })
  await codeInput.fill(code)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
}
