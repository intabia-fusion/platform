import { type Locator, type Page, expect } from '@playwright/test'
import { CommonPage } from './common-page'
import { StatusBar } from './statusbar'
import { retry } from '../retry'

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
    // The click has no timeout of its own; a still-booting workbench (fresh workspace, takes a
    // while) shows a bare "waiting for locator" - wait for the button to name the slow part.
    await expect(this.statusbar.buttonSearch()).toBeVisible({ timeout: 30000 })
    await this.statusbar.clickButtonSearch()
    await expect(this.popup()).toBeVisible()
    await expect(this.input()).toBeVisible()
  }

  async close (): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.popup()).not.toBeVisible()
  }

  // A workbench that is still settling - a workspace created moments ago - closes the popup again
  // right after `open()` asserted it, and the fill then waits out its timeout on nothing. Reopen.
  async fillSearchInput (search: string): Promise<void> {
    await retry(async () => {
      if (!(await this.popup().isVisible())) await this.open()
      await this.input().fill(search, { timeout: 5000 })
      await expect(this.input()).toHaveValue(search, { timeout: 3000 })
    })
  }

  // Indexing is async and the popup queries only when the input changes, so waiting on the
  // rendered result set never refreshes it - retype the query until the index catches up.
  async checkSearchResult (search: string, count: number, timeoutMs: number = 60000): Promise<void> {
    const query = await this.input().inputValue()
    if (count === 0) {
      // Absence passes at once, before the query was answered; there is no signal for "answered",
      // so a typed query gets a fixed settle. Positive counts below retry on their own.
      if (query !== '') await this.page.waitForTimeout(500)
      await expect(this.searchResult(search)).toHaveCount(0, { timeout: 15000 })
      return
    }
    await expect(async () => {
      await expect(this.searchResult(search))
        .toHaveCount(count, { timeout: 5000 })
        .catch(async (err) => {
          await this.input().fill('')
          await this.input().fill(query)
          throw err
        })
    }).toPass({ intervals: [1000, 2000, 3000], timeout: timeoutMs })
  }
}
