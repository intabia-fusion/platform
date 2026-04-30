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

import { expect, type Locator } from '@playwright/test'
import { CommonTrackerPage } from './common-tracker-page'

export class KanbanBoardPage extends CommonTrackerPage {
  column (state: string): Locator {
    return this.page.locator(`[data-id="kanban-column"][data-state="${state}"]`)
  }

  swimLane (laneId: string): Locator {
    return this.page.locator(`[data-id="kanban-swimlane"][data-swimlane-id="${laneId}"]`)
  }

  swimLaneHeader (laneId: string): Locator {
    return this.swimLane(laneId).locator('[data-id="kanban-swimlane-header"]')
  }

  swimLaneCell (laneId: string, state: string): Locator {
    return this.page.locator(`[data-id="kanban-swimlane-cell"][data-swimlane-id="${laneId}"][data-state="${state}"]`)
  }

  card (cardId: string): Locator {
    return this.page.locator(`[data-id="kanban-card"][data-card-id="${cardId}"]`)
  }

  async expectCardInColumn (cardId: string, state: string): Promise<void> {
    await expect(this.column(state).locator(`[data-id="kanban-card"][data-card-id="${cardId}"]`)).toBeVisible()
  }

  async expectCardInSwimLaneCell (cardId: string, laneId: string, state: string): Promise<void> {
    await expect(
      this.swimLaneCell(laneId, state).locator(`[data-id="kanban-card"][data-card-id="${cardId}"]`)
    ).toBeVisible()
  }

  async toggleSwimLane (laneId: string): Promise<void> {
    await this.swimLaneHeader(laneId).click()
  }

  async isSwimLaneCollapsed (laneId: string): Promise<boolean> {
    const v = await this.swimLaneHeader(laneId).getAttribute('data-swimlane-collapsed')
    return v === 'true'
  }

  async expectSwimLaneCollapsed (laneId: string, collapsed: boolean): Promise<void> {
    await expect(this.swimLaneHeader(laneId)).toHaveAttribute('data-swimlane-collapsed', collapsed ? 'true' : 'false')
  }

  async dragCardToColumn (cardId: string, targetState: string): Promise<void> {
    // Works in both legacy column and swim-lane modes by picking whichever drop target exists.
    const legacy = this.column(targetState)
    let target
    if ((await legacy.count()) > 0) {
      target = legacy
    } else {
      const cell = this.page.locator(`[data-id="kanban-swimlane-cell"][data-state="${targetState}"]`).first()
      // Prefer dropping onto a card inside the cell — drop handler is more reliable on cards.
      const cardInCell = cell.locator('[data-id="kanban-card"]').first()
      target =
        (await cardInCell.count()) > 0 && (await cardInCell.getAttribute('data-card-id')) !== cardId ? cardInCell : cell
    }
    await target.scrollIntoViewIfNeeded()
    await this.card(cardId).scrollIntoViewIfNeeded()
    await this.card(cardId).dragTo(target)
  }

  async dragCardToSwimLaneCell (cardId: string, laneId: string, targetState: string): Promise<void> {
    const cell = this.swimLaneCell(laneId, targetState)
    await cell.scrollIntoViewIfNeeded()
    await this.card(cardId).scrollIntoViewIfNeeded()
    // Prefer dropping onto an existing card inside the cell — Svelte's drop handler
    // fires reliably on card-container, while empty cells sometimes miss CDP drag.
    const cardInCell = cell.locator('[data-id="kanban-card"]').first()
    const target =
      (await cardInCell.count()) > 0 && (await cardInCell.getAttribute('data-card-id')) !== cardId ? cardInCell : cell
    await this.card(cardId).dragTo(target)
  }

  async dragCardToCard (cardId: string, targetCardId: string): Promise<void> {
    await this.card(cardId).scrollIntoViewIfNeeded()
    await this.card(targetCardId).scrollIntoViewIfNeeded()
    await this.card(cardId).dragTo(this.card(targetCardId))
  }

  async getScrollTop (): Promise<number> {
    return await this.page.evaluate(() => {
      const el = document.querySelector('.kanban-container .scroll, .kanban-content')
      return el != null ? (el as HTMLElement).scrollTop : window.scrollY
    })
  }

  async setSwimLane (
    option: 'None' | 'Assignee' | 'Priority' | 'Component' | 'Milestone' | 'Parent' | 'Project'
  ): Promise<void> {
    await this.page.locator('button[data-id="btn-viewOptions"]').click()
    const swimRow = this.page.locator('.antiCard-menu__item', { hasText: 'Swim lane' })
    await swimRow.waitFor({ state: 'visible', timeout: 5000 })
    await swimRow.locator('button').click()
    const menuItem = this.page.locator('.menu-item').filter({ hasText: new RegExp(`^\\s*${option}\\s*$`) })
    await menuItem.first().click()
    // Close any remaining popups (sub-menu + view-options card).
    await this.page.keyboard.press('Escape')
    await this.page.keyboard.press('Escape')
    if (option === 'None') {
      await this.page.locator('[data-id="kanban-column"]').first().waitFor({ state: 'visible', timeout: 10000 })
    } else {
      await this.page.locator('[data-id="kanban-swimlane"]').first().waitFor({ state: 'visible', timeout: 10000 })
    }
  }

  async expectSwimLaneVisible (laneId: string): Promise<void> {
    await expect(this.swimLane(laneId)).toBeVisible()
  }

  // Click "Show more" in any cell on the board until the requested card is in DOM.
  // Cards beyond the initial limit (3 in swimlane mode) are not rendered until
  // the user expands the cell. Tests that rely on a freshly-created card in a
  // populated lane must reveal it before asserting visibility.
  async revealCard (cardId: string, attempts: number = 20): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      if ((await this.card(cardId).count()) > 0) return
      const showMore = this.page.locator('button[data-id="btn-kanban-show-more"]').first()
      if ((await showMore.count()) === 0) {
        // No more "Show more" buttons left. Wait briefly for live-query to land
        // and check again.
        await this.page.waitForTimeout(300)
        continue
      }
      await showMore.click().catch(() => {})
      await this.page.waitForTimeout(150)
    }
  }

  async swimLanes (): Promise<string[]> {
    return await this.page
      .locator('[data-id="kanban-swimlane"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).getAttribute('data-swimlane-id') ?? '').filter((v) => v !== '')
      )
  }
}
