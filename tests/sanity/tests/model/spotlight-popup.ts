import { type Locator, type Page, expect } from '@playwright/test'
import { CommonPage } from './common-page'
import { StatusBar } from './statusbar'

export class SpotlightPopup extends CommonPage {
  readonly page: Page
  readonly statusbar: StatusBar

  constructor (page: Page) {
    super(page)
    this.page = page
    this.statusbar = new StatusBar(page)
  }

  popup = (): Locator => this.page.locator('div.popup')
  input = (): Locator => this.popup().locator('input')
  searchResult = (search: string): Locator => this.popup().locator('div.list-item', { hasText: search })

  async open (): Promise<void> {
    const visible = await this.popup().isVisible()
    if (visible) {
      await this.close()
    }
    // The click has no timeout of its own, so a workbench that is still booting - a workspace
    // created moments ago takes a while - turns into a bare "waiting for locator" at the test
    // timeout. Wait for the button explicitly so the failure says which part was slow.
    await expect(this.statusbar.buttonSearch()).toBeVisible({ timeout: 30000 })
    await this.statusbar.clickButtonSearch()
    await expect(this.popup()).toBeVisible()
    await expect(this.input()).toBeVisible()
  }

  async close (): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.popup()).not.toBeVisible()
  }

  async fillSearchInput (search: string): Promise<void> {
    await this.input().fill(search)
    await expect(this.input()).toHaveValue(search)
    await this.page.waitForTimeout(500)
  }

  async checkSearchResult (search: string, count: number, timeoutMs: number = 30000): Promise<void> {
    // Full-text indexing is async, so we need to retry with increased timeout
    await expect(this.searchResult(search)).toHaveCount(count, { timeout: timeoutMs })
  }
}
