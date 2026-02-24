import { expect, type Locator } from '@playwright/test'
import { CommonPage } from '../common-page'

export class InboxPage extends CommonPage {
  readonly taskName = (taskName: string): Locator => this.page.getByRole('paragraph').getByTitle(taskName)
  readonly toDoName = (): Locator => this.page.getByRole('paragraph')
  readonly leftSidePanelOpen = (): Locator => this.page.locator('#btnPAside')
  readonly leftSidePanel = (): Locator => this.page.locator('.popupPanel-body__aside')
  readonly leftSidePanelClose = (): Locator => this.page.locator('#btnPClose')
  readonly inboxChat = (text: string): Locator => this.page.getByText(text)
  readonly issueTitle = (issueTitle: string): Locator => this.page.getByText(issueTitle).first()
  readonly menuButton = (): Locator => this.page.locator('[data-id="inbox_menu-button"]')

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
    await expect(this.toDoName()).toContainText(toDoText)
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

  async clearAll (): Promise<void> {
    await this.menuButton().click()
    await this.page.getByRole('button', { name: 'Clear all' }).click()
    await expect(this.page.getByText('Remove all notifications?').nth(0)).toBeVisible()

    await this.page.getByRole('button', { name: 'Ok' }).click()
  }
}
