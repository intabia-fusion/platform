import { expect, type Locator, type Page } from '@playwright/test'
import { PlatformURI } from '../../utils'
import { MilestonesPage } from './milestones-page'

const projectPath = 'tracker%3Aproject%3ADefaultProject'

export type TimelineGrouping = 'No grouping' | 'Assignee' | 'Component'

export class MilestoneTimelinePage extends MilestonesPage {
  // `scope` narrows a locator to the milestone panel; without it the whole page is searched.
  private readonly within = (scope?: Locator): Page | Locator => scope ?? this.page

  viewletButton = (kind: 'List' | 'Table' | 'Timeline'): Locator => this.page.locator(`label[data-view*="${kind}"]`)
  listRow = (milestoneName: string): Locator =>
    this.page.locator('div.listGrid').filter({ has: this.page.locator('a', { hasText: milestoneName }) })

  tabAll = (): Locator => this.page.locator('label[data-id="tab-all"]')

  timeline = (scope?: Locator): Locator => this.within(scope).locator('.timeline-container')

  // `data-key` of a bar is the id of its document (issue or milestone).
  bar = (key: string, scope?: Locator): Locator => this.within(scope).locator(`.component-item[data-key="${key}"]`)

  row = (key: string, scope?: Locator): Locator =>
    this.within(scope)
      .locator('.listGrid')
      .filter({ has: this.page.locator(`.component-item[data-key="${key}"]`) })

  rowHeader = (key: string, scope?: Locator): Locator => this.row(key, scope).locator('.headerWrapper')

  addToMilestoneButton = (milestoneId: string): Locator =>
    this.row(milestoneId).locator('[data-id="btn-milestone-timeline-add"]')

  async openMilestones (): Promise<void> {
    await (await this.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/milestones`))?.finished()
    await this.tabAll().click()
  }

  async openIssues (): Promise<void> {
    await (await this.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    await this.tabAll().click()
  }

  async openIssue (identifier: string): Promise<void> {
    await (await this.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${identifier}`))?.finished()
  }

  async switchViewlet (kind: 'List' | 'Table' | 'Timeline'): Promise<void> {
    await this.viewletButton(kind).click()
    if (kind === 'Timeline') await expect(this.timeline()).toBeVisible()
  }

  async setGrouping (option: TimelineGrouping, scope?: Locator): Promise<void> {
    // A popup left open by a failed step covers the button
    await this.closePopups()
    await this.page.mouse.move(0, 0)
    const viewOptions = this.within(scope).locator('button[data-id="btn-viewOptions"]')
    await (scope !== undefined ? viewOptions.last() : viewOptions).click()
    const grouping = this.page.locator('.antiCard-menu__item', { hasText: 'Grouping' }).locator('button').first()
    await grouping.click()
    await this.page.locator('.menu-item').filter({ hasText: new RegExp(`^\\s*${option}\\s*$`) }).first().click()
    await expect(grouping).toContainText(option)
    await this.page.keyboard.press('Escape')
    await expect(this.page.locator('div.modal-overlay')).toHaveCount(0)
  }

  // Opens the range dropdown and picks an entry: plain SelectPopup rows, not the labelled spans of menus.
  async setRange (label: string): Promise<void> {
    await this.page.locator('[data-id="timeline-range"]').click()
    await this.page
      .locator('div.selectPopup button.menu-item')
      .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
      .click()
    await expect(this.page.locator('[data-id="timeline-range"]')).toContainText(label)
  }

  // The "+" in the milestone bar row: "Select issue" -> multi-select popup -> Add.
  async addExistingIssue (milestoneId: string, issueTitle: string): Promise<void> {
    await this.addToMilestoneButton(milestoneId).click()
    await this.selectFromDropdown(this.page, 'Select issue')
    await this.page.locator('div.selectPopup button.menu-item', { hasText: issueTitle }).first().click()
    await this.page.getByRole('button', { name: 'Add', exact: true }).click()
  }

  /**
   * Drags the bar with page.mouse: `dx` px horizontally, and, when `targetRow` is given, onto that row.
   * Moves in steps because the timeline reads every mousemove while the button is held.
   */
  async dragBar (bar: Locator, dx: number, targetRow?: Locator): Promise<void> {
    // Rows of other tests' milestones can push the bar below the viewport, where the mouse cannot reach it
    await bar.evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
    })
    const box = await bar.boundingBox()
    if (box === null) throw new Error('bar has no bounding box')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    try {
      await this.page.mouse.move(x + (dx < 0 ? -3 : 3), y, { steps: 3 })
      if (targetRow === undefined) {
        await this.page.mouse.move(x + dx, y, { steps: 10 })
      } else {
        // Placeholder rows appear and the layout shifts once the drag starts: re-aim until the app marks the row.
        await expect(async () => {
          const rowBox = await targetRow.boundingBox({ timeout: 2000 })
          if (rowBox === null) throw new Error('target row has no bounding box')
          await this.page.mouse.move(x + dx, rowBox.y + rowBox.height / 2, { steps: 10 })
          await expect(this.page.locator('.listGrid.dropTarget')).toHaveCount(1, { timeout: 1000 })
        }).toPass({ timeout: 8000 })
      }
    } finally {
      await this.page.mouse.up()
    }
  }

  async barLeft (bar: Locator): Promise<number> {
    const box = await bar.boundingBox()
    return box?.x ?? Number.NaN
  }

  // Context menu entries of an issue ("Status", "Assignee" are submenus).
  menuEntry = (label: string): Locator => this.popupSpanLabel(label).first()
}
