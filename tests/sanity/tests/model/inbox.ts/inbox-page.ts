import { expect, type Locator } from '@playwright/test'
import { CommonPage } from '../common-page'
import { retryIntervals, waitStable } from '../../retry'

export class InboxPage extends CommonPage {
  readonly taskName = (taskName: string): Locator => this.page.getByRole('paragraph').getByTitle(taskName)
  readonly toDoName = (): Locator => this.page.getByRole('paragraph')
  readonly leftSidePanelOpen = (): Locator => this.page.locator('#btnPAside')
  readonly leftSidePanel = (): Locator => this.page.locator('.popupPanel-body__aside')
  readonly leftSidePanelClose = (): Locator => this.page.locator('#btnPClose')
  readonly inboxChat = (text: string): Locator => this.page.getByText(text)
  readonly issueTitle = (issueTitle: string): Locator => this.page.getByText(issueTitle).first()
  readonly menuButton = (): Locator => this.page.locator('[data-id="inbox_menu-button"]')
  readonly settingsButton = (): Locator => this.page.locator('[data-id="inbox_settings-button"]')
  readonly notificationCard = (): Locator =>
    this.page.getByRole('listbox', { name: 'Inbox notifications' }).locator('div.card')

  readonly cardByTitle = (title: string): Locator =>
    this.notificationCard().filter({ has: this.page.locator(`span.title[title="${title}"]`) })

  readonly threadCard = (channelName: string, parentMessage: string): Locator =>
    this.notificationCard().filter({ hasText: channelName }).filter({ hasText: parentMessage })

  readonly cardUnreadMarker = (title: string): Locator => this.cardByTitle(title).locator('.notifyMarker.primary')
  readonly cardReadCheckbox = (title: string): Locator => this.cardByTitle(title).locator('.checkbox-container')
  readonly cardMenuButton = (title: string): Locator => this.cardByTitle(title).locator('.actions button').last()
  readonly tab = (name: string): Locator => this.page.locator('.tabs').getByText(name, { exact: true })

  // ACTIONS

  async checkUnreadMarker (title: string, count: number | undefined): Promise<void> {
    if (count === undefined) {
      await expect(this.cardUnreadMarker(title)).toHaveCount(0)
    } else {
      await expect(this.cardUnreadMarker(title)).toHaveText(String(count), { timeout: 30000 })
    }
  }

  async checkCardPreview (title: string, textPrefix: string): Promise<void> {
    await expect(this.cardByTitle(title)).toContainText(textPrefix)
  }

  async checkCardExists (title: string, exists: boolean): Promise<void> {
    if (exists) {
      // As long as the badge check: a notification is a round trip through the service.
      await expect(this.cardByTitle(title)).toHaveCount(1, { timeout: 3000 })
    } else {
      await expect(this.cardByTitle(title)).toHaveCount(0)
    }
  }

  async checkThreadCard (channelName: string, parentMessage: string, previewPrefix: string): Promise<void> {
    const card = this.threadCard(channelName, parentMessage)
    await expect(card).toHaveCount(1)
    await expect(card).toContainText(previewPrefix)
  }

  async clickCard (title: string): Promise<void> {
    await this.cardByTitle(title).click()
  }

  async clearCardByCheckbox (title: string): Promise<void> {
    await this.cardByTitle(title).hover()
    await this.cardReadCheckbox(title).click()
  }

  async openCardMenu (title: string): Promise<void> {
    await this.cardByTitle(title).hover()
    await this.cardMenuButton(title).click()
  }

  async selectTab (name: string): Promise<void> {
    await this.tab(name).click()
  }

  private async openLoadedCardMenu (title: string): Promise<void> {
    await this.openCardMenu(title)
    await expect(this.page.locator('.antiPopup button', { hasText: 'Clear' }).first()).toBeVisible()
  }

  async selectCardMenuAction (title: string, action: string): Promise<void> {
    await this.openLoadedCardMenu(title)
    await this.page.locator('.antiPopup button', { hasText: action }).first().click()
  }

  async checkCardMenuHasAction (title: string, action: string, present: boolean): Promise<void> {
    await this.openLoadedCardMenu(title)
    const item = this.page.locator('.antiPopup button', { hasText: action })
    if (present) {
      await expect(item.first()).toBeVisible()
    } else {
      await expect(item).toHaveCount(0)
    }
    await this.pressEscape()
  }

  async checkCardPosition (title: string, index: number): Promise<void> {
    await expect(this.notificationCard().nth(index).locator(`span.title[title="${title}"]`)).toHaveCount(1)
  }

  async checkCardCount (count: number): Promise<void> {
    await expect(this.notificationCard()).toHaveCount(count)
  }

  async checkTabExists (name: string, exists: boolean): Promise<void> {
    if (exists) {
      await expect(this.tab(name)).toBeVisible()
    } else {
      await expect(this.tab(name)).toHaveCount(0)
    }
  }

  async markAllAsRead (): Promise<void> {
    await this.menuButton().click()
    await this.page.getByRole('button', { name: 'Mark all as read' }).click()
  }

  async toggleUnreadsFilter (): Promise<void> {
    await this.settingsButton().click()
    const row = this.page
      .locator('[role="dialog"][aria-label="Inbox settings"] .menu-item')
      .filter({ hasText: 'Unreads' })
    await row.locator('label.toggle-container').click()
    await this.pressEscape()
  }

  async clickOnTask (taskName: string): Promise<void> {
    await this.taskName(taskName).click()
  }

  async clickOnToDo (toDoName: string): Promise<void> {
    await this.toDoName().filter({ hasText: toDoName }).click()
  }

  async clickLeftSidePanelOpen (): Promise<void> {
    await this.leftSidePanelOpen().click()
  }

  async checkLeftSidePanelOpen (): Promise<boolean> {
    return await this.leftSidePanel().isVisible()
  }

  async clickCloseLeftSidePanel (): Promise<void> {
    await this.leftSidePanelClose().click()
  }

  async checkIfTaskIsPresentInInbox (toDoText: string): Promise<void> {
    // Unscoped getByRole('paragraph') now also matches the AI bot's welcome message, so asserting
    // on the whole set is a strict-mode violation. Assert on the paragraph carrying the text.
    await expect(this.toDoName().filter({ hasText: toDoText }).first()).toBeVisible()
  }

  async clickOnInboxChat (text: string): Promise<void> {
    await this.inboxChat(text).click()
  }

  async clickOnInboxFilter (text: string): Promise<void> {
    await this.inboxChat(text).click()
  }

  async checkIfIssueIsPresentInInbox (issueTitle: string): Promise<void> {
    await expect(this.issueTitle(issueTitle)).toBeVisible()
  }

  async clickIssuePresentInInbox (issueTitle: string): Promise<void> {
    await this.issueTitle(issueTitle).click()
  }

  async checkIfInboxChatExists (text: string, exists: boolean): Promise<void> {
    if (exists) {
      await expect(this.inboxChat(text)).toBeVisible()
    } else {
      await expect(this.inboxChat(text)).toHaveCount(0)
    }
  }

  async checkIfTextInChatIsPresent (text: string): Promise<void> {
    await expect(this.inboxChat(text).nth(1)).toBeVisible()
  }

  // Notifications from a fresh join keep landing after the click, so clear until the list stays
  // empty instead of assuming one pass emptied it. Reading zero once is not enough: the server
  // adds the new member to `general` and `random` well after the join, and the notification that
  // produces lands after the clear - the caller then blames whatever it does next.
  async clearAll (): Promise<void> {
    await expect(async () => {
      await this.menuButton().click()
      await this.page.getByRole('button', { name: 'Clear all' }).click()
      await expect(this.page.getByText('Remove all notifications?').nth(0)).toBeVisible()
      await this.page.getByRole('button', { name: 'Ok' }).click()
      const settled = await waitStable(async () => await this.notificationCard().count(), {
        stableFor: 1000,
        interval: 250,
        timeout: 10000
      })
      expect(settled).toBe(0)
    }).toPass({ intervals: retryIntervals, timeout: 60000 })
  }
}
