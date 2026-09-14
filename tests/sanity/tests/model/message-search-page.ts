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
import { CommonPage } from './common-page'
import { retry } from '../retry'

/**
 * Message search, both of its shapes: the Browser page that searches every channel, and the
 * overlay a channel or a direct opens over its own conversation.
 */
export class MessageSearchPage extends CommonPage {
  readonly page: Page

  constructor (page: Page) {
    super(page)
    this.page = page
  }

  readonly browserTab = (): Locator => this.page.getByRole('link', { name: 'Browser' })
  readonly buttonChannelSearch = (): Locator => this.page.locator('[data-id="channel-search"]')
  readonly inputSearch = (): Locator => this.page.locator('.header-search input')
  readonly panel = (): Locator => this.page.locator('div.panel')
  readonly summary = (): Locator => this.page.locator('div.summary')
  readonly results = (): Locator => this.page.locator('div.panel div.row')
  readonly result = (text: string): Locator => this.results().filter({ hasText: text })

  readonly emptyState = (): Locator => this.page.getByText('No results')

  // ACTIONS

  async openBrowser (): Promise<void> {
    await this.browserTab().click()
    await expect(this.inputSearch()).toBeVisible()
  }

  async openChannelSearch (): Promise<void> {
    await this.buttonChannelSearch().click()
    await expect(this.inputSearch()).toBeVisible()
  }

  async closeChannelSearch (): Promise<void> {
    await this.buttonChannelSearch().click()
    await expect(this.inputSearch()).toBeHidden()
  }

  async search (text: string): Promise<void> {
    await this.inputSearch().fill(text)
  }

  /**
   * Indexing is asynchronous, so a message that was just sent is not searchable the instant the
   * request returns. Everything that asserts on a result has to be retried rather than awaited
   * once - the debounce alone is 500ms, and the indexer adds its own lag.
   */
  async checkResultExists (text: string): Promise<void> {
    await retry(async () => {
      await expect(this.result(text)).toBeVisible({ timeout: 1000 })
    })
  }

  async checkNoResults (): Promise<void> {
    await retry(async () => {
      await expect(this.emptyState()).toBeVisible({ timeout: 1000 })
    })
  }

  async checkResultCount (count: number): Promise<void> {
    await retry(async () => {
      await expect(this.results()).toHaveCount(count, { timeout: 1000 })
    })
  }

  async clickResult (text: string): Promise<void> {
    await this.result(text).first().click()
  }

  async filterByAuthor (name: string): Promise<void> {
    await this.buttonAuthorFilter().click()
    await this.page.locator('.popup input').fill(name)
    await this.page.locator('.popup button', { hasText: name }).first().click()
    await this.page.keyboard.press('Escape')
  }
}
