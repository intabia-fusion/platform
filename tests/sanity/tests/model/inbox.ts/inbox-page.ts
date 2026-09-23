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
  readonly notificationCard = (): Locator =>
    this.page.getByRole('listbox', { name: 'Inbox notifications' }).locator('div.card')

  // ACTIONS

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
      await expect(this.inboxChat(text)).not.toBeVisible()
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
