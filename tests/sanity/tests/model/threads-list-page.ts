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

export class ThreadsListPage extends CommonPage {
  constructor (readonly page: Page) {
    super(page)
  }

  readonly navItem = (): Locator => this.page.locator('.hulyNavItem-container').getByText('Threads', { exact: true })

  readonly thread = (parent: string): Locator => this.page.locator('.activityMessage', { hasText: parent })
  readonly repliesCount = (parent: string): Locator => this.thread(parent).locator('.thread__replies-count')
  readonly lastReply = (parent: string): Locator => this.thread(parent).locator('.thread__last-reply')
  // The chat the message comes from, next to its author.
  readonly chatLabel = (text: string): Locator => this.thread(text).locator('.header .reference')
  readonly savedNavItem = (): Locator => this.page.locator('.hulyNavItem-container').getByText('Saved', { exact: true })

  async open (): Promise<void> {
    await this.navItem().click()
    await expect(this.page.locator('.hulyHeader-container', { hasText: 'Threads' })).toBeVisible()
  }

  /** Scroll offset of the list and how far it can still go down. */
  async scrollState (): Promise<{ top: number, room: number }> {
    return await this.page
      .locator('.activityMessage')
      .first()
      .evaluate((el) => {
        let node: HTMLElement | null = el.parentElement
        while (node !== null && node.scrollHeight <= node.clientHeight) node = node.parentElement
        if (node === null) return { top: 0, room: 0 }
        return { top: node.scrollTop, room: node.scrollHeight - node.clientHeight - node.scrollTop }
      })
  }

  /** Position of a thread's row in the list, counting rows not rendered yet (they are lazy). */
  async rowIndex (parent: string): Promise<number> {
    return await this.thread(parent).evaluate((el) => {
      const row = el.closest('.container')
      if (row?.parentElement == null) return -1
      return [...row.parentElement.children].filter((it) => it.classList.contains('container')).indexOf(row)
    })
  }

  /** Top to bottom, as given; waits for the live query to catch up. */
  async checkOrder (parents: string[]): Promise<void> {
    await expect(async () => {
      const ys: number[] = []
      for (const parent of parents) {
        const box = await this.thread(parent).boundingBox()
        if (box === null) throw new Error(`Thread "${parent}" is not on the list`)
        ys.push(box.y)
      }
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i - 1], `"${parents[i - 1]}" above "${parents[i]}"`).toBeLessThan(ys[i])
      }
    }).toPass()
  }
}
