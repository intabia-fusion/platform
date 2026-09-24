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
  readonly results = (): Locator => this.page.locator('div.panel div.row')
  readonly result = (text: string): Locator => this.results().filter({ hasText: text })
  readonly summary = (): Locator => this.page.locator('div.panel div.summary')

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

  // The search is one-shot, so a message indexed after it ran never turns up on its own: retyping
  // re-issues the query, while Enter would open a row whenever the list is not empty.
  async checkResultExists (text: string): Promise<void> {
    await retry(async () => {
      if (await this.result(text).isVisible()) return
      await this.inputSearch().fill('')
      await this.inputSearch().fill(text)
      // Debounce is 500ms, then the request itself.
      await expect(this.result(text)).toBeVisible({ timeout: 2000 })
    })
  }

  async checkNoResults (): Promise<void> {
    await retry(async () => {
      await expect(this.emptyState()).toBeVisible({ timeout: 1000 })
    })
  }

  async clickResult (text: string): Promise<void> {
    await this.result(text).first().click()
  }
}
