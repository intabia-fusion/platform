import { PlatformURI } from '@hcengineering/tests-sanity'
import { expect, type Page } from '@playwright/test'

export class AdminPage {
  readonly page: Page

  constructor (page: Page) {
    this.page = page
  }

  // ACTIONS
  async gotoAdmin (): Promise<void> {
    // login() returns before its own redirect lands; navigating on top of it drops the session and
    // /login/admin bounces back to the login form.
    await this.page.waitForURL(
      (url) => url.pathname.startsWith('/login/selectWorkspace') || url.pathname.startsWith('/workbench/'),
      { timeout: 30000 }
    )
    await (await this.page.goto(`${PlatformURI}/login/admin`))?.finished()
    await this.openAdminSession()
  }

  // Entering /admin asks for a second factor: every admin RPC refuses a token without a fresh mfaAt.
  // The panel renders the code form in place of the tabs until the session is open.
  async openAdminSession (code = '000000'): Promise<void> {
    const codeInput = this.page.locator('input[placeholder="Code"]')
    try {
      await codeInput.waitFor({ state: 'visible', timeout: 10000 })
    } catch {
      return // already inside an open session
    }
    await codeInput.fill(code)
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await this.page.locator('[data-id="tab-workspaces"]').waitFor({ state: 'visible' })
  }

  async openWorkspacesTab (): Promise<void> {
    await this.page.locator('[data-id="tab-workspaces"]').click()
  }

  async openAccountsTab (): Promise<void> {
    await this.page.locator('[data-id="tab-accounts"]').click()
  }

  async searchAccount (query: string): Promise<void> {
    const input = this.page.locator('[data-testid="account-search-container"] input')
    await input.click()
    await input.fill(query)
    await input.press('Enter')
  }

  async deleteAccount (uuid: string, force: boolean = false): Promise<void> {
    await this.page.locator(`[id="${uuid}"]`).getByRole('button', { name: 'Delete', exact: true }).click()
    if (force) {
      await this.toggleDeleteNow()
    }
    await this.confirmOtp()
  }

  // Skips the deferral: the identity is purged as soon as the code is accepted.
  async deleteAccountNow (uuid?: string): Promise<void> {
    await this.page.locator(`[id="${uuid}"]`).getByRole('button', { name: 'Delete now', exact: true }).click()
  }

  async toggleDeleteNow (): Promise<void> {
    await this.page.locator('[data-id="otpConfirmOptional"] .checkbox-container').click()
  }

  async searchWorkspace (uuid: string): Promise<void> {
    const input = this.page.locator('[data-testid="workspace-search-container"] input')
    await input.click()
    await input.fill(uuid)
  }

  // Toggles a filter checkbox by its adjacent label text (e.g. 'Show archived workspaces').
  async toggleFilter (labelText: string): Promise<void> {
    await this.page.getByText(labelText, { exact: true }).locator('xpath=following-sibling::*[1]').first().click()
  }

  async refresh (): Promise<void> {
    await this.page.getByRole('button', { name: 'Refresh' }).click()
  }

  // Opens the workspace details dialog via the third (Details) icon button in the row.
  async openWorkspaceDetails (uuid: string): Promise<void> {
    await this.page.locator(`[id="${uuid}"]`).locator('button').nth(2).click()
  }

  // The list does not auto-refresh during a test; poll Refresh until the row shows `expected`.
  async waitWorkspaceMode (uuid: string, expected: string, timeout = 90000): Promise<void> {
    await expect(async () => {
      await this.refresh()
      const cell = this.page.locator(`[id="${uuid}"]`).getByText(expected, { exact: true }).first()
      await expect(cell).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout })
  }

  // Opens the MigrationRegion ButtonMenu (currently showing `current`) and picks `target`.
  async selectMigrationRegion (current: string, target: string): Promise<void> {
    await this.page.getByRole('button', { name: current, exact: true }).first().click()
    await this.page.getByRole('button', { name: target, exact: true }).first().click()
  }

  // Enters the fixed dev OTP code (ADMIN_OTP_DEV_CODE) and confirms the dialog.
  async confirmOtp (code = '000000'): Promise<void> {
    const codeInput = this.page.locator('input[placeholder="Code"]')
    await codeInput.waitFor({ state: 'visible' })
    await codeInput.fill(code)
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click()
  }
}
