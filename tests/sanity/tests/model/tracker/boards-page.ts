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
import { PlatformURI } from '../../utils'

// Task boards: the board page, its settings and the "Boards" section of the tracker navigator.
export class BoardsPage {
  constructor (readonly page: Page) {}

  boardUrl (id: string, settings: boolean = false, tab?: string): string {
    return `${PlatformURI}/workbench/sanity-ws/tracker/boards/${id}${settings ? '/settings' : ''}${tab !== undefined ? `?tab=${tab}` : ''}`
  }

  navSection = (): Locator => this.page.locator('#navGroup-tree-boards')
  navItems = (): Locator => this.page.locator('[data-id="boardsNav"]')
  columns = (): Locator => this.page.locator('[data-id="kanban-column"]')
  wipLimit = (): Locator => this.page.locator('[data-id="kanban-wip-limit"]')
  // Board settings are an item of the header menu
  menuButton = (): Locator => this.page.locator('[data-id="btnIssuesMenu"]')
  settings = (): Locator => this.page.locator('[data-id="boardSettings"]')
  settingsBack = (): Locator => this.page.locator('[data-id="boardSettingsBack"]')
  settingsColumns = (): Locator => this.page.locator('[data-id="boardSettingsColumns"]')
  settingsColumn = (): Locator => this.page.locator('[data-id="boardColumn"]')
  density = (density: string): Locator => this.page.locator(`[data-id="boardDensity-${density}"]`)
  settingsTab = (id: string): Locator => this.page.locator(`[data-id="boardSettings-${id}"]`)
  settingsCard = (): Locator => this.page.locator('[data-id="boardSettingsCard"]')
  settingsGeneral = (): Locator => this.page.locator('[data-id="boardSettingsGeneral"]')
  cardFieldLabel = (field: string): Locator => this.page.locator(`[data-id="boardCardField-${field}"] label`)
  // The density preview of the Card tab: a sample card per density
  preview = (density: string): Locator => this.page.locator(`[data-id="boardDensity-${density}"] .tracker-card`)
  // A radio hides its input behind the label: the click goes to the label
  radio = (dataId: string): Locator =>
    this.page.locator('label').filter({ has: this.page.locator(`input[data-id="${dataId}"]`) })

  radioInput = (dataId: string): Locator => this.page.locator(`input[data-id="${dataId}"]`)
  swimlaneRules = (): Locator => this.page.locator('[data-id="boardRule"]')
  swimlanes = (): Locator => this.page.locator('[data-id="kanban-swimlane"]')
  fullscreenButton = (): Locator => this.page.locator('[data-id="boardFullscreenButton"]')
  quickFilter = (title: string): Locator => this.page.locator('[data-id="boardQuickFilter"]', { hasText: title })

  uncovered = (): Locator => this.page.locator('[data-id="boardUncovered"]')
  uncoveredPopup = (): Locator => this.page.locator('[data-id="boardUncoveredPopup"]')
  uncoveredShow = (): Locator => this.page.locator('[data-id="boardUncoveredShow"]')
  uncoveredAdd = (): Locator => this.page.locator('[data-id="boardUncoveredAdd"]')
  unavailable = (): Locator => this.page.locator('[data-id="boardUnavailableProjects"]')
  filterAdd = (): Locator => this.page.locator('[data-id="boardSettingsGeneral"] [data-id="filterConditionsAdd"]')
  // Filter attributes and the saved lists share this popup menu
  popupItem = (text: string): Locator =>
    this.page.locator('.popup .menu-item', { hasText: new RegExp(`^\\s*${text}\\s*$`) })

  // Marks of the card fields on a card; the presenters carry no data-id, so classes and texts are used
  cardFieldMark (scope: Locator, field: string): Locator {
    switch (field) {
      case 'priority':
        return scope.locator('.card-priority')
      case 'subIssues':
        // The preview issue has two sub-issues
        return scope.locator('button', { hasText: '0/2' })
      case 'dueDate':
        return scope.locator('.datetime-button')
      case 'component':
        return scope.locator('button', { hasText: /^\s*Component\s*$/ })
      case 'milestone':
        return scope.locator('button#milestone')
      case 'labels':
        return scope.locator('.label-box')
      case 'estimation':
        return scope.locator('.card-estimation')
      case 'attachments':
        return scope.locator('.card-counters a')
      case 'comments':
        return scope.locator('.card-counters button')
      default:
        return scope.locator('.parent-label')
    }
  }

  card = (density: string): Locator => this.page.locator(`.tracker-card[data-density="${density}"]`)
  menuItem = (title: string): Locator => this.page.locator('.popup [role^="menuitem"]', { hasText: title })

  async open (id: string): Promise<void> {
    await (await this.page.goto(this.boardUrl(id)))?.finished()
    await this.columns().first().waitFor({ state: 'visible', timeout: 15000 })
  }

  async openSettings (): Promise<void> {
    await this.menuButton().click()
    await this.page.locator('div.hulyPopup-container .hulyPopup-row', { hasText: 'Board settings' }).click()
  }

  createWizard = (): Locator => this.page.locator('[data-id="board-create-wizard"]')
  createFooter = (): Locator => this.createWizard().locator('.dialog__footer-actions')
  createNext = (): Locator =>
    this.createWizard().locator('.dialog__footer-actions').getByRole('button', { name: 'Next', exact: true })

  createSubmit = (): Locator => this.createFooter().getByRole('button', { name: 'Create', exact: true })

  // The plus of the "Boards" section opens the creation wizard; the title is enough to create
  async openCreateWizard (): Promise<void> {
    const plus = this.navSection().locator('xpath=../button[1]')
    await this.navSection().hover()
    await plus.click()
    const item = this.page.getByText('Create board', { exact: true })
    if (await item.isVisible().catch(() => false)) await item.click()
    await expect(this.createWizard()).toBeVisible()
  }

  async createFromNavigator (title: string): Promise<void> {
    await this.openCreateWizard()
    await this.page.locator('#board-create-title').fill(title)
    await this.createSubmit().click()
  }
}
